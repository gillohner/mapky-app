import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  X,
  Compass,
  MapPin,
  Trash2,
  Share2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Camera,
  ZoomIn,
  ZoomOut,
  Maximize,
} from "lucide-react";
import {
  useGeoCaptureDetail,
  useUserProfile,
  useSequenceCaptures,
} from "@/lib/api/hooks";
import {
  fetchGeoCaptureDetail,
  fetchSequenceCaptures,
  fetchNearbyCaptures,
} from "@/lib/api/mapky";
import { resolveFileUrl } from "@/lib/api/user";
import { useAuth } from "@/components/auth/AuthProvider";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { MobileMenuTrigger } from "@/components/sidebar/MobileMenuTrigger";
import { CaptureTags } from "./CaptureTags";
import { SphereViewer, type VirtualTourNodeData, type SphereViewerHandle } from "./SphereViewer";

/** Run promises in parallel, return both results (second defaults on error). */
async function fetchParallel<A, B>(
  a: Promise<A>,
  b: Promise<B>,
  bDefault: B,
): Promise<[A, B]> {
  const [ra, rb] = await Promise.allSettled([a, b]);
  return [
    ra.status === "fulfilled" ? ra.value : (() => { throw ra.reason; })(),
    rb.status === "fulfilled" ? rb.value : bDefault,
  ];
}
import { VideoSphereViewer } from "./VideoSphereViewer";
import { useUiStore } from "@/stores/ui-store";
import { useAutoFocusLayer } from "@/hooks/use-auto-focus-layer";
import type { GeoCaptureDetails, GeoCaptureKind } from "@/types/mapky";

function parseSequenceUri(
  uri: string | null,
): { authorId: string; sequenceId: string } | null {
  if (!uri) return null;
  const m = uri.match(/^pubky:\/\/([^/]+)\/pub\/mapky\.app\/sequences\/(.+)$/);
  if (!m) return null;
  return { authorId: m[1], sequenceId: m[2] };
}

const KIND_LABELS: Record<GeoCaptureKind, string> = {
  photo: "Photo",
  panorama: "Panorama",
  video: "Video",
  video360: "360° Video",
  model3d: "3D Model",
  point_cloud: "Point Cloud",
  audio: "Audio",
  other: "Other",
};

interface CaptureDetailPanelProps {
  authorId: string;
  captureId: string;
}

