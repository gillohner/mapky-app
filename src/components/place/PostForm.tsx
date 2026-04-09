import { useState, useRef } from "react";
import { Star, Send, X, ImagePlus, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/AuthProvider";
import { createPost, makeOsmUrl } from "@/lib/mapky-specs";
import { ingestUserIntoNexus } from "@/lib/nexus/ingest";
import {
  uploadFile,
  ACCEPTED_IMAGE_TYPES,
  MAX_FILE_SIZE,
  type UploadedFile,
} from "@/lib/pubky/files";
import { toast } from "sonner";
import type { PostDetails, PlaceDetails } from "@/types/mapky";

interface PostFormProps {
  osmType: string;
  osmId: number;
  mode: "review" | "post";
  onClose: () => void;
  parentUri?: string;
  parentPreview?: string;
}

interface PendingImage {
  file: File;
  previewUrl: string;
}

export function PostForm({ osmType, osmId, mode, onClose, parentUri, parentPreview }: PostFormProps) {
  const { session, publicKey } = useAuth();
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [images, setImages] = useState<PendingImage[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasContent = content.trim().length > 0 || images.length > 0;
  const canSubmit = mode === "review" ? rating > 0 : hasContent;

  const addImages = (files: FileList | null) => {
    if (!files) return;
    const newImages: PendingImage[] = [];
    for (const file of Array.from(files)) {
      if (images.length + newImages.length >= 20) break;
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name} is too large (max 10MB)`);
        continue;
      }
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name} is not an image`);
        continue;
      }
      newImages.push({ file, previewUrl: URL.createObjectURL(file) });
    }
    setImages((prev) => [...prev, ...newImages]);
  };

  const removeImage = (index: number) => {
    setImages((prev) => {
      URL.revokeObjectURL(prev[index].previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSubmit = async () => {
    if (!session || !publicKey || !canSubmit) return;
    setError(null);
    setSubmitting(true);

    try {
      // Upload images first
      const attachments: string[] = [];
      for (const img of images) {
        const uploaded: UploadedFile = await uploadFile(
          session,
          publicKey,
          img.file,
        );
        attachments.push(uploaded.fileUri);
      }

      const result = createPost(publicKey, osmType, osmId, {
        kind: mode,
        content: content.trim() || undefined,
        rating: mode === "review" ? rating : undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
        parent: parentUri,
      });

      await session.storage.putText(result.path as `/pub/${string}`, result.json);

      // Cancel in-flight fetches so they don't overwrite optimistic data
      await queryClient.cancelQueries({ queryKey: ["mapky", "place", osmType, osmId, "posts"] });
      await queryClient.cancelQueries({ queryKey: ["mapky", "place", osmType, osmId] });

      // Optimistic cache update
      const postId = result.path.split("/").pop()!;
      const optimisticPost: PostDetails = {
        id: postId,
        author_id: publicKey,
        osm_canonical: makeOsmUrl(osmType, osmId),
        content: content.trim() || null,
        rating: mode === "review" ? rating : null,
        kind: mode,
        parent_uri: parentUri ?? null,
        attachments,
        indexed_at: Math.floor(Date.now() / 1000),
      };
      queryClient.setQueryData<PostDetails[]>(
        ["mapky", "place", osmType, osmId, "posts", undefined],
        (old) => (old ? [optimisticPost, ...old] : [optimisticPost]),
      );
      queryClient.setQueryData<PlaceDetails>(
        ["mapky", "place", osmType, osmId],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            review_count: mode === "review" ? old.review_count + 1 : old.review_count,
            photo_count: old.photo_count + attachments.length,
          };
        },
      );

      toast.success(mode === "review" ? "Review published" : "Post published");
      // Cleanup preview URLs
      for (const img of images) URL.revokeObjectURL(img.previewUrl);
      onClose();

      // Background reconciliation — delay to let server finish indexing
      ingestUserIntoNexus(publicKey).then(() => setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["mapky", "place", osmType, osmId, "posts"] });
        queryClient.invalidateQueries({ queryKey: ["mapky", "place", osmType, osmId] });
      }, 5000));
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
          {parentUri ? "Reply" : mode === "review" ? "Write a Review" : "Write a Post"}
        </h4>
        <button
          onClick={onClose}
          className="rounded p-1 text-muted transition-colors hover:bg-background hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {parentPreview && (
        <div className="rounded-md border-l-2 border-accent/40 bg-background px-2.5 py-1.5 text-xs text-muted">
          {parentPreview}
        </div>
      )}

      {mode === "review" && (
        <div className="flex items-center gap-0.5">
          {Array.from({ length: 5 }, (_, i) => {
            const starIndex = i + 1;
            const halfValue = starIndex * 2 - 1;
            const fullValue = starIndex * 2;
            const active = hoverRating || rating;
            const isFull = active >= fullValue;
            const isHalf = !isFull && active >= halfValue;

            return (
              <div key={i} className="relative cursor-pointer">
                <button
                  type="button"
                  onClick={() => setRating(halfValue)}
                  onMouseEnter={() => setHoverRating(halfValue)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="absolute inset-y-0 left-0 w-1/2 z-10"
                  aria-label={`${starIndex - 0.5} stars`}
                />
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

      {/* Image previews */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img, i) => (
            <div key={i} className="group relative">
              <img
                src={img.previewUrl}
                alt=""
                className="h-16 w-16 rounded-lg object-cover"
              />
              <button
                onClick={() => removeImage(i)}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-background p-0.5 text-muted shadow-sm ring-1 ring-border opacity-0 group-hover:opacity-100 transition-opacity hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES}
            multiple
            className="hidden"
            onChange={(e) => {
              addImages(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={images.length >= 20}
            className="flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-xs text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
            title="Add images"
          >
            <ImagePlus className="h-3.5 w-3.5" />
            {images.length > 0 && <span>{images.length}</span>}
          </button>
          <span className="text-xs text-muted">{content.length}/5000</span>
        </div>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          {submitting ? "Uploading..." : "Publish"}
        </button>
      </div>
    </div>
  );
}
