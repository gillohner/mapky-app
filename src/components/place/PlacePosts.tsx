import { Star } from "lucide-react";
import { usePlacePosts } from "@/lib/api/hooks";
import { truncatePublicKey } from "@/lib/api/user";
import type { PostDetails } from "@/types/mapky";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { PostTags } from "./PostTags";

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
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


function PostCard({ post }: { post: PostDetails }) {
  return (
    <div className="flex gap-3 rounded-lg p-2 transition-colors hover:bg-surface">
      <UserAvatar userId={post.author_id} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-mono text-xs text-muted">
            {truncatePublicKey(post.author_id, 6)}
          </span>
          <span className="text-xs text-muted">
            {timeAgo(post.indexed_at)}
          </span>
        </div>
        {post.kind === "review" && post.rating != null && (
          <div className="mt-0.5 flex items-center gap-0.5">
            {Array.from({ length: 5 }, (_, i) => {
              const display = post.rating! / 2;
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
            <span className="ml-1 text-xs text-muted">{(post.rating / 2).toFixed(1)}</span>
          </div>
        )}
        {post.content && (
          <p className="mt-1 text-sm text-foreground">{post.content}</p>
        )}
        <PostTags authorId={post.author_id} postId={post.id} />
      </div>
    </div>
  );
}

interface PlacePostsProps {
  osmType: string;
  osmId: number;
}

export function PlacePosts({ osmType, osmId }: PlacePostsProps) {
  const { data: posts, isLoading } = usePlacePosts(osmType, osmId);

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

  if (!posts || posts.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted">
        No posts yet. Be the first to share!
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
}
