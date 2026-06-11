import { useState } from "react";
import { MessageSquarePlus, Star } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/AuthProvider";
import { makeOsmUrl } from "@/lib/mapky-specs";
import { registerPending } from "@/lib/api/optimistic-overlay";
import type { MapkyPostDetails, PlaceFullResponse } from "@/types/mapky";
import { ReviewForm } from "./ReviewForm";
import { CommentForm } from "./CommentForm";

interface PlaceActionsProps {
  osmType: string;
  osmId: number;
}

const samePost = (a: MapkyPostDetails, b: MapkyPostDetails) =>
  a.id === b.id && a.author_id === b.author_id;

function upsertPost(posts: MapkyPostDetails[], post: MapkyPostDetails) {
  const existing = posts.some((p) => samePost(p, post));
  return existing
    ? posts.map((p) => (samePost(p, post) ? post : p))
    : [post, ...posts];
}

function emptyPlaceFull(osmType: string, osmId: number): PlaceFullResponse {
  return {
    detail: {
      osm_canonical: makeOsmUrl(osmType, osmId),
      osm_type: osmType,
      osm_id: osmId,
      lat: 0,
      lon: 0,
      geocoded: false,
      review_count: 0,
      avg_rating: 0,
      tag_count: 0,
      photo_count: 0,
      indexed_at: Math.floor(Date.now() / 1000),
      name: null,
    },
    reviews: [],
    posts: [],
    tags: [],
    routes: [],
  };
}

/**
 * Workflow triggers on a place panel. Tagging used to live here too,
 * but it's now handled by the inline `<PlaceTags />` strip's `+` button
 * directly — one tag UI, app-wide. Edit/Delete don't apply since
 * places are public OSM data, and Share lives in the panel header.
 */
export function PlaceActions({ osmType, osmId }: PlaceActionsProps) {
  const { isAuthenticated, publicKey } = useAuth();
  const queryClient = useQueryClient();
  const [formMode, setFormMode] = useState<"review" | "post" | null>(null);

  if (formMode === "review") {
    return (
      <ReviewForm
        osmType={osmType}
        osmId={osmId}
        onClose={() => setFormMode(null)}
      />
    );
  }

  if (formMode === "post") {
    const osmUrl = makeOsmUrl(osmType, osmId);
    return (
      <CommentForm
        parent={osmUrl}
        parentPreview={`About ${osmType}/${osmId}`}
        onClose={() => setFormMode(null)}
        onPosted={(post: MapkyPostDetails) => {
          const placeFullKey = ["mapky", "place-full", osmType, osmId] as const;
          const pendingId = `post:${post.author_id}:${post.id}`;

          registerPending<PlaceFullResponse>(placeFullKey, {
            id: pendingId,
            apply: (data) => ({
              ...data,
              posts: upsertPost(data.posts, post),
            }),
            isConfirmed: (data) =>
              data.posts.some(
                (p) =>
                  samePost(p, post) &&
                  p.content === post.content &&
                  p.attachments.length === post.attachments.length,
              ),
          });

          queryClient.setQueryData<PlaceFullResponse>(placeFullKey, (old) =>
            old ? { ...old } : emptyPlaceFull(osmType, osmId),
          );
          queryClient.setQueryData<MapkyPostDetails[]>(
            ["mapky", "place", osmType, osmId, "posts"],
            (old) => (old ? upsertPost(old, post) : [post]),
          );
          if (publicKey) {
            queryClient.setQueryData<MapkyPostDetails[]>(
              ["mapky", "posts", "user", publicKey],
              (old) => (old ? upsertPost(old, post) : [post]),
            );
          }
        }}
      />
    );
  }

  const btnClass =
    "flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-accent disabled:text-muted disabled:opacity-50";

  return (
    <div className="flex gap-2">
      <button
        onClick={() => setFormMode("review")}
        disabled={!isAuthenticated}
        className={btnClass}
        title={isAuthenticated ? "Write a review" : "Sign in to review"}
      >
        <Star className="h-3.5 w-3.5" />
        Review
      </button>
      <button
        onClick={() => setFormMode("post")}
        disabled={!isAuthenticated}
        className={btnClass}
        title={isAuthenticated ? "Write a post" : "Sign in to post"}
      >
        <MessageSquarePlus className="h-3.5 w-3.5" />
        Post
      </button>
    </div>
  );
}
