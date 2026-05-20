import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  X,
  Compass,
  Check,
  MapPin,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Maximize,
} from "lucide-react";
import { useShareLink } from "@/lib/hooks/use-share-link";
import { PanelHeaderActions } from "@/components/shared/PanelHeaderActions";
import { createGeoCapture } from "@/lib/mapky-specs";
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
import { DiscoverSidebar } from "@/components/discover/DiscoverSidebar";
import { UserAvatar } from "@/components/shared/UserAvatar";
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
import { useMapStore } from "@/stores/map-store";
import { useAutoFocusLayer } from "@/hooks/use-auto-focus-layer";
import type { GeoCaptureDetails, GeoCaptureKind } from "@/types/mapky";
import { ResourceDiscussion } from "@/components/posts/ResourceDiscussion";

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
  const map = useMapStore((s) => s.map);
  const setStreetViewActive = useUiStore((s) => s.setStreetViewActive);
  const setStreetViewCenter = useUiStore((s) => s.setStreetViewCenter);
  const streetViewActive = useUiStore((s) => s.streetViewActive);
  const streetViewExpanded = useUiStore((s) => s.streetViewExpanded);
  const toggleStreetViewExpanded = useUiStore((s) => s.toggleStreetViewExpanded);
  // Sphere overlay visibility is driven by streetViewActive; the
  // fullscreen vs corner-thumb layout is driven by streetViewExpanded
  // (the same flag MapView's swap button toggles).
  const sphereOpen = streetViewActive;
  const sphereFullscreen = streetViewActive && streetViewExpanded;

  const [lightbox, setLightbox] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [savingCaption, setSavingCaption] = useState(false);
  const [draftCaption, setDraftCaption] = useState("");
  const sphereHandle = useRef<SphereViewerHandle | null>(null);
  // Sticky across sibling navigations: once the user closes the sphere
  // we don't auto-reopen it when they click Prev / Next in the sidebar,
  // even if the next capture is also a panorama. Reset when they
  // explicitly tap the "View in 360" button again.
  const sphereDismissedRef = useRef(false);

  // Hide Mapky places entirely so the capture stands alone, same
  // rule the captures list uses.
  useAutoFocusLayer("captures", { hide: true });

  const isOwner = publicKey === authorId;
  const isPanorama = capture?.kind === "panorama";
  const isVideo360 = capture?.kind === "video360";
  const isImmersive = isPanorama || isVideo360;

  // Auto-launch the 360 view for immersive captures and switch the
  // main map into mini-map mode so it stays visible in the corner.
  // The sphere overlay sits at z-5; MapView's mini-map at z-10 layers
  // on top, giving the original street-view-style integration: sphere
  // dominates, map keeps geographic context in the corner.
  //
  // Skip the auto-open after the user has dismissed the sphere once —
  // navigating to the next sibling in the sidebar shouldn't yank them
  // back into fullscreen.
  useEffect(() => {
    if (!isImmersive || !capture) return;
    if (sphereDismissedRef.current) return;
    setStreetViewActive(true);
    setStreetViewCenter([capture.lon, capture.lat]);
    return () => {
      setStreetViewActive(false);
      setStreetViewCenter(null);
    };
  }, [isImmersive, capture, setStreetViewActive, setStreetViewCenter]);

  // Fly the main map to the capture's location once the data arrives.
  // Delay 350ms to let the sidebar's padding ease finish first
  // (otherwise it cancels the fly).
  const flyDone = useRef(false);
  useEffect(() => {
    if (!map || !capture) return;
    if (flyDone.current) return;
    flyDone.current = true;
    const t = setTimeout(() => {
      map.flyTo({
        center: [capture.lon, capture.lat],
        zoom: 17,
        duration: 1500,
      });
    }, 350);
    return () => clearTimeout(t);
  }, [map, capture]);

  // Re-arm the fly when the user navigates between captures (sequence
  // siblings, "next" / "prev"): the panel stays mounted, only the
  // captureId in the URL changes, so the ref above would otherwise
  // pin to the first capture.
  useEffect(() => {
    flyDone.current = false;
  }, [captureId]);

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

  // Pin the active sequence's captures (plus the current capture) on
  // the map so the coverage line stays drawn even when the user zooms
  // in past the bbox of the siblings. Cleared on unmount.
  const setPinnedCaptures = useUiStore((s) => s.setPinnedCaptures);
  useEffect(() => {
    if (!capture) {
      setPinnedCaptures(null);
      return;
    }
    const merged = orderedSiblings.length > 0
      ? orderedSiblings.some((s) => s.id === capture.id)
        ? orderedSiblings
        : [capture, ...orderedSiblings]
      : [capture];
    setPinnedCaptures(merged);
    return () => setPinnedCaptures(null);
  }, [capture, orderedSiblings, setPinnedCaptures]);
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
        // Replace, don't push — stepping through sibling captures
        // within the same sequence shouldn't pile up history entries.
        // The panel's back arrow always jumps to the parent sequence
        // anyway; the browser back should skip the sibling walk and
        // return to wherever the user entered the sequence from.
        replace: true,
      });
    },
    [navigate],
  );

  // Top-right X always closes the entire sidebar back to the map.
  const handleClose = () => navigate({ to: "/" });
  // Top-left back arrow always returns to the parent sequence when
  // this capture is part of one, regardless of how many siblings the
  // user stepped through. Standalone captures fall back to /captures.
  // Uses `replace` so the capture URL doesn't linger in history — when
  // the user steps back again from the sequence, the browser pops to
  // whatever was BEFORE the capture (captures list, search results,
  // place page, etc.) instead of re-opening this capture (which would
  // auto-launch the sphere overlay on a panorama).
  const handleBack = useCallback(() => {
    if (seqRef) {
      navigate({
        to: "/sequence/$authorId/$sequenceId",
        params: {
          authorId: seqRef.authorId,
          sequenceId: seqRef.sequenceId,
        },
        replace: true,
      });
    } else {
      navigate({ to: "/captures", replace: true });
    }
  }, [navigate, seqRef]);

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

  const handleShare = useShareLink({
    kind: "capture",
    authorId,
    resourceId: captureId,
  });

  const startEdit = () => {
    setDraftCaption(capture?.caption ?? "");
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraftCaption("");
  };

  const handleSaveCaption = async () => {
    if (!session || !capture) return;
    const next = draftCaption.trim();
    if ((capture.caption ?? "") === next) {
      cancelEdit();
      return;
    }
    setSavingCaption(true);
    try {
      // Rebuild the JSON via the spec builder so all required fields land
      // in a schema-valid shape, then PUT to the existing path so the
      // capture's id (and pubky:// URI) doesn't change.
      const built = createGeoCapture(authorId, {
        fileUri: capture.file_uri,
        kind: capture.kind,
        lat: capture.lat,
        lon: capture.lon,
        ele: capture.ele ?? undefined,
        heading: capture.heading ?? undefined,
        pitch: capture.pitch ?? undefined,
        fov: capture.fov ?? undefined,
        caption: next || undefined,
        capturedAt: capture.captured_at ?? undefined,
      });
      // Preserve sequence linkage — the builder doesn't accept these and
      // dropping them would orphan the capture from its parent sequence.
      const obj = JSON.parse(built.json) as Record<string, unknown>;
      if (capture.sequence_uri) {
        obj.sequence_uri = capture.sequence_uri;
        obj.sequence_index = capture.sequence_index;
      }
      await session.storage.putText(
        `/pub/mapky.app/geo_captures/${captureId}` as `/pub/${string}`,
        JSON.stringify(obj),
      );

      queryClient.setQueryData<GeoCaptureDetails>(
        ["mapky", "geo_capture", authorId, captureId],
        (old) => (old ? { ...old, caption: next || null } : old),
      );
      queryClient.setQueriesData<GeoCaptureDetails[]>(
        { queryKey: ["mapky", "geo_captures", "viewport"] },
        (old) =>
          old?.map((c) =>
            c.id === `${authorId}:${captureId}`
              ? { ...c, caption: next || null }
              : c,
          ),
      );

      toast.success("Caption updated");
      setEditing(false);
    } catch {
      toast.error("Could not update capture");
    } finally {
      setSavingCaption(false);
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
      // Sync the main map to the new node's location so the user can
      // see where they've moved to. fetch is cached by TanStack Query.
      fetchGeoCaptureDetail(
        nodeId.split(":")[0],
        nodeId.split(":")[1],
      ).then((d) => {
        map?.flyTo({ center: [d.lon, d.lat], zoom: 17, duration: 800 });
      }).catch(() => {});
    },
    [navigate, map],
  );

  // ─── Single render path for every capture kind ─── left sidebar via DiscoverSidebar
  // so place / collection / route / capture details all share one
  // shell. The sphere variant above still uses its bespoke fullscreen
  // layout because the 360 viewer needs the whole screen.
  const headerActions = (
    <PanelHeaderActions
      share={{ onClick: handleShare }}
      edit={
        isOwner
          ? { onClick: startEdit, enabled: !editing, title: "Edit caption" }
          : undefined
      }
      remove={
        isOwner
          ? { onClick: handleDelete, loading: deleting, title: "Delete capture" }
          : undefined
      }
    />
  );

  return (
    <>
      <DiscoverSidebar
        title={capture ? KIND_LABELS[capture.kind] : "Capture"}
        onClose={handleClose}
        onBack={handleBack}
        backLabel={seqRef ? "Sequence" : "Captures"}
        rightHeaderSlot={headerActions}
        mobileCollapsible
      >
        {isLoading && !capture && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted" />
          </div>
        )}
        {error && !capture && (
          <div className="p-4 text-sm text-red-500">
            Could not load this capture.
          </div>
        )}
        {capture && (
          <div className="flex flex-col gap-4">
            <h2 className="truncate text-base font-semibold text-foreground">
              {KIND_LABELS[capture.kind]}
            </h2>
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
              if (isImmersive) {
                // While the sphere overlay is mounted (either fullscreen
                // or corner-thumb) it already shows the panorama — a
                // second inline preview would just duplicate the same
                // content inside the sheet. Render nothing in that case;
                // the user can swap or close via the overlay itself.
                if (sphereOpen) return null;
                // Sphere has been dismissed — surface a compact button
                // so the user can re-launch the 360 view.
                const openSphere = () => {
                  if (!capture) return;
                  sphereDismissedRef.current = false;
                  // setStreetViewActive also sets streetViewExpanded=true,
                  // so the sphere overlay opens fullscreen (not corner).
                  setStreetViewActive(true);
                  setStreetViewCenter([capture.lon, capture.lat]);
                };
                return (
                  <button
                    type="button"
                    onClick={openSphere}
                    className="group relative overflow-hidden rounded-xl border border-border bg-black"
                  >
                    {isPanorama ? (
                      <img
                        src={mediaUrl}
                        alt={capture.caption ?? "Panorama"}
                        className="aspect-video w-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
                        loading="lazy"
                      />
                    ) : (
                      <video
                        src={mediaUrl}
                        className="aspect-video w-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
                        muted
                        preload="metadata"
                      />
                    )}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur">
                        <Maximize className="h-3.5 w-3.5" />
                        View in 360
                      </div>
                    </div>
                  </button>
                );
              }
              if (capture.kind === "video") {
                return (
                  <div className="overflow-hidden rounded-xl border border-border bg-surface">
                    <video
                      src={mediaUrl}
                      className="aspect-video w-full object-cover"
                      controls
                      muted
                    />
                  </div>
                );
              }
              return (
                <button
                  type="button"
                  onClick={() => setLightbox(true)}
                  className="group relative overflow-hidden rounded-xl border border-border bg-surface"
                >
                  <img
                    src={mediaUrl}
                    alt={capture.caption ?? "Capture"}
                    className="aspect-video w-full object-cover transition-transform group-hover:scale-[1.02]"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.opacity = "0.3";
                    }}
                  />
                </button>
              );
            })()}

            {/* Sequence navigation */}
            {orderedSiblings.length > 1 && currentIdx >= 0 && (
              <div className="flex items-center justify-between rounded-xl border border-border bg-surface/40 px-3 py-2">
                <button
                  type="button"
                  disabled={!prevSibling}
                  onClick={() =>
                    prevSibling && navigateToSibling(prevSibling)
                  }
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted hover:bg-surface hover:text-foreground disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4" /> Prev
                </button>
                <span className="text-xs font-medium text-muted">
                  {currentIdx + 1} / {orderedSiblings.length}
                </span>
                <button
                  type="button"
                  disabled={!nextSibling}
                  onClick={() =>
                    nextSibling && navigateToSibling(nextSibling)
                  }
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted hover:bg-surface hover:text-foreground disabled:opacity-30"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Author */}
            <div className="flex items-center gap-3">
              <UserAvatar userId={authorId} size={10} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-foreground">
                  {authorProfile?.name ?? authorId.slice(0, 8) + "…"}
                </div>
                {capture.captured_at && (
                  <div className="flex items-center gap-1 text-xs text-muted">
                    <Clock className="h-3 w-3" />
                    {new Date(capture.captured_at / 1000).toLocaleString()}
                  </div>
                )}
              </div>
            </div>

            {editing ? (
              <div className="space-y-2 rounded-lg border border-border bg-surface p-3">
                <textarea
                  value={draftCaption}
                  onChange={(e) => setDraftCaption(e.target.value)}
                  maxLength={1000}
                  rows={3}
                  placeholder="Add a caption…"
                  className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={cancelEdit}
                    disabled={savingCaption}
                    className="rounded-md border border-border px-3 py-1 text-xs text-muted hover:bg-background disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveCaption}
                    disabled={savingCaption}
                    className="flex items-center gap-1 rounded-md bg-accent px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                  >
                    {savingCaption ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Check className="h-3 w-3" />
                    )}
                    Save
                  </button>
                </div>
              </div>
            ) : (
              capture.caption && (
                <p className="whitespace-pre-wrap text-sm text-foreground">
                  {capture.caption}
                </p>
              )
            )}

            {/* Location */}
            <div className="rounded-xl border border-border bg-surface/40 p-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted">
                <MapPin className="h-3 w-3" /> Location
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted">Lat</span>
                  <span className="font-mono text-foreground">
                    {capture.lat.toFixed(5)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted">Lon</span>
                  <span className="font-mono text-foreground">
                    {capture.lon.toFixed(5)}
                  </span>
                </div>
                {capture.heading != null && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted">
                      <Compass className="mr-1 inline h-3 w-3" />
                      Heading
                    </span>
                    <span className="font-mono text-foreground">
                      {Math.round(capture.heading)}°
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Tags */}
            <div>
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                Tags
              </div>
              <CaptureTags authorId={authorId} captureId={captureId} />
            </div>

            <ResourceDiscussion
              resourceType="geo_captures"
              authorId={authorId}
              resourceId={captureId}
              parentPreview={capture?.caption ?? "Capture"}
            />
          </div>
        )}
      </DiscoverSidebar>

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

      {/* 360 view overlay — always mounted while an immersive capture
          is open. Layout flips based on streetViewExpanded:
            - expanded → fullscreen sphere, map shrinks to mini in corner
            - collapsed → sphere shrinks to corner, map goes fullscreen
          The mini-map's swap button toggles streetViewExpanded, which
          drives this swap — same model the original street-view UI
          used. X closes entirely. */}
      {sphereOpen && capture && isImmersive && (
        <SphereOverlay
          isPanorama={!!isPanorama}
          expanded={sphereFullscreen}
          authorId={authorId}
          captureId={captureId}
          authorName={authorProfile?.name?.trim() || `${authorId.slice(0, 8)}…`}
          caption={capture.caption}
          siblingIndex={currentIdx}
          siblingsCount={orderedSiblings.length}
          onPrev={
            prevSibling ? () => navigateToSibling(prevSibling) : undefined
          }
          onNext={
            nextSibling ? () => navigateToSibling(nextSibling) : undefined
          }
          mediaUrl={resolveFileUrl(capture.file_uri)}
          getNode={getNode}
          onNodeChange={handleNodeChange}
          sphereHandle={sphereHandle}
          onExpand={toggleStreetViewExpanded}
          onClose={() => {
            sphereDismissedRef.current = true;
            setStreetViewActive(false);
            setStreetViewCenter(null);
          }}
        />
      )}
    </>
  );
}

