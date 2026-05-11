import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import {
  Loader2,
  Calendar,
  MapPin,
  Camera,
  User,
  Check,
  Plus,
  X,
  Image as ImageIcon,
} from "lucide-react";
import { createSequence } from "@/lib/mapky-specs";
import { removeCaptureFromSequence } from "@/lib/pubky/geo-captures";
import type { SequenceFullResponse } from "@/types/mapky";
import { DiscoverSidebar } from "@/components/discover/DiscoverSidebar";
import { PanelHeaderActions } from "@/components/shared/PanelHeaderActions";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { ResourceDiscussion } from "@/components/posts/ResourceDiscussion";
import { KIND_LABELS, splitCompound, thumbnailUrl } from "./CaptureCard";
import { SequenceTags } from "./SequenceTags";
import { useCaptureCreationStore } from "@/stores/capture-creation-store";
import {
  useSequenceFullDetail,
  useSequenceFullCaptures,
  useUserProfile,
} from "@/lib/api/hooks";
import { useAuth } from "@/components/auth/AuthProvider";
import { useShareLink } from "@/lib/hooks/use-share-link";
import { useBackOr } from "@/hooks/use-back-or";
import { useEnsureIngested } from "@/lib/nexus/use-ensure-ingested";
import { useAutoFocusLayer } from "@/hooks/use-auto-focus-layer";
import { useUiStore } from "@/stores/ui-store";
import { useMapStore } from "@/stores/map-store";
import { truncatePublicKey } from "@/lib/api/user";

interface SequenceDetailPanelProps {
  authorId: string;
  sequenceId: string;
}

/**
 * Sequence detail surface — header (name, kind, author, time range),
 * description, member captures grid, tags, discussion thread. Reads
 * off a single composite-cache slice (`/sequences/{a}/{s}/full`) so
 * opening fires ONE round-trip total.
 *
 * Sequence members are pinned via `setPinnedCaptures` so the map's
 * capture layer keeps them visible regardless of the current bbox —
 * the user can pan around the sequence's footprint without losing
 * the dots that connect it.
 */
