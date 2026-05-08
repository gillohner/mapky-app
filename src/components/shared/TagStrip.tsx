import { useState } from "react";
import { Tag, Plus, Send, X, Tag as TagIcon } from "lucide-react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/components/auth/AuthProvider";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { ingestUserIntoNexus } from "@/lib/nexus/ingest";
import { registerPending } from "@/lib/api/optimistic-overlay";
import type { PostTagDetails } from "@/types/mapky";

/**
 * Color palette for a TagStrip instance — chosen at the call site so
 * different resource types stay visually distinct (places, captures,
 * routes, posts, collections). Each maps to ~5 Tailwind utilities applied
 * to the active chip + add-button.
 */
export type TagStripTheme = "accent" | "sky" | "violet";

const THEMES: Record<
  TagStripTheme,
  {
    activeChip: string;
    inactiveChipHover: string;
    addButtonHover: string;
    inputFocus: string;
    sendBtn: string;
  }
> = {
  accent: {
    activeChip:
      "border-accent/40 bg-accent/10 text-accent hover:border-red-400 hover:bg-red-500/10 hover:text-red-500",
    inactiveChipHover: "hover:border-accent hover:text-accent",
    addButtonHover: "hover:border-accent hover:text-accent",
    inputFocus: "focus:border-accent",
    sendBtn: "text-accent hover:bg-accent/10",
  },
  sky: {
    activeChip:
      "border-sky-500/40 bg-sky-500/10 text-sky-700 hover:border-red-400 hover:bg-red-500/10 hover:text-red-500 dark:text-sky-300",
    inactiveChipHover: "hover:border-sky-500/60 hover:text-sky-600 dark:hover:text-sky-300",
    addButtonHover: "hover:border-sky-500/60 hover:text-sky-600",
    inputFocus: "focus:border-sky-500",
    sendBtn: "text-sky-600 hover:bg-sky-500/10",
  },
  violet: {
    activeChip:
      "border-violet-500/40 bg-violet-500/10 text-violet-700 hover:border-red-400 hover:bg-red-500/10 hover:text-red-500 dark:text-violet-300",
    inactiveChipHover: "hover:border-violet-500/60 hover:text-violet-600 dark:hover:text-violet-300",
    addButtonHover: "hover:border-violet-500/60 hover:text-violet-600",
    inputFocus: "focus:border-violet-500",
    sendBtn: "text-violet-600 hover:bg-violet-500/10",
  },
};

export interface TagStripProps {
  /** Tag list returned by the resource's tags endpoint. */
  tags: PostTagDetails[] | undefined;
  /** TanStack Query key used by the calling hook — TagStrip patches it
   *  optimistically and invalidates after server-side reconciliation. */
  queryKey: QueryKey;
  /** Build the tag write — same input always produces the same hashId path. */
  buildTag: (publicKey: string, label: string) => { path: string; json: string };
  /** Visual color family. */
  theme?: TagStripTheme;
  /**
   * "free" — show a "+ tag" input so authenticated users can add new
   * labels (default). "none" — only let users opt into existing labels
   * (used by places, where label discovery happens elsewhere).
   */
  inputMode?: "free" | "none";
  /** Optional section title (renders a header above the chip row). */
  title?: string;
  /** Bumped on parent caches so e.g. PlaceDetails.tag_count stays in sync. */
  onCountDelta?: (delta: 1 | -1) => void;
}

/**
 * Shared tag chip strip — the canonical UI for tagging any Mapky resource.
 * Replaces the per-resource duplicated `*Tags.tsx` components so visual,
 * keyboard, and optimistic-cache behavior stay consistent everywhere.
 */
