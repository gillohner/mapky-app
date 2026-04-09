import { useEffect } from "react";
import { X, Star, MessageSquare, MapPin } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/components/auth/AuthProvider";
import { useUserPosts, useOsmLookup } from "@/lib/api/hooks";
import { useUiStore } from "@/stores/ui-store";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { truncatePublicKey } from "@/lib/api/user";
import { parseOsmCanonical } from "@/lib/map/osm-url";
import type { PostDetails } from "@/types/mapky";

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
  const name =
    nominatim?.name ||
    nominatim?.display_name?.split(",")[0] ||
    osmCanonical;
  return <>{name}</>;
}

function MyPostCard({ post }: { post: PostDetails }) {
  const navigate = useNavigate();
  const parsed = parseOsmCanonical(post.osm_canonical);

  const goToPlace = () => {
    if (!parsed) return;
    navigate({
      to: "/place/$osmType/$osmId",
      params: { osmType: parsed.osmType, osmId: String(parsed.osmId) },
      search: { from: "my-posts", thread: `${post.author_id}:${post.id}` },
    });
  };

  return (
    <button
      onClick={goToPlace}
      className="flex w-full gap-3 rounded-lg p-2 text-left transition-colors hover:bg-surface"
    >
      <div className="mt-0.5 flex-shrink-0">
        {post.kind === "review" ? (
          <Star className="h-4 w-4 text-amber-400" />
        ) : (
          <MessageSquare className="h-4 w-4 text-accent" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 truncate text-sm font-medium text-foreground">
            <MapPin className="h-3 w-3 flex-shrink-0 text-muted" />
            <PlaceName osmCanonical={post.osm_canonical} />
          </span>
          <span className="flex-shrink-0 text-xs text-muted">
            {timeAgo(post.indexed_at)}
          </span>
        </div>
        {post.kind === "review" && post.rating != null && (
          <div className="mt-0.5 flex items-center gap-0.5">
            {Array.from({ length: 5 }, (_, i) => {
              const display = post.rating! / 2;
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
              {(post.rating / 2).toFixed(1)}
            </span>
          </div>
        )}
        {post.content && (
          <p className="mt-0.5 line-clamp-2 text-sm text-muted">
            {post.content}
          </p>
        )}
        {post.parent_uri && (
          <span className="mt-0.5 text-[10px] text-muted/60">reply</span>
        )}
      </div>
    </button>
  );
}

export function MyPostsPanel() {
  const navigate = useNavigate();
  const { isAuthenticated, publicKey } = useAuth();
  const { data: posts, isLoading } = useUserPosts(publicKey);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);

  useEffect(() => {
    setSidebarOpen(true);
    return () => setSidebarOpen(false);
  }, [setSidebarOpen]);

  const close = () => navigate({ to: "/" });

  const content = (
    <>
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
      {isAuthenticated && !isLoading && (!posts || posts.length === 0) && (
        <p className="py-8 text-center text-sm text-muted">
          No posts yet. Review and post on places to see them here.
        </p>
      )}
      {posts && posts.length > 0 && (
        <div className="space-y-0.5">
          {posts.map((post) => (
            <MyPostCard key={`${post.author_id}-${post.id}`} post={post} />
          ))}
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className="pointer-events-auto absolute inset-y-0 left-12 z-10 hidden w-[380px] flex-col border-r border-border bg-background shadow-xl md:flex">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            My Posts
          </span>
          <button
            onClick={close}
            className="rounded-lg p-1 text-muted transition-colors hover:bg-surface hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">{content}</div>
      </div>

      {/* Mobile bottom sheet */}
      <div className="pointer-events-auto absolute bottom-0 left-0 right-0 z-10 flex max-h-[85vh] flex-col rounded-t-2xl border-t border-border bg-background shadow-2xl md:hidden">
        <div className="flex-shrink-0 px-4 pt-2 pb-3">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border" />
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">
              My Posts
            </span>
            <button
              onClick={close}
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto border-t border-border px-4 py-3">
          {content}
        </div>
      </div>
    </>
  );
}
