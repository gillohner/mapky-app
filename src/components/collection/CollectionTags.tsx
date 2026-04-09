import { TagIcon, Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useCollectionTags } from "@/lib/api/hooks";
import { useAuth } from "@/components/auth/AuthProvider";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { createCollectionTag } from "@/lib/mapky-specs";
import { ingestUserIntoNexus } from "@/lib/nexus/ingest";
import { toast } from "sonner";
import { useState } from "react";
import type { PostTagDetails } from "@/types/mapky";

interface CollectionTagsProps {
  authorId: string;
  collectionId: string;
}

export function CollectionTags({ authorId, collectionId }: CollectionTagsProps) {
  const { data, isLoading } = useCollectionTags(authorId, collectionId);
  const { session, publicKey } = useAuth();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState<string | null>(null);

  const handleTagClick = async (label: string) => {
    if (!session || !publicKey) return;
    setSubmitting(label);
    try {
      const result = createCollectionTag(publicKey, authorId, collectionId, label);
      await session.storage.putText(result.path as `/pub/${string}`, result.json);

      // Cancel in-flight fetches so they don't overwrite optimistic data
      await queryClient.cancelQueries({ queryKey: ["mapky", "collection", authorId, collectionId, "tags"] });

      // Optimistic cache update
      queryClient.setQueryData<PostTagDetails[]>(
        ["mapky", "collection", authorId, collectionId, "tags"],
        (old) => {
          if (!old) return old;
          return old.map((t) =>
            t.label === label && !t.taggers.includes(publicKey)
              ? { ...t, taggers: [...t.taggers, publicKey], taggers_count: t.taggers_count + 1 }
              : t,
          );
        },
      );

      toast.success(`Tagged with "${label}"`);

      // Background reconciliation — delay to let server finish indexing
      ingestUserIntoNexus(publicKey).then(() => setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["mapky", "collection", authorId, collectionId, "tags"] });
      }, 5000));
    } catch {
      toast.error("Failed to add tag");
    } finally {
      setSubmitting(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex gap-2 py-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-6 w-16 animate-pulse rounded-full bg-border"
          />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) return null;

  const isAuthenticated = !!session && !!publicKey;
  const sorted = [...data].sort((a, b) => b.taggers_count - a.taggers_count || a.label.localeCompare(b.label));

  return (
    <div className="space-y-2">
      <h4 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        <TagIcon className="h-3.5 w-3.5" />
        Tags
      </h4>
      <div className="space-y-1.5">
        {sorted.map((tag) => {
          const alreadyTagged = publicKey
            ? tag.taggers.includes(publicKey)
            : false;

          return (
            <div
              key={tag.label}
              className="flex items-center justify-between gap-2"
            >
              <button
                onClick={() => handleTagClick(tag.label)}
                disabled={!isAuthenticated || submitting === tag.label || alreadyTagged}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  alreadyTagged
                    ? "border-accent/30 bg-accent/10 text-accent"
                    : isAuthenticated
                      ? "border-border bg-surface text-foreground hover:border-accent hover:text-accent cursor-pointer"
                      : "border-border bg-surface text-foreground"
                } ${submitting === tag.label ? "opacity-50" : ""}`}
              >
                {isAuthenticated && !alreadyTagged && (
                  <Plus className="h-3 w-3" />
                )}
                <span>{tag.label}</span>
                <span className="text-muted">{tag.taggers_count}</span>
              </button>

              <div className="flex -space-x-1.5">
                {tag.taggers.slice(0, 4).map((tagger) => (
                  <UserAvatar
                    key={tagger}
                    userId={tagger}
                    size={6}
                    className="ring-1 ring-background"
                  />
                ))}
                {tag.taggers_count > 4 && (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-surface text-[10px] text-muted ring-1 ring-background">
                    +{tag.taggers_count - 4}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
