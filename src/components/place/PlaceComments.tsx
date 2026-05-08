import { useState } from "react";
import { Pencil, Reply } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  usePlaceFullPosts,
  useResourceReplies,
  useUserProfile,
} from "@/lib/api/hooks";
import { useAuth } from "@/components/auth/AuthProvider";
import { truncatePublicKey } from "@/lib/api/user";
import type { MapkyPostDetails } from "@/types/mapky";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { CommentForm } from "./CommentForm";
import { PostTags } from "./PostTags";
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

function CommentCard({ post }: { post: MapkyPostDetails }) {
  const { publicKey } = useAuth();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [repliesOpen, setRepliesOpen] = useState(false);
  const { data: authorProfile } = useUserProfile(post.author_id);
  const authorName = authorProfile?.name?.trim() || null;
  const isOwner = publicKey === post.author_id;
  const { data: replies } = useResourceReplies("posts", post.author_id, post.id);
  const replyCount = replies?.length ?? 0;
  const replyLabel = repliesOpen
    ? `Hide replies (${replyCount})`
    : replyCount > 0
      ? `Show replies (${replyCount})`
      : "Reply";

  if (editOpen) {
    return (
      <CommentForm
        editPost={post}
        onClose={() => setEditOpen(false)}
        onPosted={(updated) => {
          queryClient.setQueryData<MapkyPostDetails[]>(
            // PlacePosts are keyed by ["mapky","place",osmType,osmId,"posts"]
            // — the parent ABOUT edge is server-side. We don't know the
            // osmType/osmId from the post payload alone, so invalidate
            // everything mapky-place to be safe.
            ["mapky"],
            (old) => old,
          );
          queryClient.invalidateQueries({
            queryKey: ["mapky", "place"],
            refetchType: "active",
          });
          // Optimistic merge for the typed entry; the invalidation above
          // will reconcile against the indexer response.
          queryClient.setQueriesData<MapkyPostDetails[]>(
            { queryKey: ["mapky", "place"], type: "active" },
            (old) =>
              Array.isArray(old)
                ? old.map((p) =>
                    p.id === updated.id && p.author_id === updated.author_id
                      ? updated
                      : p,
                  )
                : old,
          );
        }}
      />
    );
  }

  return (
    <div className="rounded-lg p-2 transition-colors hover:bg-surface">
      <div className="flex gap-3">
        <UserAvatar userId={post.author_id} size={8} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`truncate text-xs ${
                authorName ? "font-medium text-foreground" : "font-mono text-muted"
              }`}
            >
              {authorName ?? truncatePublicKey(post.author_id, 6)}
            </span>
            <span className="text-xs text-muted">{timeAgo(post.indexed_at)}</span>
          </div>
          {post.content && (
            <p className="mt-1 text-sm text-foreground">{post.content}</p>
          )}
          <div className="mt-1 flex items-center gap-3">
            <PostTags authorId={post.author_id} postId={post.id} />
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
              className="flex items-center gap-1 text-[11px] text-muted transition-colors hover:text-accent"
            >
              <Reply className="h-3 w-3" />
              {replyLabel}
            </button>
          </div>
        </div>
      </div>

      {repliesOpen && (
        <div className="mt-2 ml-11">
          <ReplyThread
            resourceType="posts"
            authorId={post.author_id}
            resourceId={post.id}
            parentPreview={post.content.slice(0, 60)}
          />
        </div>
      )}
    </div>
  );
}

interface PlaceCommentsProps {
  osmType: string;
  osmId: number;
}

export function PlaceComments({ osmType, osmId }: PlaceCommentsProps) {
  const { data: posts, isLoading } = usePlaceFullPosts(osmType, osmId);

  if (isLoading) {
    return (
      <div className="space-y-3 py-2">
        {[1, 2].map((i) => (
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
        No posts yet. Start the conversation!
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {posts.map((post) => (
        <CommentCard key={`${post.author_id}-${post.id}`} post={post} />
      ))}
    </div>
  );
}
