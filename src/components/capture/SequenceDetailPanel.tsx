import { useEffect, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Calendar, MapPin, Camera, User } from "lucide-react";
import { DiscoverSidebar } from "@/components/discover/DiscoverSidebar";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { ResourceDiscussion } from "@/components/posts/ResourceDiscussion";
import { CaptureCard, KIND_LABELS } from "./CaptureCard";
import { SequenceTags } from "./SequenceTags";
import {
  useSequenceFullDetail,
  useSequenceFullCaptures,
  useUserProfile,
} from "@/lib/api/hooks";
import { useEnsureIngested } from "@/lib/nexus/use-ensure-ingested";
import { useAutoFocusLayer } from "@/hooks/use-auto-focus-layer";
import { useUiStore } from "@/stores/ui-store";
import { useMapStore } from "@/stores/map-store";
import { truncatePublicKey } from "@/lib/api/user";
import type { PostTagDetails } from "@/types/mapky";

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
  const { data: detail, isLoading, error } = useSequenceFullDetail(
    authorId,
    sequenceId,
  );
  const { data: captures = [] } = useSequenceFullCaptures(authorId, sequenceId);
  useEnsureIngested(authorId);
  const { data: authorProfile } = useUserProfile(authorId);
  const authorName =
    authorProfile?.name?.trim() || truncatePublicKey(authorId);

  // Hide the place layer while a sequence is open; keep captures
  // layer enabled (the sequence's members ARE captures and we want
  // them dimmed-but-visible).
  useAutoFocusLayer("places", { hide: true });

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

  if (isLoading) {
    return (
      <DiscoverSidebar
        title="Sequence"
        onClose={close}
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
      <DiscoverSidebar title="Sequence" onClose={close}>
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
    >
      <div className="space-y-4">
        <Header
          authorId={authorId}
          authorName={authorName}
          kind={detail.kind}
          captureCount={detail.capture_count}
          capturedAtStart={detail.captured_at_start}
          capturedAtEnd={detail.captured_at_end}
          device={detail.device}
        />

        {detail.description && (
          <p className="whitespace-pre-wrap text-sm text-foreground">
            {detail.description}
          </p>
        )}

        <SequenceTags authorId={authorId} sequenceId={sequenceId} />

        <CaptureGrid captures={captures} />

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
}: {
  captures: import("@/types/mapky").GeoCaptureDetails[];
}) {
  if (captures.length === 0) {
    return (
      <p className="text-xs text-muted">
        This sequence has no captures yet.
      </p>
    );
  }
  return (
    <div>
      <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
        Captures
      </h4>
      <div className="grid grid-cols-3 gap-1">
        {captures.map((c) => (
          <CaptureCard
            key={c.id}
            capture={c}
            tags={(c.tags ?? []) as PostTagDetails[]}
            showCreator={false}
            flyToOnClick={false}
          />
        ))}
      </div>
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
