import { useState } from "react";
import { MessageSquarePlus, Star, TagIcon } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { PostForm } from "./PostForm";
import { TagForm } from "./TagForm";

interface PlaceActionsProps {
  osmType: string;
  osmId: number;
}

export function PlaceActions({ osmType, osmId }: PlaceActionsProps) {
  const { isAuthenticated } = useAuth();
  const [formMode, setFormMode] = useState<"review" | "post" | "tag" | null>(null);

  if (formMode === "review" || formMode === "post") {
    return (
      <PostForm
        osmType={osmType}
        osmId={osmId}
        mode={formMode}
        onClose={() => setFormMode(null)}
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

  return (
    <div className="flex gap-2">
      <button
        onClick={() => setFormMode("review")}
        disabled={!isAuthenticated}
        className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-background disabled:text-muted disabled:opacity-50"
        title={isAuthenticated ? "Write a review" : "Sign in to review"}
      >
        <Star className="h-4 w-4" />
        Review
      </button>
      <button
        onClick={() => setFormMode("post")}
        disabled={!isAuthenticated}
        className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-background disabled:text-muted disabled:opacity-50"
        title={isAuthenticated ? "Write a post" : "Sign in to post"}
      >
        <MessageSquarePlus className="h-4 w-4" />
        Post
      </button>
      <button
        onClick={() => setFormMode("tag")}
        disabled={!isAuthenticated}
        className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-background disabled:text-muted disabled:opacity-50"
        title={isAuthenticated ? "Tag this place" : "Sign in to tag"}
      >
        <TagIcon className="h-4 w-4" />
        Tag
      </button>
    </div>
  );
}
