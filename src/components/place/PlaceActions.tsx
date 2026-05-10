import { useState } from "react";
import { MessageSquarePlus, Star, FolderHeart } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/AuthProvider";
import { makeOsmUrl } from "@/lib/mapky-specs";
import type { MapkyPostDetails } from "@/types/mapky";
import { ReviewForm } from "./ReviewForm";
import { CommentForm } from "./CommentForm";
import { CollectionPicker } from "@/components/collection/CollectionPicker";

interface PlaceActionsProps {
  osmType: string;
  osmId: number;
}

/**
 * Workflow triggers on a place panel. Tagging used to live here too,
 * but it's now handled by the inline `<PlaceTags />` strip's `+` button
 * directly — one tag UI, app-wide. Edit/Delete don't apply since
 * places are public OSM data, and Share lives in the panel header.
 */
export function PlaceActions({ osmType, osmId }: PlaceActionsProps) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [formMode, setFormMode] =
    useState<"review" | "post" | "collect" | null>(null);

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
          queryClient.setQueryData<MapkyPostDetails[]>(
            ["mapky", "place", osmType, osmId, "posts"],
            (old) => (old ? [post, ...old] : [post]),
          );
        }}
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
      <button
        onClick={() => setFormMode("collect")}
        disabled={!isAuthenticated}
        className={btnClass}
        title={isAuthenticated ? "Add to collection" : "Sign in to collect"}
      >
        <FolderHeart className="h-3.5 w-3.5" />
        Collect
      </button>
    </div>
  );
}
