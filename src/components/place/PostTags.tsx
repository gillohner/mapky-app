import { useState } from "react";
import { Tag, Plus, Send, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { usePostTags } from "@/lib/api/hooks";
import { useAuth } from "@/components/auth/AuthProvider";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { createPostTag } from "@/lib/mapky-specs";
import { ingestUserIntoNexus } from "@/lib/nexus/ingest";
import { toast } from "sonner";

interface PostTagsProps {
  authorId: string;
  postId: string;
}

export function PostTags({ authorId, postId }: PostTagsProps) {
  const { data: tags } = usePostTags(authorId, postId);
  const { session, publicKey } = useAuth();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [showInput, setShowInput] = useState(false);
  const [label, setLabel] = useState("");

  const isAuthenticated = !!session && !!publicKey;

  const handleTag = async (tagLabel: string) => {
    if (!session || !publicKey || !tagLabel) return;
    setSubmitting(tagLabel);
    try {
      const result = createPostTag(publicKey, authorId, postId, tagLabel);
      await session.storage.putText(result.path as `/pub/${string}`, result.json);
      await ingestUserIntoNexus(publicKey);
      queryClient.invalidateQueries({
        queryKey: ["mapky", "posts", authorId, postId, "tags"],
      });
      toast.success(`Tagged with "${tagLabel}"`);
      setLabel("");
      setShowInput(false);
    } catch {
      toast.error("Failed to add tag");
    } finally {
      setSubmitting(null);
    }
  };

  const normalizedLabel = label.trim().toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      {tags?.map((tag) => {
        const alreadyTagged = publicKey
          ? tag.taggers.includes(publicKey)
          : false;

        return (
          <button
            key={tag.label}
            onClick={() => handleTag(tag.label)}
            disabled={!isAuthenticated || submitting === tag.label || alreadyTagged}
            className={`group inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
              alreadyTagged
                ? "border-accent/30 bg-accent/10 text-accent"
                : isAuthenticated
                  ? "border-border bg-surface text-muted hover:border-accent hover:text-accent"
                  : "border-border bg-surface text-muted"
            } ${submitting === tag.label ? "opacity-50" : ""}`}
            title={tag.taggers.length > 0 ? `Tagged by ${tag.taggers_count} user${tag.taggers_count !== 1 ? "s" : ""}` : ""}
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
          onClick={() => setShowInput(true)}
          className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted transition-colors hover:border-accent hover:text-accent"
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
              if (e.key === "Enter" && normalizedLabel) handleTag(normalizedLabel);
              if (e.key === "Escape") {
                setShowInput(false);
                setLabel("");
              }
            }}
            placeholder="tag..."
            maxLength={20}
            autoFocus
            className="w-20 rounded border border-border bg-background px-1.5 py-0.5 text-[11px] text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
          />
          <button
            onClick={() => handleTag(normalizedLabel)}
            disabled={!normalizedLabel || submitting !== null}
            className="rounded p-0.5 text-accent hover:bg-accent/10 disabled:opacity-50"
          >
            <Send className="h-3 w-3" />
          </button>
          <button
            onClick={() => { setShowInput(false); setLabel(""); }}
            className="rounded p-0.5 text-muted hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
