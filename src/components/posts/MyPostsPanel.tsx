import { useMemo } from "react";
import { Star, MessageSquare, MapPin } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  useUserReviews,
  useUserPosts,
  useOsmLookup,
  useOsmLookupBatch,
} from "@/lib/api/hooks";
import { useAutoFocusLayer } from "@/hooks/use-auto-focus-layer";
import { DiscoverSidebar } from "@/components/discover/DiscoverSidebar";
import { parseOsmCanonical } from "@/lib/map/osm-url";
import { resolvePlaceName } from "@/lib/places/place-name";
import type { MapkyPostDetails, ReviewDetails } from "@/types/mapky";

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

function PlaceName({ osmCanonical }: { osmCanonical: string }) {
  const parsed = parseOsmCanonical(osmCanonical);
  const { data: nominatim } = useOsmLookup(
    parsed?.osmType ?? "",
    parsed?.osmId ?? 0,
    !!parsed,
  );
  const name = parsed
    ? resolvePlaceName(parsed.osmType, parsed.osmId, nominatim)
    : osmCanonical;
  return <>{name}</>;
}

function MyReviewCard({ review }: { review: ReviewDetails }) {
  const navigate = useNavigate();
  const parsed = parseOsmCanonical(review.osm_canonical);
  const goToPlace = () => {
    if (!parsed) return;
    navigate({
      to: "/place/$osmType/$osmId",
      params: { osmType: parsed.osmType, osmId: String(parsed.osmId) },
      search: { from: "my-posts" },
    });
  };
  return (
    <button
      onClick={goToPlace}
      className="flex w-full gap-3 rounded-lg p-2 text-left transition-colors hover:bg-surface"
    >
      <div className="mt-0.5 flex-shrink-0">
        <Star className="h-4 w-4 text-amber-400" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 truncate text-sm font-medium text-foreground">
            <MapPin className="h-3 w-3 flex-shrink-0 text-muted" />
            <PlaceName osmCanonical={review.osm_canonical} />
          </span>
          <span className="flex-shrink-0 text-xs text-muted">
            {timeAgo(review.indexed_at)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-0.5">
          {Array.from({ length: 5 }, (_, i) => {
            const display = review.rating / 2;
            return (
              <Star
                key={i}
                className={`h-3 w-3 ${
                  i < Math.floor(display)
                    ? "fill-amber-400 text-amber-400"
                    : i < display
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
          <p className="mt-0.5 line-clamp-2 text-sm text-muted">{review.content}</p>
        )}
      </div>
    </button>
  );
}

function MyPostCard({ post }: { post: MapkyPostDetails }) {
  // Cross-namespace posts don't have an OSM anchor in the row payload; the
  // user's anchor (if any) lives in the `parent_uri`. Surface them as a
  // simple list — clicking goes to a future post detail page; for now we
  // just render the content snippet.
  return (
    <div className="flex w-full gap-3 rounded-lg p-2 text-left">
      <div className="mt-0.5 flex-shrink-0">
        <MessageSquare className="h-4 w-4 text-accent" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {post.parent_uri ? "Reply" : "Post"}
          </span>
          <span className="flex-shrink-0 text-xs text-muted">
            {timeAgo(post.indexed_at)}
          </span>
        </div>
        {post.content && (
          <p className="mt-0.5 line-clamp-2 text-sm text-muted">{post.content}</p>
        )}
      </div>
    </div>
  );
}

export function MyPostsPanel() {
  const navigate = useNavigate();
  const { isAuthenticated, publicKey } = useAuth();
  const { data: reviews, isLoading: reviewsLoading } = useUserReviews(publicKey);
  const { data: posts, isLoading: postsLoading } = useUserPosts(publicKey);

  useAutoFocusLayer("places", { hide: true });

  const lookupRefs = useMemo(() => {
    if (!reviews) return [];
    const seen = new Set<string>();
    const refs: Array<{ osmType: string; osmId: number }> = [];
    for (const r of reviews) {
      const parsed = parseOsmCanonical(r.osm_canonical);
      if (!parsed) continue;
      const k = `${parsed.osmType}:${parsed.osmId}`;
      if (seen.has(k)) continue;
      seen.add(k);
      refs.push({ osmType: parsed.osmType, osmId: parsed.osmId });
    }
    return refs;
  }, [reviews]);
  useOsmLookupBatch(lookupRefs);

  const isLoading = reviewsLoading || postsLoading;
  const isEmpty =
    !isLoading && (!reviews || reviews.length === 0) && (!posts || posts.length === 0);

  return (
    <DiscoverSidebar title="My Posts" onClose={() => navigate({ to: "/" })}>
      {!isAuthenticated && (
        <p className="py-8 text-center text-sm text-muted">
          Sign in to see your posts.
        </p>
      )}
      {isAuthenticated && isLoading && (
        <div className="space-y-3 py-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex gap-3 p-2">
              <div className="h-4 w-4 animate-pulse rounded bg-border" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-32 animate-pulse rounded bg-border" />
                <div className="h-4 w-full animate-pulse rounded bg-border" />
              </div>
            </div>
          ))}
        </div>
      )}
      {isAuthenticated && isEmpty && (
        <p className="py-8 text-center text-sm text-muted">
          No posts yet. Review and post on places to see them here.
        </p>
      )}
      {reviews && reviews.length > 0 && (
        <>
          <h4 className="mb-1 mt-2 text-xs font-medium uppercase tracking-wide text-muted">
            Reviews
          </h4>
          <div className="space-y-0.5">
            {reviews.map((r) => (
              <MyReviewCard key={`${r.author_id}-${r.id}`} review={r} />
            ))}
          </div>
        </>
      )}
      {posts && posts.length > 0 && (
        <>
          <h4 className="mb-1 mt-3 text-xs font-medium uppercase tracking-wide text-muted">
            Posts & replies
          </h4>
          <div className="space-y-0.5">
            {posts.map((p) => (
              <MyPostCard key={`${p.author_id}-${p.id}`} post={p} />
            ))}
          </div>
        </>
      )}
    </DiscoverSidebar>
  );
}