export function SequenceDetailPanel({
  authorId,
  sequenceId,
}: SequenceDetailPanelProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session, publicKey } = useAuth();
  const { data: detail, isLoading, error } = useSequenceFullDetail(
    authorId,
    sequenceId,
  );
  const { data: captures = [] } = useSequenceFullCaptures(authorId, sequenceId);
  useEnsureIngested(authorId);
  const { data: authorProfile } = useUserProfile(authorId);
  const authorName =
    authorProfile?.name?.trim() || truncatePublicKey(authorId);

  const isOwner = publicKey === authorId;
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const openCaptureWizard = useCaptureCreationStore((s) => s.openForSequence);
  const share = useShareLink({ kind: "sequence", authorId, resourceId: sequenceId });

  const startEdit = () => {
    setDraftName(detail?.name ?? "");
    setDraftDescription(detail?.description ?? "");
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  const handleSaveEdit = async () => {
    if (!session || !detail) return;
    const name = draftName.trim();
    const description = draftDescription.trim();
    if (
      (detail.name ?? "") === name &&
      (detail.description ?? "") === description
    ) {
      setEditing(false);
      return;
    }
    setSavingEdit(true);
    try {
      const built = createSequence(authorId, {
        kind: detail.kind,
        capturedAtStart: detail.captured_at_start,
        capturedAtEnd: detail.captured_at_end,
        captureCount: detail.capture_count,
        name: name || undefined,
        description: description || undefined,
        device: detail.device ?? undefined,
        bbox:
          detail.min_lat != null &&
          detail.max_lat != null &&
          detail.min_lon != null &&
          detail.max_lon != null
            ? {
                minLat: detail.min_lat,
                minLon: detail.min_lon,
                maxLat: detail.max_lat,
                maxLon: detail.max_lon,
              }
            : undefined,
      });

      await session.storage.putText(
        `/pub/mapky.app/sequences/${sequenceId}` as `/pub/${string}`,
        built.json,
      );

      // Patch the composite cache slice (panel reads detail off it).
      queryClient.setQueryData<SequenceFullResponse>(
        ["mapky", "sequence-full", authorId, sequenceId],
        (old) =>
          old
            ? {
                ...old,
                detail: {
                  ...old.detail,
                  name: name || null,
                  description: description || null,
                },
              }
            : old,
      );
      // Patch the user's sequences list (My Captures sidebar reads it).
      queryClient.setQueryData<import("@/types/mapky").SequenceDetails[]>(
        ["mapky", "sequences", "user", authorId],
        (old) =>
          old?.map((s) => {
            const id = s.id.split(":").pop();
            return id === sequenceId
              ? { ...s, name: name || null, description: description || null }
              : s;
          }),
      );

      toast.success("Sequence updated");
      setEditing(false);
    } catch {
      toast.error("Could not update sequence");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleAddCaptures = () => {
    if (!detail) return;
    openCaptureWizard({
      authorId,
      sequenceId,
      current: {
        kind: detail.kind,
        name: detail.name,
        description: detail.description,
        device: detail.device,
        capturedAtStart: detail.captured_at_start,
        capturedAtEnd: detail.captured_at_end,
        captureCount: detail.capture_count,
        bbox:
          detail.min_lat != null &&
          detail.max_lat != null &&
          detail.min_lon != null &&
          detail.max_lon != null
            ? {
                minLat: detail.min_lat,
                minLon: detail.min_lon,
                maxLat: detail.max_lat,
                maxLon: detail.max_lon,
              }
            : null,
      },
    });
  };

  const handleRemoveCapture = async (capture: import("@/types/mapky").GeoCaptureDetails) => {
    if (!session || !isOwner || !detail) return;
    if (
      !confirm(
        "Remove this capture from the sequence? The capture itself stays on your homeserver as a standalone.",
      )
    ) {
      return;
    }
    const [, captureId] = capture.id.split(":");
    setRemovingId(capture.id);
    try {
      const remaining = captures.filter((c) => c.id !== capture.id);
      await removeCaptureFromSequence(session, publicKey!, {
        sequenceId,
        captureId,
        capture: {
          file_uri: capture.file_uri,
          kind: capture.kind,
          lat: capture.lat,
          lon: capture.lon,
          ele: capture.ele,
          heading: capture.heading,
          pitch: capture.pitch,
          fov: capture.fov,
          caption: capture.caption,
          captured_at: capture.captured_at,
        },
        remaining: remaining.map((c) => ({
          lat: c.lat,
          lon: c.lon,
          captured_at: c.captured_at,
        })),
        current: {
          kind: detail.kind,
          name: detail.name ?? undefined,
          description: detail.description ?? undefined,
          device: detail.device ?? undefined,
        },
      });

      queryClient.invalidateQueries({
        queryKey: ["mapky", "sequence-full", authorId, sequenceId],
      });
      queryClient.invalidateQueries({
        queryKey: ["mapky", "sequences", "user", authorId],
      });
      if (remaining.length === 0) {
        toast.success("Capture removed · empty sequence deleted");
        navigate({ to: "/captures" });
      } else {
        toast.success("Removed from sequence");
      }
    } catch {
      toast.error("Could not remove capture");
    } finally {
      setRemovingId(null);
    }
  };

  const handleDelete = async () => {
    if (!session || !isOwner) return;
    if (
      !confirm(
        "Delete this sequence? Member captures stay on your homeserver but lose the sequence link.",
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      await session.storage.delete(
        `/pub/mapky.app/sequences/${sequenceId}` as `/pub/${string}`,
      );
      queryClient.invalidateQueries({
        queryKey: ["mapky", "sequences", "user", authorId],
      });
      queryClient.removeQueries({
        queryKey: ["mapky", "sequence", authorId, sequenceId],
      });
      toast.success("Sequence deleted");
      navigate({ to: "/" });
    } catch {
      toast.error("Could not delete sequence");
      setDeleting(false);
    }
  };

  // Focus on captures (the sequence's members ARE captures, plus we
  // want the SequenceCoverageLayer polyline drawn) and hide places so
  // the panorama dots + sequence line stand alone. The previous
  // "places" focus hid the captures layer too, which dropped the dots
  // and polyline entirely until the user opened a single capture.
  useAutoFocusLayer("captures", { hide: true });

  // Pin members so they stay drawn even when the user pans away
  // from the sequence's bbox.
  const setPinnedCaptures = useUiStore((s) => s.setPinnedCaptures);
  useEffect(() => {
    if (captures.length === 0) {
      setPinnedCaptures(null);
      return;
    }
    setPinnedCaptures(captures);
    return () => setPinnedCaptures(null);
  }, [captures, setPinnedCaptures]);

  // FlyTo the sequence centroid on mount so the map shows the
  // footprint without the user panning manually.
  const map = useMapStore((s) => s.map);
  useEffect(() => {
    if (!map || !detail) return;
    if (
      detail.min_lat == null ||
      detail.max_lat == null ||
      detail.min_lon == null ||
      detail.max_lon == null
    ) {
      return;
    }
    map.fitBounds(
      [
        [detail.min_lon, detail.min_lat],
        [detail.max_lon, detail.max_lat],
      ],
      { padding: 80, duration: 700, maxZoom: 15 },
    );
  }, [map, detail]);

  const close = () => navigate({ to: "/" });
  const back = useBackOr(() => navigate({ to: "/captures" }));

  const headerActions = (
    <PanelHeaderActions
      share={{ onClick: share }}
      edit={
        isOwner
          ? { onClick: startEdit, enabled: !editing, title: "Edit sequence" }
          : undefined
      }
      remove={
        isOwner
          ? { onClick: handleDelete, loading: deleting, title: "Delete sequence" }
          : undefined
      }
    />
  );

  if (isLoading) {
    return (
      <DiscoverSidebar
        title="Sequence"
        onClose={close}
        onBack={back}
        backLabel="Captures"
        rightHeaderSlot={headerActions}
      >
        <div className="flex items-center gap-2 py-4 text-xs text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading…
        </div>
      </DiscoverSidebar>
    );
  }

  if (error || !detail) {
    return (
      <DiscoverSidebar
        title="Sequence"
        onClose={close}
        onBack={back}
        backLabel="Captures"
        rightHeaderSlot={headerActions}
      >
        <p className="py-4 text-xs text-red-500">
          {(error as Error | undefined)?.message ?? "Sequence not found"}
        </p>
      </DiscoverSidebar>
    );
  }

  return (
    <DiscoverSidebar
      title={detail.name?.trim() || "Sequence"}
      onClose={close}
      onBack={back}
      backLabel="Captures"
      rightHeaderSlot={headerActions}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <h2 className="truncate text-base font-semibold text-foreground">
            {detail.name?.trim() || "Untitled sequence"}
          </h2>
          <Header
            authorId={authorId}
            authorName={authorName}
            kind={detail.kind}
            captureCount={detail.capture_count}
            capturedAtStart={detail.captured_at_start}
            capturedAtEnd={detail.captured_at_end}
            device={detail.device}
          />
        </div>

        {editing ? (
          <div className="space-y-2 rounded-lg border border-border bg-surface p-3">
            <input
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              maxLength={200}
              placeholder="Sequence name"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              autoFocus
            />
            <textarea
              value={draftDescription}
              onChange={(e) => setDraftDescription(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="Description (optional)"
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelEdit}
                disabled={savingEdit}
                className="rounded-md border border-border px-3 py-1 text-xs text-muted hover:bg-background disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={savingEdit}
                className="flex items-center gap-1 rounded-md bg-accent px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
              >
                {savingEdit ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Check className="h-3 w-3" />
                )}
                Save
              </button>
            </div>
          </div>
        ) : (
          detail.description && (
            <p className="whitespace-pre-wrap text-sm text-foreground">
              {detail.description}
            </p>
          )
        )}

        <SequenceTags authorId={authorId} sequenceId={sequenceId} />

        <CaptureGrid
          captures={captures}
          isOwner={isOwner}
          removingId={removingId}
          onRemove={handleRemoveCapture}
          onAdd={isOwner ? handleAddCaptures : undefined}
        />

        <div className="border-t border-border pt-4">
          <ResourceDiscussion
            resourceType="sequences"
            authorId={authorId}
            resourceId={sequenceId}
          />
        </div>
      </div>
    </DiscoverSidebar>
  );
}

function Header({
  authorId,
  authorName,
  kind,
  captureCount,
  capturedAtStart,
  capturedAtEnd,
  device,
}: {
  authorId: string;
  authorName: string;
  kind: string;
  captureCount: number;
  capturedAtStart: number;
  capturedAtEnd: number;
  device: string | null;
}) {
  const timeRange = useMemo(() => {
    return formatTimeRange(capturedAtStart, capturedAtEnd);
  }, [capturedAtStart, capturedAtEnd]);
  const kindLabel = KIND_LABELS[kind as keyof typeof KIND_LABELS] ?? kind;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <UserAvatar userId={authorId} size={6} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-xs text-muted">
            <User className="h-3 w-3" aria-hidden />
            <span className="truncate">{authorName}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1">
              <Camera className="h-3 w-3" aria-hidden />
              {captureCount} {kindLabel.toLowerCase()}
              {captureCount === 1 ? "" : "s"}
            </span>
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" aria-hidden />
              {timeRange}
            </span>
            {device && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" aria-hidden />
                {device}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CaptureGrid({
  captures,
  isOwner,
  removingId,
  onRemove,
  onAdd,
}: {
  captures: import("@/types/mapky").GeoCaptureDetails[];
  isOwner: boolean;
  removingId: string | null;
  onRemove: (capture: import("@/types/mapky").GeoCaptureDetails) => void;
  onAdd?: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted">
          Captures{captures.length > 0 ? ` · ${captures.length}` : ""}
        </h4>
      </div>
      {captures.length === 0 ? (
        <p className="text-xs text-muted">
          This sequence has no captures yet.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {captures.map((c) => (
            <CaptureThumb
              key={c.id}
              capture={c}
              isOwner={isOwner}
              isRemoving={removingId === c.id}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border bg-surface px-2 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-accent hover:bg-surface/70"
        >
          <Plus className="h-3.5 w-3.5" />
          Add captures
        </button>
      )}
    </div>
  );
}

function CaptureThumb({
  capture,
  isOwner,
  isRemoving,
  onRemove,
}: {
  capture: import("@/types/mapky").GeoCaptureDetails;
  isOwner: boolean;
  isRemoving: boolean;
  onRemove: (capture: import("@/types/mapky").GeoCaptureDetails) => void;
}) {
  const [authorId, captureId] = splitCompound(capture.id, capture.author_id);
  const thumb = thumbnailUrl(capture);
  return (
    <div className="relative h-16 w-16 shrink-0">
      <Link
        to="/capture/$authorId/$captureId"
        params={{ authorId, captureId }}
        className="block h-full w-full overflow-hidden rounded-md border border-border bg-surface transition-colors hover:border-accent"
      >
        {thumb ? (
          <img
            src={thumb}
            alt={capture.caption ?? "Capture"}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted">
            <ImageIcon className="h-5 w-5" />
          </div>
        )}
      </Link>
      {isOwner && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove(capture);
          }}
          disabled={isRemoving}
          aria-label="Remove from sequence"
          title="Remove from sequence"
          className="absolute -right-1 -top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-background text-muted shadow ring-1 ring-border transition-colors hover:bg-red-500 hover:text-white disabled:opacity-50"
        >
          {isRemoving ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <X className="h-3 w-3" />
          )}
        </button>
      )}
    </div>
  );
}

function formatTimeRange(startMicros: number, endMicros: number): string {
  // Indexer stores microseconds since epoch. Render as a single
  // date when start/end share the day, otherwise "Mar 5 – Mar 7".
  const start = new Date(Math.floor(startMicros / 1000));
  const end = new Date(Math.floor(endMicros / 1000));
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  const fmt = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year:
      start.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
  if (sameDay) return fmt.format(start);
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}
