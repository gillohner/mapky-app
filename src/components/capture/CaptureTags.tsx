import { useState } from "react";
import { Tag, Plus, Send, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useGeoCaptureTags } from "@/lib/api/hooks";
import { useAuth } from "@/components/auth/AuthProvider";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { createGeoCaptureTag } from "@/lib/mapky-specs";
import { ingestUserIntoNexus } from "@/lib/nexus/ingest";
import type { PostTagDetails } from "@/types/mapky";

interface CaptureTagsProps {
  authorId: string;
  captureId: string;
}

export function CaptureTags({ authorId, captureId }: CaptureTagsProps) {
  const { data: tags } = useGeoCaptureTags(authorId, captureId);
  const { session, publicKey } = useAuth();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [showInput, setShowInput] = useState(false);
  const [label, setLabel] = useState("");

  const isAuthenticated = !!session && !!publicKey;
  const queryKey = ["mapky", "geo_capture", authorId, captureId, "tags"];

  const handleTag = async (tagLabel: string, removing = false) => {
    if (!session || !publicKey || !tagLabel) return;
    setSubmitting(tagLabel);
    try {
      const result = createGeoCaptureTag(publicKey, authorId, captureId, tagLabel);

      if (removing) {
        await session.storage.delete(result.path as `/pub/${string}`);
      } else {
        await session.storage.putText(result.path as `/pub/${string}`, result.json);
      }

      await queryClient.cancelQueries({ queryKey });

      queryClient.setQueryData<PostTagDetails[]>(queryKey, (old) => {
        if (removing) {
          if (!old) return old;
          return old
            .map((t) =>
              t.label === tagLabel
                ? {
                    ...t,
                    taggers: t.taggers.filter((id) => id !== publicKey),
                    taggers_count: t.taggers_count - 1,
                  }
                : t,
            )
            .filter((t) => t.taggers_count > 0);
        }
        if (!old) return [{ label: tagLabel, taggers: [publicKey], taggers_count: 1 }];
        const existing = old.find((t) => t.label === tagLabel);
        if (existing) {
          if (existing.taggers.includes(publicKey)) return old;
          return old.map((t) =>
            t.label === tagLabel
              ? {
                  ...t,
                  taggers: [...t.taggers, publicKey],
                  taggers_count: t.taggers_count + 1,
                }
              : t,
          );
        }
        return [...old, { label: tagLabel, taggers: [publicKey], taggers_count: 1 }];
      });

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

  return (
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
                ? "border-sky-500/40 bg-sky-500/10 text-sky-700 hover:border-red-400 hover:bg-red-500/10 hover:text-red-500 dark:text-sky-300"
                : isAuthenticated
                  ? "border-border bg-surface text-muted hover:border-sky-500/60 hover:text-sky-600 dark:hover:text-sky-300"
                  : "border-border bg-surface text-muted"
            } ${submitting === tag.label ? "opacity-50" : ""}`}
          >
            <span>{tag.label}</span>
            <span className="text-[10px] opacity-60">{tag.taggers_count}</span>
            <div className="flex -space-x-1">
              {tag.taggers.slice(0, 2).map((t) => (
                <UserAvatar key={t} userId={t} size={5} className="ring-1 ring-background" />
              ))}
            </div>
          </button>
        );
      })}

      {isAuthenticated && !showInput && (
        <button
          type="button"
          onClick={() => setShowInput(true)}
          className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted transition-colors hover:border-sky-500/60 hover:text-sky-600"
        >
          <Tag className="h-3 w-3" />
          <Plus className="h-2.5 w-2.5" />
        </button>
      )}

      {showInput && (
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && normalized) handleTag(normalized);
              if (e.key === "Escape") {
                setShowInput(false);
                setLabel("");
              }
            }}
            placeholder="tag…"
            maxLength={20}
            autoFocus
            className="w-24 rounded border border-border bg-background px-2 py-0.5 text-xs text-foreground placeholder:text-muted focus:border-sky-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => handleTag(normalized)}
            disabled={!normalized || submitting !== null}
            className="rounded p-0.5 text-sky-600 hover:bg-sky-500/10 disabled:opacity-50"
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
}