export function CaptureDetailPanel({
  authorId,
  captureId,
}: CaptureDetailPanelProps) {
  const {
    data: capture,
    isLoading,
    error,
  } = useGeoCaptureDetail(authorId, captureId);
  const { data: authorProfile } = useUserProfile(authorId);
  const { session, publicKey } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setStreetViewActive = useUiStore((s) => s.setStreetViewActive);
  const setStreetViewCenter = useUiStore((s) => s.setStreetViewCenter);
  const streetViewExpanded = useUiStore((s) => s.streetViewExpanded);
  const toggleStreetViewExpanded = useUiStore((s) => s.toggleStreetViewExpanded);

  const [lightbox, setLightbox] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const sphereHandle = useRef<SphereViewerHandle | null>(null);

  useAutoFocusLayer("captures");

  const isOwner = publicKey === authorId;
  const isPanorama = capture?.kind === "panorama";
  const isVideo360 = capture?.kind === "video360";
  const isImmersive = isPanorama || isVideo360;

  // Activate/deactivate street view mode for immersive captures
  useEffect(() => {
    if (isImmersive && capture) {
      setStreetViewActive(true);
      setStreetViewCenter([capture.lon, capture.lat]);
    }
    return () => {
      setStreetViewActive(false);
      setStreetViewCenter(null);
    };
  }, [isImmersive, capture, setStreetViewActive, setStreetViewCenter]);

  // Sequence siblings for navigation
  const seqRef = useMemo(
    () => parseSequenceUri(capture?.sequence_uri ?? null),
    [capture?.sequence_uri],
  );
  const { data: siblings } = useSequenceCaptures(
    seqRef?.authorId ?? null,
    seqRef?.sequenceId ?? null,
  );
  const orderedSiblings = useMemo(() => {
    if (!siblings) return [];
    return [...siblings].sort(
      (a, b) => (a.sequence_index ?? 0) - (b.sequence_index ?? 0),
    );
  }, [siblings]);
  const currentIdx = useMemo(() => {
    if (!capture || orderedSiblings.length === 0) return -1;
    return orderedSiblings.findIndex((s) => s.id === capture.id);
  }, [capture, orderedSiblings]);
  const prevSibling =
    currentIdx > 0 ? orderedSiblings[currentIdx - 1] : undefined;
  const nextSibling =
    currentIdx >= 0 && currentIdx < orderedSiblings.length - 1
      ? orderedSiblings[currentIdx + 1]
      : undefined;

  const navigateToSibling = useCallback(
    (s: GeoCaptureDetails) => {
      const parts = s.id.split(":");
      navigate({
        to: "/capture/$authorId/$captureId",
        params: { authorId: parts[0], captureId: parts[1] },
      });
    },
    [navigate],
  );

  const handleClose = () => navigate({ to: "/" });

  const handleDelete = async () => {
    if (!session || !isOwner) return;
    if (!confirm("Delete this capture permanently?")) return;
    setDeleting(true);
    try {
      await session.storage.delete(
        `/pub/mapky.app/geo_captures/${captureId}` as `/pub/${string}`,
      );
      queryClient.setQueriesData<GeoCaptureDetails[]>(
        { queryKey: ["mapky", "geo_captures", "viewport"] },
        (old) => old?.filter((c) => c.id !== `${authorId}:${captureId}`),
      );
      toast.success("Capture deleted");
      handleClose();
    } catch {
      toast.error("Could not delete capture");
    } finally {
      setDeleting(false);
    }
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/capture/${authorId}/${captureId}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy link");
    }
  };

  // VirtualTourPlugin getNode for panorama sequences
  const getNode = useCallback(
    async (nodeId: string): Promise<VirtualTourNodeData> => {
      const [nAuthor, nCapture] = nodeId.split(":");
      const detail = await fetchGeoCaptureDetail(nAuthor, nCapture);
      const mediaUrl = resolveFileUrl(detail.file_uri) ?? "";

      // Fetch siblings + nearby in parallel for speed
      const seq = parseSequenceUri(detail.sequence_uri);
      const [sibs, nearby] = await fetchParallel(
        seq
          ? fetchSequenceCaptures(seq.authorId, seq.sequenceId)
          : Promise.resolve([]),
        fetchNearbyCaptures(detail.lat, detail.lon, {
          excludeSequence: detail.sequence_uri ?? undefined,
          radius: 80,
          limit: 6,
        }),
        [],
      );

      const links: VirtualTourNodeData["links"] = [];
      const seen = new Set<string>();
      for (const s of sibs) {
        if (s.id !== nodeId) {
          links.push({ nodeId: s.id, gps: [s.lon, s.lat] as [number, number] });
          seen.add(s.id);
        }
      }
      for (const n of nearby) {
        if (n.id !== nodeId && !seen.has(n.id)) {
          links.push({ nodeId: n.id, gps: [n.lon, n.lat] as [number, number] });
        }
      }

      return {
        id: nodeId,
        panorama: mediaUrl,
        gps: [detail.lon, detail.lat],
        name: detail.caption ?? undefined,
        caption: detail.caption ?? undefined,
        links,
      };
    },
    [],
  );

  const handleNodeChange = useCallback(
    (nodeId: string) => {
      const [nAuthor, nCapture] = nodeId.split(":");
      if (nAuthor && nCapture) {
        navigate({
          to: "/capture/$authorId/$captureId",
          params: { authorId: nAuthor, captureId: nCapture },
          replace: true,
        });
      }
      // Sync mini-map to new location — fetch is cached by TanStack Query
      fetchGeoCaptureDetail(
        nodeId.split(":")[0],
        nodeId.split(":")[1],
      ).then((d) => {
        setStreetViewCenter([d.lon, d.lat]);
      }).catch(() => {});
    },
    [navigate, setStreetViewCenter],
  );

  // ─── Immersive (panorama / video360) ─── fullscreen sphere + compact overlay
  if (isImmersive && capture) {
    const mediaUrl = resolveFileUrl(capture.file_uri);
    return (
      <>
        <MobileMenuTrigger />

        {/* Sphere viewer — fullscreen when expanded, corner thumbnail when map is expanded */}
        <div
          data-sphere-container
          className={
            streetViewExpanded
              ? "pointer-events-auto fixed inset-0 z-[5] bg-black md:left-12"
              : "pointer-events-auto fixed bottom-20 right-4 z-[10] h-[200px] w-[300px] overflow-hidden rounded-2xl bg-black shadow-2xl ring-2 ring-white/20 md:h-[240px] md:w-[360px]"
          }
          onClick={!streetViewExpanded ? toggleStreetViewExpanded : undefined}
        >
          {isPanorama && mediaUrl ? (
            <SphereViewer
              nodeId={`${authorId}:${captureId}`}
              getNode={getNode}
              onNodeChange={handleNodeChange}
              viewerHandle={sphereHandle}
              className="h-full w-full"
            />
          ) : isVideo360 && mediaUrl ? (
            <VideoSphereViewer
              src={mediaUrl}
              className="h-full w-full !rounded-none !border-0"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-white/50">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
        </div>

        {/* Sphere controls — right edge, card-style (only when sphere is expanded) */}
        {streetViewExpanded && <div className="pointer-events-auto fixed right-3 top-1/2 z-[20] flex -translate-y-1/2 flex-col gap-1 rounded-xl border border-border bg-background/90 p-1 shadow-lg backdrop-blur-lg">
          <button
            type="button"
            onClick={() => sphereHandle.current?.zoomIn()}
            className="rounded-lg p-2 text-muted hover:bg-surface hover:text-foreground"
            aria-label="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => sphereHandle.current?.zoomOut()}
            className="rounded-lg p-2 text-muted hover:bg-surface hover:text-foreground"
            aria-label="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <div className="mx-auto my-0.5 w-4 border-t border-border" />
          <button
            type="button"
            onClick={() => {
              const el = document.querySelector("[data-sphere-container]");
              if (el) {
                if (document.fullscreenElement) document.exitFullscreen();
                else el.requestFullscreen?.();
              }
            }}
            className="rounded-lg p-2 text-muted hover:bg-surface hover:text-foreground"
            aria-label="Fullscreen"
          >
            <Maximize className="h-4 w-4" />
          </button>
        </div>}

        {/* Info card — bottom center, only when sphere is expanded */}
        {streetViewExpanded && <div className="pointer-events-auto fixed bottom-4 left-1/2 z-[20] w-[90%] max-w-lg -translate-x-1/2 rounded-2xl border border-border bg-background/90 px-4 py-3 shadow-xl backdrop-blur-lg">
          {/* Header row: author + close + actions */}
          <div className="flex items-center gap-3">
            <UserAvatar userId={authorId} size={8} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-foreground">
                {authorProfile?.name ?? authorId.slice(0, 8) + "…"}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted">
                <span className="flex items-center gap-0.5">
                  <MapPin className="h-3 w-3" />
                  {capture.lat.toFixed(4)}, {capture.lon.toFixed(4)}
                </span>
                {capture.heading != null && (
                  <span className="flex items-center gap-0.5">
                    <Compass className="h-3 w-3" />
                    {Math.round(capture.heading)}°
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              <button type="button" onClick={handleShare} className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-foreground" aria-label="Share">
                <Share2 className="h-3.5 w-3.5" />
              </button>
              {isOwner && (
                <button type="button" onClick={handleDelete} disabled={deleting} className="rounded-lg p-1.5 text-muted hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50" aria-label="Delete">
                  {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              )}
              <button type="button" onClick={handleClose} className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-foreground" aria-label="Close">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Nav + tags row */}
          {(orderedSiblings.length > 1 || capture.caption) && (
            <div className="mt-2 flex items-center gap-2 border-t border-border pt-2">
              {orderedSiblings.length > 1 && currentIdx >= 0 && (
                <div className="flex items-center gap-0.5">
                  <button type="button" disabled={!prevSibling} onClick={() => prevSibling && navigateToSibling(prevSibling)} className="rounded-lg p-1 text-muted hover:bg-surface hover:text-foreground disabled:opacity-30">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="min-w-[2.5rem] text-center text-xs tabular-nums text-muted">
                    {currentIdx + 1}/{orderedSiblings.length}
                  </span>
                  <button type="button" disabled={!nextSibling} onClick={() => nextSibling && navigateToSibling(nextSibling)} className="rounded-lg p-1 text-muted hover:bg-surface hover:text-foreground disabled:opacity-30">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
              {capture.caption && (
                <p className="flex-1 truncate text-xs text-muted">
                  {capture.caption}
                </p>
              )}
            </div>
          )}
        </div>}
      </>
    );
  }

  // ─── Standard (photo / video) ─── sidebar panel (unchanged layout)
  return (
    <>
      <MobileMenuTrigger />
      <div
        className="pointer-events-auto fixed inset-x-0 bottom-0 z-40 flex max-h-[90dvh] flex-col rounded-t-2xl border-t border-border bg-background shadow-2xl md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-[28rem] md:rounded-none md:rounded-l-2xl md:border-l md:border-t-0"
        role="dialog"
        aria-modal="true"
      >
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-2 md:hidden">
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <Camera className="h-4 w-4 shrink-0 text-sky-500" />
            <h2 className="truncate text-base font-semibold text-foreground">
              {capture ? KIND_LABELS[capture.kind] : "Capture"}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={handleShare} className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-foreground" aria-label="Share">
              <Share2 className="h-4 w-4" />
            </button>
            {isOwner && (
              <button type="button" onClick={handleDelete} disabled={deleting} className="rounded-lg p-1.5 text-muted hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50" aria-label="Delete">
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            )}
            <button type="button" onClick={handleClose} className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-foreground" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted" />
            </div>
          )}
          {error && (
            <div className="p-4 text-sm text-red-500">Could not load this capture.</div>
          )}
          {capture && (
            <div className="flex flex-col gap-4 p-4">
              {/* Media */}
              {(() => {
                const mediaUrl = resolveFileUrl(capture.file_uri);
                if (!mediaUrl) {
                  return (
                    <div className="flex aspect-video w-full items-center justify-center rounded-xl border border-border bg-surface text-xs text-muted">
                      Unsupported file URI
                    </div>
                  );
                }
                if (capture.kind === "video") {
                  return (
                    <div className="overflow-hidden rounded-xl border border-border bg-surface">
                      <video src={mediaUrl} className="aspect-video w-full object-cover" controls muted />
                    </div>
                  );
                }
                return (
                  <button type="button" onClick={() => setLightbox(true)} className="group relative overflow-hidden rounded-xl border border-border bg-surface">
                    <img src={mediaUrl} alt={capture.caption ?? "Capture"} className="aspect-video w-full object-cover transition-transform group-hover:scale-[1.02]" onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.3"; }} />
                  </button>
                );
              })()}

              {/* Sequence navigation */}
              {orderedSiblings.length > 1 && currentIdx >= 0 && (
                <div className="flex items-center justify-between rounded-xl border border-border bg-surface/40 px-3 py-2">
                  <button type="button" disabled={!prevSibling} onClick={() => prevSibling && navigateToSibling(prevSibling)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted hover:bg-surface hover:text-foreground disabled:opacity-30">
                    <ChevronLeft className="h-4 w-4" /> Prev
                  </button>
                  <span className="text-xs font-medium text-muted">{currentIdx + 1} / {orderedSiblings.length}</span>
                  <button type="button" disabled={!nextSibling} onClick={() => nextSibling && navigateToSibling(nextSibling)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted hover:bg-surface hover:text-foreground disabled:opacity-30">
                    Next <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Author */}
              <div className="flex items-center gap-3">
                <UserAvatar userId={authorId} size={10} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-foreground">{authorProfile?.name ?? authorId.slice(0, 8) + "…"}</div>
                  {capture.captured_at && (
                    <div className="flex items-center gap-1 text-xs text-muted">
                      <Clock className="h-3 w-3" />
                      {new Date(capture.captured_at / 1000).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>

              {capture.caption && <p className="whitespace-pre-wrap text-sm text-foreground">{capture.caption}</p>}

              {/* Location */}
              <div className="rounded-xl border border-border bg-surface/40 p-4">
                <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted"><MapPin className="h-3 w-3" /> Location</div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs"><span className="text-muted">Lat</span><span className="font-mono text-foreground">{capture.lat.toFixed(5)}</span></div>
                  <div className="flex items-center justify-between text-xs"><span className="text-muted">Lon</span><span className="font-mono text-foreground">{capture.lon.toFixed(5)}</span></div>
                  {capture.heading != null && (
                    <div className="flex items-center justify-between text-xs"><span className="text-muted"><Compass className="mr-1 inline h-3 w-3" />Heading</span><span className="font-mono text-foreground">{Math.round(capture.heading)}°</span></div>
                  )}
                </div>
              </div>

              {/* Tags */}
              <div>
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Tags</div>
                <CaptureTags authorId={authorId} captureId={captureId} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox with nav */}
      {lightbox && capture && capture.kind === "photo" && (
        <LightboxOverlay
          capture={capture}
          prevSibling={prevSibling}
          nextSibling={nextSibling}
          currentIdx={currentIdx}
          totalSiblings={orderedSiblings.length}
          onClose={() => setLightbox(false)}
          onNavigate={navigateToSibling}
        />
      )}
    </>
  );
}

function LightboxOverlay({
  capture,
  prevSibling,
  nextSibling,
  currentIdx,
  totalSiblings,
  onClose,
  onNavigate,
}: {
  capture: GeoCaptureDetails;
  prevSibling: GeoCaptureDetails | undefined;
  nextSibling: GeoCaptureDetails | undefined;
  currentIdx: number;
  totalSiblings: number;
  onClose: () => void;
  onNavigate: (s: GeoCaptureDetails) => void;
}) {
  const mediaUrl = resolveFileUrl(capture.file_uri);
  const hasSequence = totalSiblings > 1 && currentIdx >= 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && prevSibling) onNavigate(prevSibling);
      if (e.key === "ArrowRight" && nextSibling) onNavigate(nextSibling);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onNavigate, prevSibling, nextSibling]);

  if (!mediaUrl) return null;

  return (
    <div className="pointer-events-auto fixed inset-0 z-[60] flex flex-col bg-black/95">
      <div className="flex items-center justify-between px-4 py-3">
        {hasSequence && <span className="text-sm font-medium text-white/70">{currentIdx + 1} / {totalSiblings}</span>}
        <div className="flex-1" />
        <button type="button" onClick={onClose} className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Close"><X className="h-5 w-5" /></button>
      </div>
      <div className="relative flex flex-1 items-center justify-center px-4">
        {prevSibling && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onNavigate(prevSibling); }} className="absolute left-2 z-10 rounded-full bg-black/50 p-3 text-white/80 backdrop-blur hover:bg-black/70 hover:text-white md:left-6" aria-label="Previous"><ChevronLeft className="h-6 w-6" /></button>
        )}
        <img src={mediaUrl} alt={capture.caption ?? "Capture"} className="max-h-[85vh] max-w-full rounded-lg object-contain" onClick={onClose} />
        {nextSibling && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onNavigate(nextSibling); }} className="absolute right-2 z-10 rounded-full bg-black/50 p-3 text-white/80 backdrop-blur hover:bg-black/70 hover:text-white md:right-6" aria-label="Next"><ChevronRight className="h-6 w-6" /></button>
        )}
      </div>
      {capture.caption && <div className="px-6 py-3 text-center text-sm text-white/70">{capture.caption}</div>}
    </div>
  );
}
