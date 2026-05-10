import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Layers } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  useCaptureCreationStore,
  useActiveDraftItem,
  useIsBatch,
} from "@/stores/capture-creation-store";
import {
  publishGeoCapture,
  publishSequence,
  type SequenceMemberInput,
} from "@/lib/pubky/geo-captures";
import type { GeoCaptureDetails } from "@/types/mapky";

export function ReviewStep() {
  const { session, publicKey } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const draft = useCaptureCreationStore();
  const active = useActiveDraftItem();
  const isBatch = useIsBatch();
  const close = useCaptureCreationStore((s) => s.close);
  const isPublishing = useCaptureCreationStore((s) => s.isPublishing);
  const setIsPublishing = useCaptureCreationStore((s) => s.setIsPublishing);
  const setSequenceName = useCaptureCreationStore((s) => s.setSequenceName);
  const setSequenceDescription = useCaptureCreationStore(
    (s) => s.setSequenceDescription,
  );
  const setActiveIndex = useCaptureCreationStore((s) => s.setActiveIndex);
  const activeIndex = useCaptureCreationStore((s) => s.activeIndex);

  const [progress, setProgress] = useState<string | null>(null);

  const canPublish =
    draft.items.length > 0 &&
    draft.items.every((i) => i.lat != null && i.lon != null) &&
    !!session &&
    !!publicKey;

  const handlePublishSingle = async () => {
    if (!session || !publicKey || !active || active.lat == null || active.lon == null) return;
    setIsPublishing(true);
    setProgress("Uploading media…");
    try {
      const published = await publishGeoCapture(session, publicKey, {
        file: active.file,
        kind: active.kind,
        lat: active.lat,
        lon: active.lon,
        heading: active.heading ?? undefined,
        pitch: active.pitch ?? undefined,
        fov: active.fov ?? undefined,
        caption: draft.caption || undefined,
        capturedAt: active.capturedAt ?? undefined,
        tags: draft.pendingTags,
      });

      setProgress("Updating map…");

      const optimistic: GeoCaptureDetails = {
        id: `${publicKey}:${published.captureId}`,
        author_id: publicKey,
        file_uri: published.fileUri,
        kind: active.kind,
        lat: active.lat,
        lon: active.lon,
        ele: null,
        heading: active.heading,
        pitch: active.pitch,
        fov: active.fov,
        caption: draft.caption || null,
        sequence_uri: null,
        sequence_index: null,
        captured_at: active.capturedAt,
        indexed_at: Date.now(),
      };
      queryClient.setQueriesData<GeoCaptureDetails[]>(
        { queryKey: ["mapky", "geo_captures", "viewport"] },
        (old) => (old ? [optimistic, ...old] : [optimistic]),
      );

      toast.success(
        published.tagsPublished > 0
          ? `Published capture with ${published.tagsPublished} tag${published.tagsPublished === 1 ? "" : "s"}`
          : "Capture published",
      );

      close();
      navigate({
        to: "/capture/$authorId/$captureId",
        params: { authorId: publicKey, captureId: published.captureId },
      });
    } catch (e) {
      console.error("Publish failed:", e);
      toast.error(e instanceof Error ? e.message : "Could not publish capture");
    } finally {
      setIsPublishing(false);
      setProgress(null);
    }
  };

  const handlePublishBatch = async () => {
    if (!session || !publicKey || draft.items.length < 2) return;
    setIsPublishing(true);
    setProgress("Preparing sequence…");
    try {
      const members: SequenceMemberInput[] = draft.items.map((it) => ({
        file: it.file,
        kind: it.kind,
        lat: it.lat!,
        lon: it.lon!,
        heading: it.heading ?? undefined,
        pitch: it.pitch ?? undefined,
        fov: it.fov ?? undefined,
        capturedAt: it.capturedAt ?? undefined,
      }));

      // Use the first item's kind as the sequence kind (all members share it in practice).
      const sequenceKind = draft.items[0].kind;

      const published = await publishSequence(
        session,
        publicKey,
        {
          kind: sequenceKind,
          name: draft.sequenceName || undefined,
          description: draft.sequenceDescription || undefined,
          members,
          tags: draft.pendingTags,
        },
        (done, total) => {
          setProgress(`Uploading ${done} / ${total}`);
        },
      );

      setProgress("Updating map…");

      toast.success(
        `Sequence published · ${published.memberIds.length} captures${published.tagsPublished ? ` + ${published.tagsPublished} tags` : ""}`,
      );

      // Jump to the first capture — the sphere viewer will pull siblings.
      const firstId = published.memberIds[0];
      close();
      navigate({
        to: "/capture/$authorId/$captureId",
        params: { authorId: publicKey, captureId: firstId },
      });
    } catch (e) {
      console.error("Publish failed:", e);
      toast.error(
        e instanceof Error ? e.message : "Could not publish sequence",
      );
    } finally {
      setIsPublishing(false);
      setProgress(null);
    }
  };

  const handlePublish = () =>
    isBatch ? handlePublishBatch() : handlePublishSingle();

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Preview */}
      {active && (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          {active.file.type.startsWith("video/") ? (
            <video
              src={active.previewUrl}
              className="aspect-video w-full object-cover"
              controls
              muted
            />
          ) : (
            <img
              src={active.previewUrl}
              alt="Capture"
              className="aspect-video w-full object-cover"
            />
          )}
        </div>
      )}

      {/* Batch strip */}
      {isBatch && (
        <>
          <div className="flex items-center gap-2 rounded-lg bg-sky-500/10 px-3 py-2 text-xs text-sky-700 dark:text-sky-300">
            <Layers className="h-3.5 w-3.5" />
            <span>
              Sequence with <strong>{draft.items.length}</strong> captures
            </span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {draft.items.map((it, idx) => {
              const isActive = idx === activeIndex;
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => setActiveIndex(idx)}
                  aria-pressed={isActive}
                  aria-label={`Show capture ${idx + 1}`}
                  className={`relative h-14 w-18 shrink-0 overflow-hidden rounded-lg border bg-surface transition-all ${
                    isActive
                      ? "border-sky-500 ring-2 ring-sky-500/40"
                      : "border-border hover:border-sky-500/60"
                  }`}
                >
                  {it.file.type.startsWith("video/") ? (
                    <video
                      src={it.previewUrl}
                      className="h-full w-full object-cover"
                      muted
                    />
                  ) : (
                    <img
                      src={it.previewUrl}
                      alt={`Item ${idx + 1}`}
                      className="h-full w-full object-cover"
                    />
                  )}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-1 text-[10px] text-white">
                    {idx + 1}
                  </div>
                </button>
              );
            })}
          </div>
          <input
            type="text"
            value={draft.sequenceName}
            onChange={(e) => setSequenceName(e.target.value)}
            placeholder="Sequence name (optional)"
            maxLength={200}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
          />
          <textarea
            value={draft.sequenceDescription}
            onChange={(e) => setSequenceDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            maxLength={1000}
            className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
          />
        </>
      )}

      {/* Metadata card — shows active item's values */}
      {active && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-border bg-surface/40 p-3 text-xs">
          <Row label="Kind" value={active.kind} />
          <Row
            label="Coordinates"
            value={
              active.lat != null && active.lon != null
                ? `${active.lat.toFixed(4)}, ${active.lon.toFixed(4)}`
                : "—"
            }
          />
          <Row
            label="Heading"
            value={
              active.heading != null ? `${Math.round(active.heading)}°` : "—"
            }
          />
          {(active.kind === "panorama" || active.kind === "video360") && (
            <Row
              label="FOV"
              value={active.fov != null ? `${Math.round(active.fov)}°` : "360°"}
            />
          )}
        </div>
      )}

      {draft.caption && !isBatch && (
        <div className="rounded-xl border border-border bg-surface/40 p-3 text-sm text-foreground">
          {draft.caption}
        </div>
      )}

      {draft.pendingTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {draft.pendingTags.map((t) => (
            <span
              key={t}
              className="rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-700 dark:text-sky-300"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Publish */}
      <button
        type="button"
        disabled={!canPublish || isPublishing}
        onClick={handlePublish}
        className="mt-auto flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-border disabled:text-muted"
      >
        {isPublishing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{progress ?? "Publishing…"}</span>
          </>
        ) : (
          <>
            <CheckCircle2 className="h-4 w-4" />
            <span>
              {isBatch
                ? `Publish sequence (${draft.items.length})`
                : "Publish capture"}
            </span>
          </>
        )}
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <div className="text-[10px] uppercase tracking-wide text-muted">
        {label}
      </div>
      <div className="text-right font-mono text-foreground">{value}</div>
    </>
  );
}
