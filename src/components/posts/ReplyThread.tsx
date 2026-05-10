import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Reply, Pencil } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useResourceReplies, useUserProfile } from "@/lib/api/hooks";
import { useEnsureIngested } from "@/lib/nexus/use-ensure-ingested";
import type { MapkyResourceType } from "@/lib/api/mapky";
import { truncatePublicKey } from "@/lib/api/user";
import type { MapkyPostDetails } from "@/types/mapky";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { CommentForm } from "@/components/place/CommentForm";
import { PostTags } from "@/components/place/PostTags";

interface ReplyThreadProps {
  resourceType: MapkyResourceType;
  authorId: string;
  resourceId: string;
  /** Short preview of the parent resource shown when composing a top-level reply. */
  parentPreview?: string;
}

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

function ck(post: MapkyPostDetails): string {
  return `${post.author_id}:${post.id}`;
}

function parsePostParent(uri: string): string | null {
  const m = uri.match(/^pubky:\/\/([^/]+)\/pub\/mapky\.app\/posts\/(.+)$/);
  return m ? `${m[1]}:${m[2]}` : null;
}

function PostNode({
  post,
  depth,
  replyMap,
  resourceType,
  authorId,
  resourceId,
}: {
  post: MapkyPostDetails;
  depth: number;
  replyMap: Map<string, MapkyPostDetails[]>;
  resourceType: MapkyResourceType;
  authorId: string;
  resourceId: string;
}) {
  const { isAuthenticated, publicKey } = useAuth();
  const queryClient = useQueryClient();
  const [replyOpen, setReplyOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  useEnsureIngested(post.author_id);
  const { data: authorProfile } = useUserProfile(post.author_id);
  const authorName = authorProfile?.name?.trim() || null;
  const isOwner = publicKey === post.author_id;
  const children = replyMap.get(ck(post)) ?? [];
  const indent = depth > 0 ? { marginLeft: `${depth * 1.25}rem` } : undefined;
  const replyParentUri = `pubky://${post.author_id}/pub/mapky.app/posts/${post.id}`;
  const repliesQueryKey = ["mapky", resourceType, authorId, resourceId, "replies"];

  if (editOpen) {
    return (
      <div
        className={depth > 0 ? "border-l-2 border-border pl-2.5" : ""}
        style={indent}
      >
        <CommentForm
          editPost={post}
          onClose={() => setEditOpen(false)}
          onPosted={(updated) => {
            queryClient.setQueryData<MapkyPostDetails[]>(repliesQueryKey, (old) =>
              old?.map((p) =>
                p.id === post.id && p.author_id === post.author_id ? updated : p,
              ),
            );
          }}
        />
      </div>
    );
  }

  return (
    <>
      <div
        className={`group flex gap-3 rounded-lg p-2 transition-colors hover:bg-surface ${
          depth > 0 ? "border-l-2 border-border pl-2.5" : ""
        }`}
        style={indent}
      >
        <UserAvatar userId={post.author_id} size={depth > 0 ? 6 : 8} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`truncate text-xs ${authorName ? "font-medium text-foreground" : "font-mono text-muted"}`}
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
            {isAuthenticated && !replyOpen && (
              <button
                onClick={() => setReplyOpen(true)}
                className="flex items-center gap-1 text-[11px] text-muted transition-colors hover:text-accent"
              >
                <Reply className="h-3 w-3" />
                Reply
              </button>
            )}
            {children.length > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-muted">
                <MessageSquare className="h-3 w-3" />
                {children.length}
              </span>
            )}
          </div>
        </div>
      </div>

      {replyOpen && (
        <div
          className={depth > 0 ? "border-l-2 border-border pl-2.5" : "ml-11"}
          style={indent}
        >
          <CommentForm
            parent={replyParentUri}
            parentPreview={post.content.slice(0, 60)}
            onClose={() => setReplyOpen(false)}
            onPosted={(reply) => {
              queryClient.setQueryData<MapkyPostDetails[]>(
                repliesQueryKey,
                (old) => (old ? [reply, ...old] : [reply]),
              );
            }}
          />
        </div>
      )}

      {children.map((child) => (
        <PostNode
          key={ck(child)}
          post={child}
          depth={depth + 1}
          replyMap={replyMap}
          resourceType={resourceType}
          authorId={authorId}
          resourceId={resourceId}
        />
      ))}
    </>
  );
}

/**
 * Generic reply thread mountable on any MapKy resource detail panel.
 *
 * `:MapkyAppPost` (cross-namespace comments) form the reply tree:
 *   - Top-level replies have `parent_uri` pointing at the resource
 *     (review/route/collection/etc.).
 *   - Reply-of-reply nodes have `parent_uri` pointing at another
 *     `:MapkyAppPost` URI (parsed via `parsePostParent`).
 *
 * The current API returns only direct replies to the resource — nested
 * replies (replies-to-replies) become top-level rows whose `parent_uri`
 * points at another post. We rebuild the tree client-side in `replyMap`
 * and only render posts that target this resource as roots.
 */
export function ReplyThread({
  resourceType,
  authorId,
  resourceId,
  parentPreview,
}: ReplyThreadProps) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const { data: replies, isLoading } = useResourceReplies(
    resourceType,
    authorId,
    resourceId,
  );
  const [composing, setComposing] = useState(false);

  const { roots, replyMap } = useMemo(() => {
    const map = new Map<string, MapkyPostDetails[]>();
    const top: MapkyPostDetails[] = [];
    const ids = new Set((replies ?? []).map((p) => ck(p)));
    for (const post of replies ?? []) {
      const parent = post.parent_uri ? parsePostParent(post.parent_uri) : null;
      if (parent && ids.has(parent)) {
        const arr = map.get(parent) ?? [];
        arr.push(post);
        map.set(parent, arr);
      } else {
        top.push(post);
      }
    }
    return { roots: top, replyMap: map };
  }, [replies]);

  const repliesQueryKey = ["mapky", resourceType, authorId, resourceId, "replies"];
  const parentUri = `pubky://${authorId}/pub/mapky.app/${resourceType}/${resourceId}`;

  return (
    <div>
      {composing && (
        <CommentForm
          parent={parentUri}
          parentPreview={parentPreview}
          onClose={() => setComposing(false)}
          onPosted={(reply) => {
            queryClient.setQueryData<MapkyPostDetails[]>(
              repliesQueryKey,
              (old) => (old ? [reply, ...old] : [reply]),
            );
          }}
        />
      )}

      {isLoading && (
        <div className="py-2 text-xs text-muted">Loading replies…</div>
      )}

      {!isLoading && roots.length === 0 && !composing && (
        <p className="py-2 text-center text-xs text-muted">
          No replies yet.
          {isAuthenticated && (
            <>
              {" "}
              <button
                onClick={() => setComposing(true)}
                className="text-accent hover:underline"
              >
                Start the thread.
              </button>
            </>
          )}
        </p>
      )}

      {!isLoading && roots.length > 0 && !composing && isAuthenticated && (
        <div className="mb-1 flex justify-end">
          <button
            onClick={() => setComposing(true)}
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted transition-colors hover:border-accent hover:text-accent"
          >
            <Reply className="h-3 w-3" />
            Reply
          </button>
        </div>
      )}

      {roots.map((root) => (
        <PostNode
          key={ck(root)}
          post={root}
          depth={0}
          replyMap={replyMap}
          resourceType={resourceType}
          authorId={authorId}
          resourceId={resourceId}
        />
      ))}
    </div>
  );
}
