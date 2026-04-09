import { useState, useCallback, useMemo } from "react";
import { Star, FileDown, ImageOff, Reply, MessageSquare, ChevronLeft } from "lucide-react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { usePlacePosts } from "@/lib/api/hooks";
import { useAuth } from "@/components/auth/AuthProvider";
import { truncatePublicKey, resolveFileUrl } from "@/lib/api/user";
import type { PostDetails } from "@/types/mapky";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { MediaViewer, type MediaItem } from "@/components/shared/MediaViewer";
import { PostTags } from "./PostTags";
import { PostForm } from "./PostForm";

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
  const onError = useCallback(() => setFailed(true), []);

  if (failed) {
    return (
      <button onClick={onClick} className="flex h-20 w-20 items-center justify-center rounded-lg bg-surface ring-1 ring-border">
        <ImageOff className="h-5 w-5 text-muted" />
      </button>
    );
  }

  return (
    <button onClick={onClick} className="overflow-hidden rounded-lg ring-1 ring-border transition-shadow hover:ring-accent">
      {item.type === "image" ? (
        <img src={item.url} alt="" className="h-20 w-20 object-cover" loading="lazy" onError={onError} />
      ) : (
        <video src={item.url} className="h-20 w-20 object-cover" muted preload="metadata" onError={onError} />
      )}
    </button>
  );
}

function PostAttachments({ attachments }: { attachments: string[] }) {
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

function makePostUri(authorId: string, postId: string): string {
  return `pubky://${authorId}/pub/mapky.app/posts/${postId}`;
}

function ck(post: PostDetails): string {
  return `${post.author_id}:${post.id}`;
}

function countDescendants(key: string, replyMap: Map<string, PostDetails[]>): number {
  const direct = replyMap.get(key) ?? [];
  let count = direct.length;
  for (const r of direct) count += countDescendants(ck(r), replyMap);
  return count;
}

function parseParentUri(uri: string): string | null {
  const match = uri.match(/^pubky:\/\/([^/]+)\/pub\/mapky\.app\/posts\/(.+)$/);
  if (!match) return null;
  return `${match[1]}:${match[2]}`;
}

// ─── Shared post content rendering ────────────────────────────────────────

function PostContent({
  post,
  osmType,
  osmId,
  depth,
  replyMap,
  onOpenThread,
}: {
  post: PostDetails;
  osmType: string;
  osmId: number;
  depth: number;
  replyMap: Map<string, PostDetails[]>;
  onOpenThread: (key: string) => void;
}) {
  const { isAuthenticated } = useAuth();
  const [replyOpen, setReplyOpen] = useState(false);

  const preview = post.content
    ? post.content.slice(0, 60) + (post.content.length > 60 ? "..." : "")
    : post.kind === "review" ? "Review" : "Post";

  const replyCount = countDescendants(ck(post), replyMap);

  return (
    <>
      <div
        className={`group flex gap-3 rounded-lg p-2 transition-colors hover:bg-surface ${depth > 0 ? "ml-5 border-l-2 border-border pl-2.5" : ""}`}
      >
        <UserAvatar userId={post.author_id} size={depth > 0 ? 6 : 8} />
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
          {post.attachments.length > 0 && (
            <div onClick={(e) => e.stopPropagation()}>
              <PostAttachments attachments={post.attachments} />
            </div>
          )}
          <div className="mt-1 flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <PostTags authorId={post.author_id} postId={post.id} />
            {isAuthenticated && !replyOpen && (
              <button
                onClick={(e) => { e.stopPropagation(); setReplyOpen(true); }}
                className="flex items-center gap-1 text-[11px] text-muted transition-colors hover:text-accent"
              >
                <Reply className="h-3 w-3" />
                Reply
              </button>
            )}
            {replyCount > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); onOpenThread(ck(post)); }}
                className="flex items-center gap-1 text-[11px] text-muted transition-colors hover:text-accent"
              >
                <MessageSquare className="h-3 w-3" />
                {replyCount}
              </button>
            )}
          </div>
        </div>
      </div>

      {replyOpen && (
        <div className={depth > 0 ? "ml-5 border-l-2 border-border pl-2.5" : "ml-11"}>
          <PostForm
            osmType={osmType}
            osmId={osmId}
            mode="post"
            onClose={() => setReplyOpen(false)}
            parentUri={makePostUri(post.author_id, post.id)}
            parentPreview={preview}
          />
        </div>
      )}
    </>
  );
}

// ─── Thread view ──────────────────────────────────────────────────────────