/**
 * 360 viewer overlay — fullscreen when `expanded`, corner-thumb when
 * not. The fullscreen variant covers the map (z-[40] mobile / z-[5]
 * desktop) and shows the metadata strip + close X across the top; the
 * corner variant sits where the mini-map would be (bottom-right) and
 * is click-to-expand. The mini-map's swap button toggles `expanded`,
 * so the two switch places consistently — same model as the original
 * street-view UX.
 */
function SphereOverlay({
  isPanorama,
  expanded,
  authorId,
  captureId,
  authorName,
  caption,
  siblingIndex,
  siblingsCount,
  onPrev,
  onNext,
  mediaUrl,
  getNode,
  onNodeChange,
  sphereHandle,
  onExpand,
  onClose,
}: {
  isPanorama: boolean;
  expanded: boolean;
  authorId: string;
  captureId: string;
  authorName: string;
  caption: string | null;
  siblingIndex: number;
  siblingsCount: number;
  onPrev?: () => void;
  onNext?: () => void;
  mediaUrl: string | null;
  getNode: (nodeId: string) => Promise<VirtualTourNodeData>;
  onNodeChange: (nodeId: string) => void;
  sphereHandle: React.MutableRefObject<SphereViewerHandle | null>;
  onExpand: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    // Keyboard shortcuts only apply when in fullscreen — pressing Esc
    // while in corner-thumb shouldn't yank the user out of the panel.
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && onPrev) onPrev();
      if (e.key === "ArrowRight" && onNext) onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, onClose, onPrev, onNext]);

  const viewer = isPanorama && mediaUrl ? (
    <SphereViewer
      nodeId={`${authorId}:${captureId}`}
      getNode={getNode}
      onNodeChange={onNodeChange}
      viewerHandle={sphereHandle}
      className="h-full w-full"
    />
  ) : mediaUrl ? (
    <VideoSphereViewer
      src={mediaUrl}
      className="h-full w-full !rounded-none !border-0"
    />
  ) : (
    <div className="flex h-full w-full items-center justify-center text-white/50">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );

  if (!expanded) {
    // Corner-thumb mode — click the body to expand back to fullscreen
    // (MapView's swap button drives the same toggle), top-right X
    // dismisses the sphere entirely. Maximize hint sits at top-left
    // so it doesn't fight with the close button.
    return (
      <div className="pointer-events-auto fixed bottom-4 left-4 z-[50] h-[180px] w-[240px] overflow-hidden rounded-2xl bg-black shadow-2xl ring-2 ring-white/20 md:bottom-4 md:left-auto md:right-4 md:z-[10] md:h-[280px] md:w-[400px]">
        <button
          type="button"
          onClick={onExpand}
          aria-label="Expand 360 view"
          title="Expand 360 view"
          className="absolute inset-0 h-full w-full"
        >
          {viewer}
        </button>
        <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/60 p-1.5 text-white shadow backdrop-blur">
          <Maximize className="h-3.5 w-3.5" />
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label="Close 360 view"
          title="Close 360 view"
          className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white shadow backdrop-blur transition-colors hover:bg-black/80"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto fixed inset-0 z-[40] bg-black md:z-[5]">
      {viewer}

      {/* Compact metadata strip — top of the sphere, low profile so it
          doesn't compete with the panorama. Author + caption pill on
          the left; sequence prev/next arrows + close on the right. All
          three pills share a fixed h-10 so they line up cleanly. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center gap-2 bg-gradient-to-b from-black/70 via-black/30 to-transparent px-3 py-2 md:left-[428px]">
        <div className="pointer-events-auto flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-black/60 px-3 text-white shadow-lg backdrop-blur">
          <UserAvatar userId={authorId} size={6} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-xs font-semibold">{authorName}</div>
            {caption && (
              <p className="truncate text-[11px] text-white/80">{caption}</p>
            )}
          </div>
        </div>
        {siblingsCount > 1 && siblingIndex >= 0 && (
          <div className="pointer-events-auto flex h-10 shrink-0 items-center gap-0.5 rounded-full bg-black/60 px-1 text-white shadow-lg backdrop-blur">
            <button
              type="button"
              onClick={onPrev}
              disabled={!onPrev}
              aria-label="Previous capture"
              title="Previous (←)"
              className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/15 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[2.5rem] text-center text-[11px] tabular-nums text-white/80">
              {siblingIndex + 1}/{siblingsCount}
            </span>
            <button
              type="button"
              onClick={onNext}
              disabled={!onNext}
              aria-label="Next capture"
              title="Next (→)"
              className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/15 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Exit 360 view"
          title="Exit 360 view (Esc)"
          className="pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur transition-colors hover:bg-black/80"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
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
