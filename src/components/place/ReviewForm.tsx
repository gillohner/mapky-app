import { useState, useRef } from "react";
import { Star, Send, X, ImagePlus, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/AuthProvider";
import { createReview, makeOsmUrl } from "@/lib/mapky-specs";
import { ingestUserIntoNexus } from "@/lib/nexus/ingest";
import { fetchReviewTags } from "@/lib/api/mapky";
import { waitForIndexed } from "@/lib/api/wait-for-indexed";
import { registerPending } from "@/lib/api/optimistic-overlay";
import {
  uploadFile,
  ACCEPTED_IMAGE_TYPES,
  MAX_FILE_SIZE,
  type UploadedFile,
} from "@/lib/pubky/files";
import { toast } from "sonner";
import { resolveFileUrl } from "@/lib/api/user";
import type { ReviewDetails, PlaceDetails, PlaceFullResponse } from "@/types/mapky";

interface ReviewFormProps {
  osmType: string;
  osmId: number;
  onClose: () => void;
  /** Pass an existing review to edit it instead of creating a new one. */
  editReview?: ReviewDetails;
}

interface PendingImage {
  file: File;
  previewUrl: string;
}

const sameReview = (a: ReviewDetails, b: ReviewDetails) =>
  a.id === b.id && a.author_id === b.author_id;

function upsertReview(reviews: ReviewDetails[], review: ReviewDetails) {
  const existing = reviews.some((r) => sameReview(r, review));
  return existing
    ? reviews.map((r) => (sameReview(r, review) ? review : r))
    : [review, ...reviews];
}

function emptyPlaceFull(osmType: string, osmId: number): PlaceFullResponse {
  return {
    detail: {
      osm_canonical: makeOsmUrl(osmType, osmId),
      osm_type: osmType,
      osm_id: osmId,
      lat: 0,
      lon: 0,
      geocoded: false,
      review_count: 0,
      avg_rating: 0,
      tag_count: 0,
      photo_count: 0,
      indexed_at: Math.floor(Date.now() / 1000),
      name: null,
    },
    reviews: [],
    posts: [],
    tags: [],
    routes: [],
  };
}

function patchPlaceFullReview(
  data: PlaceFullResponse,
  review: ReviewDetails,
  previousReview: ReviewDetails | undefined,
  addedPhotos: number,
): PlaceFullResponse {
  const isNew = !previousReview && !data.reviews.some((r) => sameReview(r, review));
  const currentCount = data.detail.review_count;
  const nextCount = isNew ? currentCount + 1 : currentCount;
  const previousRating = previousReview?.rating;
  const nextAvg = previousRating
    ? (data.detail.avg_rating * currentCount - previousRating + review.rating) /
      Math.max(currentCount, 1)
    : isNew
      ? (data.detail.avg_rating * currentCount + review.rating) /
        Math.max(nextCount, 1)
      : data.detail.avg_rating;

  return {
    ...data,
    reviews: upsertReview(data.reviews, review),
    detail: {
      ...data.detail,
      review_count: nextCount,
      avg_rating: nextAvg,
      photo_count: data.detail.photo_count + addedPhotos,
    },
  };
}

export function ReviewForm({ osmType, osmId, onClose, editReview }: ReviewFormProps) {
  const { session, publicKey } = useAuth();
  const queryClient = useQueryClient();
  const [content, setContent] = useState(editReview?.content ?? "");
  const [rating, setRating] = useState<number>(editReview?.rating ?? 0);
  const [hoverRating, setHoverRating] = useState(0);
  const [images, setImages] = useState<PendingImage[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<string[]>(
    editReview?.attachments ?? [],
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSubmit = rating > 0;

  const addImages = (files: FileList | null) => {
    if (!files) return;
    const next: PendingImage[] = [];
    for (const file of Array.from(files)) {
      if (images.length + next.length >= 20) break;
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name} is too large (max 10MB)`);
        continue;
      }
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name} is not an image`);
        continue;
      }
      next.push({ file, previewUrl: URL.createObjectURL(file) });
    }
    setImages((prev) => [...prev, ...next]);
  };

  const removeImage = (i: number) => {
    setImages((prev) => {
      URL.revokeObjectURL(prev[i].previewUrl);
      return prev.filter((_, idx) => idx !== i);
    });
  };

  const handleSubmit = async () => {
    if (!session || !publicKey || !canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      const newAttachments: string[] = [];
      for (const img of images) {
        const uploaded: UploadedFile = await uploadFile(session, publicKey, img.file);
        newAttachments.push(uploaded.fileUri);
      }
      const allAttachments = [...existingAttachments, ...newAttachments];

      const result = createReview(publicKey, osmType, osmId, {
        rating,
        content: content.trim() || undefined,
        attachments: allAttachments.length > 0 ? allAttachments : undefined,
      });

      const writePath = editReview
        ? `/pub/mapky.app/reviews/${editReview.id}`
        : result.path;
      await session.storage.putText(writePath as `/pub/${string}`, result.json);

      await queryClient.cancelQueries({
        queryKey: ["mapky", "place", osmType, osmId, "reviews"],
      });
      await queryClient.cancelQueries({
        queryKey: ["mapky", "place", osmType, osmId],
      });
      await queryClient.cancelQueries({
        queryKey: ["mapky", "place-full", osmType, osmId],
      });
      await queryClient.cancelQueries({
        queryKey: ["mapky", "reviews", "user", publicKey],
      });

      const reviewId = editReview?.id ?? result.path.split("/").pop()!;
      const optimistic: ReviewDetails = {
        id: reviewId,
        author_id: publicKey,
        osm_canonical: makeOsmUrl(osmType, osmId),
        content: content.trim() || null,
        rating,
        attachments: allAttachments,
        indexed_at: editReview?.indexed_at ?? Math.floor(Date.now() / 1000),
      };

      const placeFullKey = ["mapky", "place-full", osmType, osmId] as const;
      const userReviewsKey = ["mapky", "reviews", "user", publicKey] as const;
      const pendingId = `review:${publicKey}:${reviewId}`;
      const reviewConfirmed = (data: PlaceFullResponse) =>
        data.reviews.some(
          (r) =>
            sameReview(r, optimistic) &&
            r.rating === optimistic.rating &&
            r.content === optimistic.content &&
            r.attachments.length === optimistic.attachments.length,
        );

      registerPending<PlaceFullResponse>(placeFullKey, {
        id: pendingId,
        apply: (data) =>
          patchPlaceFullReview(data, optimistic, editReview, newAttachments.length),
        isConfirmed: reviewConfirmed,
      });

      queryClient.setQueryData<PlaceFullResponse>(placeFullKey, (old) =>
        old ? { ...old } : emptyPlaceFull(osmType, osmId),
      );

      queryClient.setQueryData<ReviewDetails[]>(userReviewsKey, (old) =>
        old ? upsertReview(old, optimistic) : [optimistic],
      );

      if (editReview) {
        queryClient.setQueryData<ReviewDetails[]>(
          ["mapky", "place", osmType, osmId, "reviews"],
          (old) =>
            old?.map((r) =>
              r.id === editReview.id && r.author_id === editReview.author_id
                ? optimistic
                : r,
            ),
        );
      } else {
        queryClient.setQueryData<ReviewDetails[]>(
          ["mapky", "place", osmType, osmId, "reviews"],
          (old) => (old ? [optimistic, ...old] : [optimistic]),
        );
        queryClient.setQueryData<PlaceDetails>(
          ["mapky", "place", osmType, osmId],
          (old) =>
            old
              ? {
                  ...old,
                  review_count: old.review_count + 1,
                  photo_count: old.photo_count + newAttachments.length,
                }
              : old,
        );
      }

      toast.success(editReview ? "Review updated" : "Review published");
      for (const img of images) URL.revokeObjectURL(img.previewUrl);
      onClose();

      // Wait until the watcher has indexed the new :MapkyAppReview before
      // refetching the list — otherwise the refetch returns the pre-write
      // snapshot and overwrites the optimistic row. Probe the review's
      // /tags endpoint (404 until indexed). Per-submit closure so rapid
      // back-to-back reviews don't pile up on a single shared timer.
      const writtenId = reviewId;
      ingestUserIntoNexus(publicKey).then(async () => {
        const indexed = await waitForIndexed(
          async () => {
            try {
              await fetchReviewTags(publicKey, writtenId);
              return true;
            } catch {
              return null;
            }
          },
          { intervalMs: 600, timeoutMs: 30_000, initialDelayMs: 800 },
        );
        if (indexed) {
          queryClient.refetchQueries({
            queryKey: ["mapky", "place", osmType, osmId, "reviews"],
            type: "active",
          });
          queryClient.refetchQueries({
            queryKey: ["mapky", "place", osmType, osmId],
            type: "active",
          });
          queryClient.refetchQueries({
            queryKey: ["mapky", "place-full", osmType, osmId],
            type: "active",
          });
          queryClient.refetchQueries({
            queryKey: ["mapky", "reviews", "user", publicKey],
            type: "active",
          });
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-foreground">
          {editReview ? "Edit review" : "Write a review"}
        </h4>
        <button
          onClick={onClose}
          className="rounded p-1 text-muted transition-colors hover:bg-background hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

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

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Share your experience (optional)..."
        rows={3}
        maxLength={5000}
        className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
      />

      {existingAttachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {existingAttachments.map((uri, i) => {
            const url = resolveFileUrl(uri);
            return (
              <div key={uri} className="group relative">
                {url ? (
                  <img src={url} alt="" className="h-16 w-16 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-surface ring-1 ring-border text-[10px] text-muted">file</div>
                )}
                <button
                  onClick={() =>
                    setExistingAttachments((prev) => prev.filter((_, j) => j !== i))
                  }
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-background p-0.5 text-muted shadow-sm ring-1 ring-border opacity-0 group-hover:opacity-100 transition-opacity hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img, i) => (
            <div key={i} className="group relative">
              <img src={img.previewUrl} alt="" className="h-16 w-16 rounded-lg object-cover" />
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
          {submitting ? "Uploading..." : editReview ? "Save" : "Publish"}
        </button>
      </div>
    </div>
  );
}
