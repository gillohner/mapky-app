import { TagIcon, Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { usePlaceTags } from "@/lib/api/hooks";
import { useAuth } from "@/components/auth/AuthProvider";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { createPlaceTag } from "@/lib/mapky-specs";
import { ingestUserIntoNexus } from "@/lib/nexus/ingest";
import { toast } from "sonner";
import { useState } from "react";
import type { PostTagDetails, PlaceDetails } from "@/types/mapky";

interface PlaceTagsProps {
  osmType: string;
  osmId: number;
}

export function PlaceTags({ osmType, osmId }: PlaceTagsProps) {
  const { data, isLoading } = usePlaceTags(osmType, osmId);
  const { session, publicKey } = useAuth();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState<string | null>(null);

  const handleTagClick = async (label: string, alreadyTagged: boolean) => {
    if (!session || !publicKey) return;
    setSubmitting(label);
    try {
      // createPlaceTag uses HashId — same inputs always produce the same path
      const result = createPlaceTag(publicKey, osmType, osmId, label);

      if (alreadyTagged) {
        await session.storage.delete(result.path as `/pub/${string}`);
      } else {
        await session.storage.putText(result.path as `/pub/${string}`, result.json);
      }

      // Cancel in-flight fetches so they don't overwrite optimistic data
      await queryClient.cancelQueries({ queryKey: ["mapky", "place", osmType, osmId, "tags"] });
      await queryClient.cancelQueries({ queryKey: ["mapky", "place", osmType, osmId] });

      // Optimistic cache update
      queryClient.setQueryData<PostTagDetails[]>(
        ["mapky", "place", osmType, osmId, "tags"],
        (old) => {
          if (!old) return old;
          if (alreadyTagged) {
            return old
              .map((t) =>
                t.label === label
                  ? { ...t, taggers: t.taggers.filter((id) => id !== publicKey), taggers_count: t.taggers_count - 1 }
                  : t,
              )
              .filter((t) => t.taggers_count > 0);
          }
          return old.map((t) =>
            t.label === label && !t.taggers.includes(publicKey)
              ? { ...t, taggers: [...t.taggers, publicKey], taggers_count: t.taggers_count + 1 }
              : t,
          );
        },
      );
      queryClient.setQueryData<PlaceDetails>(
        ["mapky", "place", osmType, osmId],
        (old) => (old ? { ...old, tag_count: old.tag_count + (alreadyTagged ? -1 : 1) } : old),
      );

      toast.success(alreadyTagged ? `Removed "${label}" tag` : `Tagged with "${label}"`);

      // Background reconciliation — delay to let server finish indexing
      ingestUserIntoNexus(publicKey).then(() => setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["mapky", "place", osmType, osmId, "tags"] });
        queryClient.invalidateQueries({ queryKey: ["mapky", "place", osmType, osmId] });
      }, 5000));
    } catch {
      toast.error(alreadyTagged ? "Failed to remove tag" : "Failed to add tag");
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

  if (!data || data.length === 0) {
    return null;
  }

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
                onClick={() => handleTagClick(tag.label, alreadyTagged)}
                disabled={!isAuthenticated || submitting === tag.label}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  alreadyTagged
                    ? "border-accent/30 bg-accent/10 text-accent hover:border-red-400 hover:bg-red-500/10 hover:text-red-500 cursor-pointer"
                    : isAuthenticated
                      ? "border-border bg-surface text-foreground hover:border-accent hover:text-accent cursor-pointer"
                      : "border-border bg-surface text-foreground"
                } ${submitting === tag.label ? "opacity-50" : ""}`}
                title={
                  alreadyTagged
                    ? `Click to remove "${tag.label}" tag`
                    : isAuthenticated
                      ? `Click to tag with "${tag.label}"`
                      : "Sign in to tag"
                }
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
