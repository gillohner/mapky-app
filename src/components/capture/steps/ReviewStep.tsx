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
  appendToSequence,
  publishGeoCapture,
  publishSequence,
  type SequenceMemberInput,
} from "@/lib/pubky/geo-captures";
import type {
  GeoCaptureDetails,
  SequenceDetails,
  SequenceFullResponse,
} from "@/types/mapky";

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
      // Seed the detail cache so the panel renders without waiting on
      // the indexer (nexus needs a beat to ingest the new blob — until
      // then GET /v0/mapky/geo_captures/{a}/{c} 404s).
      queryClient.setQueryData<GeoCaptureDetails>(
        ["mapky", "geo_capture", publicKey, published.captureId],
        optimistic,
      );
      queryClient.setQueryData<GeoCaptureDetails[]>(
        ["mapky", "geo_captures", "user", publicKey],
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

      // Build optimistic GeoCaptureDetails for every member so the
      // detail panel + sphere viewer + sequence panel all render the
      // moment we navigate, instead of 404'ing while waiting for nexus
      // to ingest the new blobs.
      const now = Date.now() * 1000;
      const sequenceUri = published.sequenceUri;
      const optimisticCaptures: GeoCaptureDetails[] = draft.items.map((it, i) => ({
        id: `${publicKey}:${published.members[i].id}`,
        author_id: publicKey,
        file_uri: published.members[i].fileUri,
        kind: it.kind,
        lat: it.lat!,
        lon: it.lon!,
        ele: null,
        heading: it.heading,
        pitch: it.pitch,
        fov: it.fov,
        caption: null,
        sequence_uri: sequenceUri,
        sequence_index: i,
        captured_at: it.capturedAt,
        indexed_at: Date.now(),
      }));
      for (const oc of optimisticCaptures) {
        const captureId = oc.id.split(":")[1];
        queryClient.setQueryData<GeoCaptureDetails>(
          ["mapky", "geo_capture", publicKey, captureId],
          oc,
        );
      }
      queryClient.setQueriesData<GeoCaptureDetails[]>(
        { queryKey: ["mapky", "geo_captures", "viewport"] },
        (old) => (old ? [...optimisticCaptures, ...old] : optimisticCaptures),
      );
      queryClient.setQueryData<GeoCaptureDetails[]>(
        ["mapky", "geo_captures", "user", publicKey],
        (old) => (old ? [...optimisticCaptures, ...old] : optimisticCaptures),
      );
      // Sphere viewer's siblings + sequence panel's grid both read from
      // composite + per-sequence captures slices — seed both.
      queryClient.setQueryData<GeoCaptureDetails[]>(
        ["mapky", "sequence", publicKey, published.sequenceId, "captures"],
        optimisticCaptures,
      );

      const lats = optimisticCaptures.map((c) => c.lat);
      const lons = optimisticCaptures.map((c) => c.lon);
      const times = optimisticCaptures
        .map((c) => c.captured_at)
        .filter((t): t is number => t != null && t > 0);
      const optimisticSeq: SequenceDetails = {
        id: `${publicKey}:${published.sequenceId}`,
        author_id: publicKey,
        name: draft.sequenceName || null,
        description: draft.sequenceDescription || null,
        kind: sequenceKind,
        captured_at_start: times.length ? Math.min(...times) : now,
        captured_at_end: times.length ? Math.max(...times) : now,
        capture_count: optimisticCaptures.length,
        min_lat: Math.min(...lats),
        min_lon: Math.min(...lons),
        max_lat: Math.max(...lats),
        max_lon: Math.max(...lons),
        device: null,
        indexed_at: Date.now(),
      };
      queryClient.setQueryData<SequenceFullResponse>(
        ["mapky", "sequence-full", publicKey, published.sequenceId],
        { detail: optimisticSeq, captures: optimisticCaptures, tags: [] },
      );
      queryClient.setQueryData<SequenceDetails[]>(
        ["mapky", "sequences", "user", publicKey],
        (old) => (old ? [optimisticSeq, ...old] : [optimisticSeq]),
      );

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

  const handleAppend = async () => {
    const target = draft.targetSequence;
    if (!session || !publicKey || !target) return;
    if (draft.items.length === 0) return;
    if (!draft.items.every((i) => i.lat != null && i.lon != null)) return;
    setIsPublishing(true);
    setProgress("Appending captures…");
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
      const appended = await appendToSequence(
        session,
        publicKey,
        {
          sequenceId: target.sequenceId,
          sequenceUri: `pubky://${target.authorId}/pub/mapky.app/sequences/${target.sequenceId}`,
          current: {
            kind: target.current.kind,
            name: target.current.name ?? undefined,
            description: target.current.description ?? undefined,
            device: target.current.device ?? undefined,
            capturedAtStart: target.current.capturedAtStart,
            capturedAtEnd: target.current.capturedAtEnd,
            captureCount: target.current.captureCount,
            bbox: target.current.bbox ?? undefined,
          },
          members,
          tags: draft.pendingTags,
        },
        (done, total) => setProgress(`Uploading ${done} / ${total}`),
      );

      // Build optimistic GeoCaptureDetails for the new captures so the
      // sequence panel grid + sphere viewer renders them immediately,
      // before nexus has had a chance to index them.
      const sequenceUri = appended.sequenceUri;
      const optimisticNew: GeoCaptureDetails[] = draft.items.map((it, i) => ({
        id: `${publicKey}:${appended.newMembers[i].id}`,
        author_id: publicKey,
        file_uri: appended.newMembers[i].fileUri,
        kind: it.kind,
        lat: it.lat!,
        lon: it.lon!,
        ele: null,
        heading: it.heading,
        pitch: it.pitch,
        fov: it.fov,
        caption: null,
        sequence_uri: sequenceUri,
        sequence_index: target.current.captureCount + i,
        captured_at: it.capturedAt,
        indexed_at: Date.now(),
      }));

      for (const oc of optimisticNew) {
        const captureId = oc.id.split(":")[1];
        queryClient.setQueryData<GeoCaptureDetails>(
          ["mapky", "geo_capture", publicKey, captureId],
          oc,
        );
      }
      queryClient.setQueriesData<GeoCaptureDetails[]>(
        { queryKey: ["mapky", "geo_captures", "viewport"] },
        (old) => (old ? [...optimisticNew, ...old] : optimisticNew),
      );
      queryClient.setQueryData<GeoCaptureDetails[]>(
        ["mapky", "geo_captures", "user", publicKey],
        (old) => (old ? [...optimisticNew, ...old] : optimisticNew),
      );
      queryClient.setQueryData<GeoCaptureDetails[]>(
        ["mapky", "sequence", target.authorId, target.sequenceId, "captures"],
        (old) => (old ? [...old, ...optimisticNew] : optimisticNew),
      );

      // Patch the composite slice (panel reads detail + captures off it).
      const newLats = optimisticNew.map((c) => c.lat);
      const newLons = optimisticNew.map((c) => c.lon);
      const newTimes = optimisticNew
        .map((c) => c.captured_at)
        .filter((t): t is number => t != null && t > 0);
      queryClient.setQueryData<SequenceFullResponse>(
        ["mapky", "sequence-full", target.authorId, target.sequenceId],
        (old) => {
          if (!old) return old;
          const allLats = [
            old.detail.min_lat,
            old.detail.max_lat,
            ...newLats,
          ].filter((x): x is number => x != null);
          const allLons = [
            old.detail.min_lon,
            old.detail.max_lon,
            ...newLons,
          ].filter((x): x is number => x != null);
          return {
            ...old,
            detail: {
              ...old.detail,
              capture_count: appended.newCaptureCount,
              captured_at_start: newTimes.length
                ? Math.min(old.detail.captured_at_start, ...newTimes)
                : old.detail.captured_at_start,
              captured_at_end: newTimes.length
                ? Math.max(old.detail.captured_at_end, ...newTimes)
                : old.detail.captured_at_end,
              min_lat: allLats.length ? Math.min(...allLats) : old.detail.min_lat,
              max_lat: allLats.length ? Math.max(...allLats) : old.detail.max_lat,
              min_lon: allLons.length ? Math.min(...allLons) : old.detail.min_lon,
              max_lon: allLons.length ? Math.max(...allLons) : old.detail.max_lon,
            },
            captures: [...old.captures, ...optimisticNew],
          };
        },
      );

      toast.success(
        `Added ${appended.newMemberIds.length} capture${appended.newMemberIds.length === 1 ? "" : "s"}${appended.tagsPublished ? ` · ${appended.tagsPublished} tag${appended.tagsPublished === 1 ? "" : "s"}` : ""}`,
      );
      close();
    } catch (e) {
      console.error("Append failed:", e);
      toast.error(
        e instanceof Error ? e.message : "Could not append to sequence",
      );
    } finally {
      setIsPublishing(false);
      setProgress(null);
    }
  };

  const handlePublish = () => {
    if (draft.targetSequence) return handleAppend();
    return isBatch ? handlePublishBatch() : handlePublishSingle();
  };

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

      {/* Append-mode banner */}
      {draft.targetSequence && (
        <div className="flex items-center gap-2 rounded-lg bg-sky-500/10 px-3 py-2 text-xs text-sky-700 dark:text-sky-300">
          <Layers className="h-3.5 w-3.5" />
          <span>
            Adding <strong>{draft.items.length}</strong> capture
            {draft.items.length === 1 ? "" : "s"} to{" "}
            <strong>
              {draft.targetSequence.current.name?.trim() || "this sequence"}
            </strong>
          </span>
        </div>
      )}

      {/* Sequence banner + name/description form — only when starting
          a NEW sequence (append mode shows its own banner above). */}
      {isBatch && !draft.targetSequence && (
        <div className="flex items-center gap-2 rounded-lg bg-sky-500/10 px-3 py-2 text-xs text-sky-700 dark:text-sky-300">
          <Layers className="h-3.5 w-3.5" />
          <span>
            Sequence with <strong>{draft.items.length}</strong> captures
          </span>
        </div>
      )}

      {/* Thumbnail strip — useful any time there are multiple items, including append mode. */}
      {draft.items.length > 1 && (
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
      )}

      {isBatch && !draft.targetSequence && (
        <>
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
              {draft.targetSequence
                ? `Add ${draft.items.length} to sequence`
                : isBatch
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
