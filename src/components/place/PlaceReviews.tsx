import { useState, useCallback } from "react";
import { Star, FileDown, ImageOff, Pencil } from "lucide-react";
import {
  usePlaceFullReviews,
  useResourceReplies,
  useUserProfile,
} from "@/lib/api/hooks";
import { useEnsureIngested } from "@/lib/nexus/use-ensure-ingested";
import { useAuth } from "@/components/auth/AuthProvider";
import { truncatePublicKey, resolveFileUrl } from "@/lib/api/user";
import type { ReviewDetails } from "@/types/mapky";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { MediaViewer, type MediaItem } from "@/components/shared/MediaViewer";
import { ReviewTags } from "./ReviewTags";
import { ReviewForm } from "./ReviewForm";
import { ReplyThread } from "@/components/posts/ReplyThread";

function timeAgo(timestamp: number): string {
  const ms = timestamp < 1e12 ? timestamp * 1000 : timestamp;
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function classifyAttachment(uri: string): MediaItem["type"] {
  const lower = uri.toLowerCase();
  if (/\.(jpe?g|png|gif|webp|avif|svg|bmp|ico)$/i.test(lower)) return "image";
  if (/\.(mp4|webm|mov|avi|mkv|ogv)$/i.test(lower)) return "video";
  if (uri.startsWith("pubky://")) return "image";
  return "other";
}

function Thumbnail({ item, onClick }: { item: MediaItem; onClick: () => void }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className="flex h-20 w-20 items-center justify-center rounded-lg bg-surface ring-1 ring-border"
      >
        <ImageOff className="h-5 w-5 text-muted" />
      </button>
    );
  }
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="overflow-hidden rounded-lg ring-1 ring-border transition-shadow hover:ring-accent"
    >
      {item.type === "image" ? (
        <img
          src={item.url}
          alt=""
          className="h-20 w-20 object-cover"
          loading="lazy"
          onError={useCallback(() => setFailed(true), [])}
        />
      ) : (
        <video
          src={item.url}
          className="h-20 w-20 object-cover"
          muted
          preload="metadata"
          onError={useCallback(() => setFailed(true), [])}
        />
      )}
    </button>
  );
}

function ReviewAttachments({ attachments }: { attachments: string[] }) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const resolved: MediaItem[] = attachments
    .map((uri) => {
      const url = resolveFileUrl(uri);
      if (!url) return null;
      return { url, type: classifyAttachment(uri) } as MediaItem;
    })
    .filter((item): item is MediaItem => item !== null);

  if (resolved.length === 0) return null;
  const images = resolved.filter((r) => r.type === "image" || r.type === "video");
  const files = resolved.filter((r) => r.type === "other");

  return (
    <>
      {images.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {images.map((item, i) => (
            <Thumbnail key={i} item={item} onClick={() => setViewerIndex(i)} />
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {files.map((item, i) => (
            <a
              key={i}
              href={item.url}
              download
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-muted transition-colors hover:border-accent hover:text-accent"
            >
              <FileDown className="h-3 w-3" />
              File {i + 1}
            </a>
          ))}
        </div>
      )}
      {viewerIndex !== null && (
        <MediaViewer
          items={images}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </>
  );
}

function ReviewCard({
  review,
  osmType,
  osmId,
}: {
  review: ReviewDetails;
  osmType: string;
  osmId: number;
}) {
  const { publicKey } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [repliesOpen, setRepliesOpen] = useState(false);
  useEnsureIngested(review.author_id);
  const { data: authorProfile } = useUserProfile(review.author_id);
  const authorName = authorProfile?.name?.trim() || null;
  const isOwner = publicKey === review.author_id;
  const { data: replies } = useResourceReplies(
    "reviews",
    review.author_id,
    review.id,
  );
  const replyCount = replies?.length ?? 0;
  const replyLabel = repliesOpen
    ? `Hide replies (${replyCount})`
    : replyCount > 0
      ? `Show replies (${replyCount})`
      : "Reply";

  if (editOpen) {
    return (
      <ReviewForm
        osmType={osmType}
        osmId={osmId}
        onClose={() => setEditOpen(false)}
        editReview={review}
      />
    );
  }

  return (
    <div className="rounded-lg p-2 transition-colors hover:bg-surface">
      <div className="flex gap-3">
        <UserAvatar userId={review.author_id} size={8} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`truncate text-xs ${
                authorName ? "font-medium text-foreground" : "font-mono text-muted"
              }`}
            >
              {authorName ?? truncatePublicKey(review.author_id, 6)}
            </span>
            <span className="text-xs text-muted">{timeAgo(review.indexed_at)}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-0.5">
            {Array.from({ length: 5 }, (_, i) => {
              const display = review.rating / 2;
              const isFull = i < Math.floor(display);
              const isHalf = !isFull && i < display;
              return (
                <Star
                  key={i}
                  className={`h-3 w-3 ${
                    isFull
                      ? "fill-amber-400 text-amber-400"
                      : isHalf
                        ? "fill-amber-400/50 text-amber-400"
                        : "text-border"
                  }`}
                />
              );
            })}
            <span className="ml-1 text-xs text-muted">
              {(review.rating / 2).toFixed(1)}
            </span>
          </div>
          {review.content && (
            <p className="mt-1 text-sm text-foreground">{review.content}</p>
          )}
          {review.attachments.length > 0 && (
            <ReviewAttachments attachments={review.attachments} />
          )}
          <div className="mt-1 flex items-center gap-3">
            <ReviewTags authorId={review.author_id} reviewId={review.id} />
            {isOwner && (
              <button
                onClick={() => setEditOpen(true)}
                className="flex items-center gap-1 text-[11px] text-muted transition-colors hover:text-accent"
              >
                <Pencil className="h-3 w-3" />
                Edit
              </button>
            )}
            <button
              onClick={() => setRepliesOpen((v) => !v)}
              className="text-[11px] text-muted transition-colors hover:text-accent"
            >
              {replyLabel}
            </button>
          </div>
        </div>
      </div>

      {repliesOpen && (
        <div className="mt-2 ml-11">
          <ReplyThread
            resourceType="reviews"
            authorId={review.author_id}
            resourceId={review.id}
            parentPreview={
              review.content
                ? review.content.slice(0, 60) + (review.content.length > 60 ? "..." : "")
                : `Rated ${(review.rating / 2).toFixed(1)}/5`
            }
          />
        </div>
      )}
    </div>
  );
}

interface PlaceReviewsProps {
  osmType: string;
  osmId: number;
}

export function PlaceReviews({ osmType, osmId }: PlaceReviewsProps) {
  const { data: reviews, isLoading } = usePlaceFullReviews(osmType, osmId);

  if (isLoading) {
    return (
      <div className="space-y-3 py-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3 p-2">
            <div className="h-8 w-8 animate-pulse rounded-full bg-border" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-24 animate-pulse rounded bg-border" />
              <div className="h-4 w-full animate-pulse rounded bg-border" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!reviews || reviews.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted">
        No reviews yet. Be the first!
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {reviews.map((review) => (
        <ReviewCard
          key={`${review.author_id}-${review.id}`}
          review={review}
          osmType={osmType}
          osmId={osmId}
        />
      ))}
    </div>
  );
}
