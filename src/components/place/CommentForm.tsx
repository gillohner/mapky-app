import { useState, useRef } from "react";
import { Send, X, ImagePlus, Loader2 } from "lucide-react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/AuthProvider";
import { createMapkyPost } from "@/lib/mapky-specs";
import { ingestUserIntoNexus } from "@/lib/nexus/ingest";
import { fetchPostTags } from "@/lib/api/mapky";
import { waitForIndexed } from "@/lib/api/wait-for-indexed";
import {
  uploadFile,
  ACCEPTED_IMAGE_TYPES,
  MAX_FILE_SIZE,
  type UploadedFile,
} from "@/lib/pubky/files";
import { toast } from "sonner";
import { resolveFileUrl } from "@/lib/api/user";
import type { MapkyPostDetails } from "@/types/mapky";

/** Derive the TanStack Query key that holds the list this post belongs to,
 * based on its `parent` URI. Used to targeted-refetch ONLY that list once
 * nexus has indexed the new post — instead of blanket-invalidating
 * `["mapky"]` and stomping every concurrent optimistic update.
 *
 * Returns null when the parent is unrecognized (cross-domain or absent);
 * in that case we skip the refetch and rely on the optimistic state. */
function parentListQueryKey(parent: string | null | undefined): QueryKey | null {
  if (!parent) return null;

  // OSM URL → place posts list
  const osm = parent.match(
    /^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/(\d+)\/?$/,
  );
  if (osm) {
    const osmType = osm[1];
    const osmId = Number(osm[2]);
    return ["mapky", "place", osmType, osmId, "posts"];
  }

  // pubky://{author}/pub/mapky.app/{type}/{id} → that resource's reply list
  const mapky = parent.match(
    /^pubky:\/\/([^/]+)\/pub\/mapky\.app\/(reviews|routes|collections|geo_captures|sequences|incidents|posts)\/([^/?#]+)/,
  );
  if (mapky) {
    return ["mapky", mapky[2], mapky[1], mapky[3], "replies"];
  }

  return null;
}

interface CommentFormProps {
  /** Pubky URI of the resource being replied to. Reply chains within MapKy
   * resolve to a `[:REPLY_TO]` edge; cross-domain parents (e.g. core social
   * posts) are accepted but only stored as a property. */
  parent?: string;
  /** Short text shown above the textarea to anchor the reply visually. */
  parentPreview?: string;
  /** Pass an existing post to edit it instead of creating a new one. */
  editPost?: MapkyPostDetails;
  onClose: () => void;
  /** Optional callback after the post is successfully written. Useful for
   * detail panels that want to invalidate their reply queries. */
  onPosted?: (post: MapkyPostDetails) => void;
}

interface PendingImage {
  file: File;
  previewUrl: string;
}

export function CommentForm({
  parent,
  parentPreview,
  editPost,
  onClose,
  onPosted,
}: CommentFormProps) {
  const { session, publicKey } = useAuth();
  const queryClient = useQueryClient();
  const [content, setContent] = useState(editPost?.content ?? "");
  const [images, setImages] = useState<PendingImage[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<string[]>(
    editPost?.attachments ?? [],
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasContent =
    content.trim().length > 0 ||
    images.length > 0 ||
    existingAttachments.length > 0;

  const addImages = (files: FileList | null) => {
    if (!files) return;
    const next: PendingImage[] = [];
    for (const file of Array.from(files)) {
      if (images.length + next.length >= 3) break;
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
    if (!session || !publicKey || !hasContent) return;
    setError(null);
    setSubmitting(true);

    try {
      const newAttachments: string[] = [];
      for (const img of images) {
        const uploaded: UploadedFile = await uploadFile(session, publicKey, img.file);
        newAttachments.push(uploaded.fileUri);
      }
      const allAttachments = [...existingAttachments, ...newAttachments];

      const result = createMapkyPost(publicKey, {
        content: content.trim(),
        kind: allAttachments.some((a) => /\.(jpe?g|png|gif|webp|avif)$/i.test(a))
          ? "image"
          : "short",
        parent: parent ?? editPost?.parent_uri ?? undefined,
        attachments: allAttachments.length > 0 ? allAttachments : undefined,
      });

      const writePath = editPost
        ? `/pub/mapky.app/posts/${editPost.id}`
        : result.path;
      await session.storage.putText(writePath as `/pub/${string}`, result.json);

      const postId = editPost?.id ?? result.path.split("/").pop()!;
      const optimistic: MapkyPostDetails = {
        id: postId,
        author_id: publicKey,
        content: content.trim(),
        kind: editPost?.kind ?? "short",
        parent_uri: parent ?? editPost?.parent_uri ?? null,
        embed_uri: editPost?.embed_uri ?? null,
        embed_kind: editPost?.embed_kind ?? null,
        attachments: allAttachments,
        indexed_at: editPost?.indexed_at ?? Math.floor(Date.now() / 1000),
      };

      onPosted?.(optimistic);

      toast.success(editPost ? "Post updated" : "Post published");
      for (const img of images) URL.revokeObjectURL(img.previewUrl);
      onClose();

      // Background reconcile: poll until nexus has indexed the new post,
      // then surgically refetch ONLY the list that contains it. The poll
      // probes the post's /tags endpoint, which 404s until the watcher
      // creates the :MapkyAppPost node. Once it returns 200 we know
      // subsequent list queries will see the new row, so a refetch swaps
      // the optimistic entry for the indexed one without ever rendering
      // an empty intermediate state.
      //
      // Each submit owns its own closure — rapid back-to-back posts no
      // longer pile up on a single 5 s timer that wipes everyone's
      // optimistic state.
      const refetchKey = parentListQueryKey(
        parent ?? editPost?.parent_uri ?? null,
      );
      const writtenPostId = postId;
      ingestUserIntoNexus(publicKey).then(async () => {
        const indexed = await waitForIndexed(
          async () => {
            try {
              await fetchPostTags(publicKey, writtenPostId);
              return true;
            } catch {
              return null;
            }
          },
          { intervalMs: 600, timeoutMs: 30_000, initialDelayMs: 800 },
        );
        if (indexed && refetchKey) {
          queryClient.refetchQueries({ queryKey: refetchKey, type: "active" });
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
          {editPost ? "Edit" : parent ? "Reply" : "Write a post"}
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

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={parent ? "Write a reply..." : "What would you like to share?"}
        rows={3}
        maxLength={2000}
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
            disabled={images.length >= 3}
            className="flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-xs text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
            title="Add images (max 3)"
          >
            <ImagePlus className="h-3.5 w-3.5" />
            {images.length > 0 && <span>{images.length}</span>}
          </button>
          <span className="text-xs text-muted">{content.length}/2000</span>
        </div>
        <button
          onClick={handleSubmit}
          disabled={!hasContent || submitting}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          {submitting ? "Uploading..." : editPost ? "Save" : "Publish"}
        </button>
      </div>
    </div>
  );
}