function ThreadView({
  root,
  osmType,
  osmId,
  replyMap,
  postIndex,
  onOpenThread,
  onBack,
  backLabel,
}: {
  root: PostDetails;
  osmType: string;
  osmId: number;
  replyMap: Map<string, PostDetails[]>;
  postIndex: Map<string, PostDetails>;
  onOpenThread: (key: string) => void;
  onBack: () => void;
  backLabel: string;
}) {
  const directReplies = replyMap.get(ck(root)) ?? [];

  return (
    <div>
      <button
        onClick={onBack}
        className="sticky top-0 z-10 mb-1 flex w-full items-center gap-1 bg-background py-1.5 text-xs text-muted transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        {backLabel}
      </button>

      {/* Root post */}
      <PostContent
        post={root}
        osmType={osmType}
        osmId={osmId}
        depth={0}
        replyMap={replyMap}
        onOpenThread={onOpenThread}
      />

      {/* Level 1 replies */}
      {directReplies.map((reply) => {
        const l2Replies = replyMap.get(ck(reply)) ?? [];
        return (
          <div key={reply.id}>
            <div onClick={() => onOpenThread(ck(reply))} className="cursor-pointer">
              <PostContent
                post={reply}
                osmType={osmType}
                osmId={osmId}
                depth={1}
                replyMap={replyMap}
                onOpenThread={onOpenThread}
              />
            </div>

            {/* Level 2 replies */}
            {l2Replies.map((r2) => {
              const deeperCount = countDescendants(ck(r2), replyMap);
              return (
                <div key={r2.id}>
                  <div onClick={() => onOpenThread(ck(r2))} className="cursor-pointer">
                    <PostContent
                      post={r2}
                      osmType={osmType}
                      osmId={osmId}
                      depth={2}
                      replyMap={replyMap}
                      onOpenThread={onOpenThread}
                    />
                  </div>
                  {deeperCount > 0 && (
                    <button
                      onClick={() => onOpenThread(ck(r2))}
                      className="ml-10 flex items-center gap-1.5 border-l-2 border-accent/30 py-1.5 pl-2.5 text-xs text-accent transition-colors hover:text-accent-hover"
                    >
                      <MessageSquare className="h-3 w-3" />
                      Continue thread ({deeperCount} more)
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────

interface PlacePostsProps {
  osmType: string;
  osmId: number;
}

export function PlacePosts({ osmType, osmId }: PlacePostsProps) {
  const { data: posts, isLoading } = usePlacePosts(osmType, osmId);
  const navigate = useNavigate();
  const searchParams = useRouterState({ select: (s) => s.location.search }) as Record<string, unknown>;
  const threadKey = (searchParams?.thread as string) ?? null;

  const { topLevel, replyMap, postIndex } = useMemo(() => {
    if (!posts) return {
      topLevel: [] as PostDetails[],
      replyMap: new Map<string, PostDetails[]>(),
      postIndex: new Map<string, PostDetails>(),
    };

    const map = new Map<string, PostDetails[]>();
    const index = new Map<string, PostDetails>();
    const top: PostDetails[] = [];
    const postIds = new Set(posts.map((p) => ck(p)));

    for (const post of posts) {
      index.set(ck(post), post);
      if (post.parent_uri) {
        const parentKey = parseParentUri(post.parent_uri);
        if (parentKey && postIds.has(parentKey)) {
          const existing = map.get(parentKey) ?? [];
          existing.push(post);
          map.set(parentKey, existing);
          continue;
        }
      }
      top.push(post);
    }

    return { topLevel: top, replyMap: map, postIndex: index };
  }, [posts]);

  const openThread = useCallback((key: string) => {
    navigate({
      to: "/place/$osmType/$osmId",
      params: { osmType, osmId: String(osmId) },
      search: (prev: Record<string, unknown>) => ({ ...prev, thread: key }),
    });
  }, [navigate, osmType, osmId]);

  const closeThread = useCallback(() => {
    navigate({
      to: "/place/$osmType/$osmId",
      params: { osmType, osmId: String(osmId) },
      search: (prev: Record<string, unknown>) => {
        const { thread: _, ...rest } = prev;
        return rest;
      },
    });
  }, [navigate, osmType, osmId]);

  const goToParentThread = useCallback((post: PostDetails) => {
    if (post.parent_uri) {
      const parentKey = parseParentUri(post.parent_uri);
      if (parentKey && postIndex.has(parentKey)) {
        // Navigate to the parent's parent thread (go up one level)
        const parent = postIndex.get(parentKey)!;
        if (parent.parent_uri) {
          const grandparentKey = parseParentUri(parent.parent_uri);
          if (grandparentKey && postIndex.has(grandparentKey)) {
            openThread(grandparentKey);
            return;
          }
        }
        // Parent is top-level → go to all posts
        closeThread();
        return;
      }
    }
    closeThread();
  }, [postIndex, openThread, closeThread]);

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

  // Thread detail view
  if (threadKey) {
    const threadPost = postIndex.get(threadKey);
    if (threadPost) {
      // Determine back label
      let backLabel = "All posts";
      if (threadPost.parent_uri) {
        const parentKey = parseParentUri(threadPost.parent_uri);
        if (parentKey && postIndex.has(parentKey)) {
          backLabel = "Parent thread";
        }
      }

      return (
        <ThreadView
          root={threadPost}
          osmType={osmType}
          osmId={osmId}
          replyMap={replyMap}
          postIndex={postIndex}
          onOpenThread={openThread}
          onBack={() => goToParentThread(threadPost)}
          backLabel={backLabel}
        />
      );
    }
  }

  // Normal view: top-level posts, clickable to open thread
  return (
    <div className="space-y-1">
      {topLevel.map((post) => {
        const replyCount = countDescendants(ck(post), replyMap);
        return (
          <div
            key={post.id}
            onClick={() => openThread(ck(post))}
            className="cursor-pointer"
          >
            <PostContent
              post={post}
              osmType={osmType}
              osmId={osmId}
              depth={0}
              replyMap={replyMap}
              onOpenThread={openThread}
            />
          </div>
        );
      })}
    </div>
  );
}
