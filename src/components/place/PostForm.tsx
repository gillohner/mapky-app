import { useState } from "react";
import { Star, Send, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/AuthProvider";
import { createPost } from "@/lib/mapky-specs";
import { ingestUserIntoNexus } from "@/lib/nexus/ingest";
import { toast } from "sonner";

interface PostFormProps {
  osmType: string;
  osmId: number;
  mode: "review" | "post";
  onClose: () => void;
}

export function PostForm({ osmType, osmId, mode, onClose }: PostFormProps) {
  const { session, publicKey } = useAuth();
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    mode === "review" ? rating > 0 : content.trim().length > 0;

  const handleSubmit = async () => {
    if (!session || !publicKey || !canSubmit) return;
    setError(null);
    setSubmitting(true);

    try {
      const result = createPost(publicKey, osmType, osmId, {
        kind: mode,
        content: content.trim() || undefined,
        rating: mode === "review" ? rating : undefined,
      });

      await session.storage.putText(result.path as `/pub/${string}`, result.json);
      await ingestUserIntoNexus(publicKey);

      // Refresh post list
      queryClient.invalidateQueries({
        queryKey: ["mapky", "place", osmType, osmId, "posts"],
      });

      toast.success(mode === "review" ? "Review published" : "Post published");
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-foreground">
          {mode === "review" ? "Write a Review" : "Write a Post"}
        </h4>
        <button
          onClick={onClose}
          className="rounded p-1 text-muted transition-colors hover:bg-background hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {mode === "review" && (
        <div className="flex items-center gap-0.5">
          {Array.from({ length: 5 }, (_, i) => {
            const starIndex = i + 1;
            const halfValue = starIndex * 2 - 1; // 1,3,5,7,9
            const fullValue = starIndex * 2;      // 2,4,6,8,10
            const active = hoverRating || rating;
            const isFull = active >= fullValue;
            const isHalf = !isFull && active >= halfValue;

            return (
              <div key={i} className="relative cursor-pointer">
                {/* Left half = half star */}
                <button
                  type="button"
                  onClick={() => setRating(halfValue)}
                  onMouseEnter={() => setHoverRating(halfValue)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="absolute inset-y-0 left-0 w-1/2 z-10"
                  aria-label={`${starIndex - 0.5} stars`}
                />
                {/* Right half = full star */}
                <button
                  type="button"
                  onClick={() => setRating(fullValue)}
                  onMouseEnter={() => setHoverRating(fullValue)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="absolute inset-y-0 right-0 w-1/2 z-10"
                  aria-label={`${starIndex} stars`}
                />
                <Star
                  className={`h-6 w-6 ${
                    isFull
                      ? "fill-yellow-400 text-yellow-400"
                      : isHalf
                        ? "fill-yellow-400/50 text-yellow-400"
                        : "text-border"
                  }`}
                />
              </div>
            );
          })}
          {rating > 0 && (
            <span className="ml-2 text-xs text-muted">{(rating / 2).toFixed(1)}/5</span>
          )}
        </div>
      )}

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={
          mode === "review"
            ? "Share your experience (optional)..."
            : "What would you like to share?"
        }
        rows={3}
        maxLength={5000}
        className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
      />

      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">
          {content.length}/5000
        </span>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" />
          {submitting ? "Publishing..." : "Publish"}
        </button>
      </div>
    </div>
  );
}
