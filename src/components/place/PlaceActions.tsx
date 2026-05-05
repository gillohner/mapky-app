import { useState } from "react";
import { MessageSquarePlus, Star, TagIcon, FolderHeart } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/AuthProvider";
import { makeOsmUrl } from "@/lib/mapky-specs";
import type { MapkyPostDetails } from "@/types/mapky";
import { ReviewForm } from "./ReviewForm";
import { CommentForm } from "./CommentForm";
import { TagForm } from "./TagForm";
import { CollectionPicker } from "@/components/collection/CollectionPicker";

interface PlaceActionsProps {
  osmType: string;
  osmId: number;
}

export function PlaceActions({ osmType, osmId }: PlaceActionsProps) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [formMode, setFormMode] =
    useState<"review" | "post" | "tag" | "collect" | null>(null);

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
    // Place-level post: anchor it to the OSM URL so the plugin creates a
    // (:MapkyAppPost)-[:ABOUT]->(:Place) edge — symmetric with reviews.
    const osmUrl = makeOsmUrl(osmType, osmId);
    return (
      <CommentForm
        parent={osmUrl}
        parentPreview={`About ${osmType}/${osmId}`}
        onClose={() => setFormMode(null)}
        onPosted={(post: MapkyPostDetails) => {
          queryClient.setQueryData<MapkyPostDetails[]>(
            ["mapky", "place", osmType, osmId, "posts"],
            (old) => (old ? [post, ...old] : [post]),
          );
        }}
      />
    );
  }

  if (formMode === "tag") {
    return (
      <TagForm
        osmType={osmType}
        osmId={osmId}
        onClose={() => setFormMode(null)}
      />
    );
  }

  if (formMode === "collect") {
    return (
      <CollectionPicker
        osmType={osmType}
        osmId={osmId}
        onClose={() => setFormMode(null)}
      />
    );
  }

  const btnClass =
    "flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-background disabled:text-muted disabled:opacity-50";

  return (
    <div className="flex gap-2">
      <button
        onClick={() => setFormMode("review")}
        disabled={!isAuthenticated}
        className={btnClass}
        title={isAuthenticated ? "Write a review" : "Sign in to review"}
      >
        <Star className="h-4 w-4" />
        Review
      </button>
      <button
        onClick={() => setFormMode("post")}
        disabled={!isAuthenticated}
        className={btnClass}
        title={isAuthenticated ? "Write a post" : "Sign in to post"}
      >
        <MessageSquarePlus className="h-4 w-4" />
        Post
      </button>
      <button
        onClick={() => setFormMode("tag")}
        disabled={!isAuthenticated}
        className={btnClass}
        title={isAuthenticated ? "Tag this place" : "Sign in to tag"}
      >
        <TagIcon className="h-4 w-4" />
        Tag
      </button>
      <button
        onClick={() => setFormMode("collect")}
        disabled={!isAuthenticated}
        className={btnClass}
        title={isAuthenticated ? "Add to collection" : "Sign in to collect"}
      >
        <FolderHeart className="h-4 w-4" />
        Collect
      </button>
    </div>
  );
}