export function TagStrip({
  tags,
  queryKey,
  buildTag,
  theme = "accent",
  inputMode = "free",
  title,
  onCountDelta,
}: TagStripProps) {
  const { session, publicKey } = useAuth();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [showInput, setShowInput] = useState(false);
  const [label, setLabel] = useState("");
  const t = THEMES[theme];

  const isAuthenticated = !!session && !!publicKey;

  const handleTag = async (tagLabel: string, removing: boolean) => {
    if (!session || !publicKey || !tagLabel) return;
    setSubmitting(tagLabel);
    try {
      const result = buildTag(publicKey, tagLabel);

      if (removing) {
        await session.storage.delete(result.path as `/pub/${string}`);
      } else {
        await session.storage.putText(result.path as `/pub/${string}`, result.json);
      }

      await queryClient.cancelQueries({ queryKey });

      // Pure mutation logic — applied immediately to the cache AND
      // registered as a pending overlay so a stale refetch (issue #7)
      // can't drop the change before nexus catches up.
      const applyAdd = (old: PostTagDetails[] | undefined): PostTagDetails[] => {
        if (!old) return [{ label: tagLabel, taggers: [publicKey], taggers_count: 1 }];
        const existing = old.find((tg) => tg.label === tagLabel);
        if (existing) {
          if (existing.taggers.includes(publicKey)) return old;
          return old.map((tg) =>
            tg.label === tagLabel
              ? {
                  ...tg,
                  taggers: [...tg.taggers, publicKey],
                  taggers_count: tg.taggers_count + 1,
                }
              : tg,
          );
        }
        return [...old, { label: tagLabel, taggers: [publicKey], taggers_count: 1 }];
      };
      const applyRemove = (old: PostTagDetails[] | undefined): PostTagDetails[] | undefined => {
        if (!old) return old;
        return old
          .map((tg) =>
            tg.label === tagLabel
              ? {
                  ...tg,
                  taggers: tg.taggers.filter((id) => id !== publicKey),
                  taggers_count: tg.taggers_count - 1,
                }
              : tg,
          )
          .filter((tg) => tg.taggers_count > 0);
      };

      queryClient.setQueryData<PostTagDetails[]>(queryKey, (old) =>
        removing ? applyRemove(old) : applyAdd(old),
      );

      // Same logical mutation registered as an overlay — re-applied
      // every time the cache is replaced by a refetch, so a stale
      // server response can't strand the user's recent change.
      // Re-registering with the same opId replaces, so toggling on
      // and off doesn't stack two ops.
      const opId = `tag:${publicKey}:${tagLabel}`;
      registerPending<PostTagDetails[] | undefined>(queryKey, {
        id: opId,
        apply: (old) => (removing ? applyRemove(old) : applyAdd(old)),
        isConfirmed: (old) => {
          if (!old) return removing;
          const existing = old.find((tg) => tg.label === tagLabel);
          const hasUser = existing?.taggers.includes(publicKey) ?? false;
          return removing ? !hasUser : hasUser;
        },
      });

      onCountDelta?.(removing ? -1 : 1);

      toast.success(removing ? `Removed "${tagLabel}" tag` : `Tagged with "${tagLabel}"`);
      setLabel("");
      setShowInput(false);

      ingestUserIntoNexus(publicKey).then(() =>
        setTimeout(() => queryClient.invalidateQueries({ queryKey }), 5000),
      );
    } catch {
      toast.error(removing ? "Failed to remove tag" : "Failed to add tag");
    } finally {
      setSubmitting(null);
    }
  };

  const normalized = label.trim().toLowerCase().replace(/\s+/g, "-");

  const sorted = tags
    ? [...tags].sort(
        (a, b) => b.taggers_count - a.taggers_count || a.label.localeCompare(b.label),
      )
    : undefined;

  // Empty state for unauthenticated viewers — render nothing instead of a
  // bare title with no chips.
  if ((!sorted || sorted.length === 0) && (!isAuthenticated || inputMode === "none")) {
    return null;
  }

  const strip = (
    <div className="flex flex-wrap items-center gap-1.5">
      {sorted?.map((tag) => {
        const alreadyTagged = publicKey ? tag.taggers.includes(publicKey) : false;
        return (
          <button
            key={tag.label}
            type="button"
            onClick={() => handleTag(tag.label, alreadyTagged)}
            disabled={!isAuthenticated || submitting === tag.label}
            className={`group inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors ${
              alreadyTagged
                ? t.activeChip
                : isAuthenticated
                  ? `border-border bg-surface text-muted ${t.inactiveChipHover}`
                  : "border-border bg-surface text-muted"
            } ${submitting === tag.label ? "opacity-50" : ""}`}
            title={
              alreadyTagged
                ? `Click to remove "${tag.label}" tag`
                : isAuthenticated
                  ? `Click to tag with "${tag.label}"`
                  : `Tagged by ${tag.taggers_count} user${tag.taggers_count !== 1 ? "s" : ""}`
            }
          >
            <span>{tag.label}</span>
            <span className="text-[10px] opacity-60">{tag.taggers_count}</span>
            <div className="flex -space-x-1">
              {tag.taggers.slice(0, 2).map((id) => (
                <UserAvatar key={id} userId={id} size={5} className="ring-1 ring-background" />
              ))}
            </div>
          </button>
        );
      })}

      {inputMode === "free" && isAuthenticated && !showInput && (
        <button
          type="button"
          onClick={() => setShowInput(true)}
          className={`inline-flex items-center gap-0.5 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted transition-colors ${t.addButtonHover}`}
        >
          <Tag className="h-3 w-3" />
          <Plus className="h-2.5 w-2.5" />
        </button>
      )}

      {inputMode === "free" && showInput && (
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && normalized) handleTag(normalized, false);
              if (e.key === "Escape") {
                setShowInput(false);
                setLabel("");
              }
            }}
            placeholder="tag…"
            maxLength={20}
            autoFocus
            className={`w-24 rounded border border-border bg-background px-2 py-0.5 text-xs text-foreground placeholder:text-muted focus:outline-none ${t.inputFocus}`}
          />
          <button
            type="button"
            onClick={() => handleTag(normalized, false)}
            disabled={!normalized || submitting !== null}
            className={`rounded p-0.5 disabled:opacity-50 ${t.sendBtn}`}
          >
            <Send className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => {
              setShowInput(false);
              setLabel("");
            }}
            className="rounded p-0.5 text-muted hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );

  if (!title) return strip;

  return (
    <div className="space-y-2">
      <h4 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        <TagIcon className="h-3.5 w-3.5" />
        {title}
      </h4>
      {strip}
    </div>
  );
}
