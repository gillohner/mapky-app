import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Loader2, Pencil, Trash2 } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useMapStore } from "@/stores/map-store";
import { useRouteBody, useRouteDetails } from "@/lib/api/hooks";
import { useRouteCreationStore } from "@/stores/route-creation-store";
import { useAutoFocusLayer } from "@/hooks/use-auto-focus-layer";
import { useBackOr } from "@/hooks/use-back-or";
import { decodePolyline } from "@/lib/routing/polyline";
import { emitGpx, gpxFilename } from "@/lib/gpx/emit";
import type { LngLat } from "@/lib/routing/types";
import type { RouteDetails } from "@/types/mapky";
import { RoutePolylineLayer } from "@/components/map/RoutePolylineLayer";
import { DiscoverSidebar } from "@/components/discover/DiscoverSidebar";
import { RouteStats } from "./RouteStats";
import { RouteTags } from "./RouteTags";

interface RouteDetailPanelProps {
  authorId: string;
  routeId: string;
}

/**
 * Route detail panel. Lives in the same left sidebar shell as
 * `CollectionPanel` and `PlacePanel` (via `DiscoverSidebar`) so all three
 * detail views read identically. Polyline renders on the map; this panel
 * holds metadata + actions.
 */
export function RouteDetailPanel({ authorId, routeId }: RouteDetailPanelProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session, publicKey } = useAuth();
  const map = useMapStore((s) => s.map);
  const loadFromExisting = useRouteCreationStore((s) => s.loadFromExisting);
  const openDirections = useRouteCreationStore((s) => s.open);
  // Indexer metadata + homeserver body fetched separately so a failure on
  // one side doesn't blank the whole page (e.g. homeserver unreachable
  // still surfaces distance/duration from the indexer).
  const meta = useRouteDetails(authorId, routeId);
  const body = useRouteBody(authorId, routeId);
  const data = meta.data;
  const isLoading = meta.isLoading;
  const error = meta.error as Error | null;
  const bodyAvailable = !!body.data;
  const bodyError = body.error as Error | null;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useAutoFocusLayer("routes");

  const decoded: LngLat[] = useMemo(() => {
    if (!body.data) return [];
    const poly = body.data.geometry?.polyline;
    if (poly) return decodePolyline(poly);
    return body.data.waypoints.map((w) => [w.lon, w.lat] as LngLat);
  }, [body.data]);

  // Pre-hydrate the directions store so a click on "Open in directions"
  // lands the user on an edit-ready sidebar without an extra fetch /
  // re-snap. Tracks the last-loaded key in a ref to avoid an infinite
  // update loop (loadFromExisting mutates a store this component reads
  // from). Slots stay populated even after this panel unmounts; the
  // next route detail overwrites them via loadFromExisting.
  const lastLoadedKey = useRef<string | null>(null);
  useEffect(() => {
    if (!body.data) return;
    const key = `${authorId}:${routeId}`;
    if (lastLoadedKey.current === key) return;
    lastLoadedKey.current = key;
    loadFromExisting(authorId, routeId, body.data);
  }, [authorId, routeId, body.data, loadFromExisting]);

  // Fit map to the route bounds. The detail panel now lives in the LEFT
  // sidebar (380px wide on md+), so pad the left edge instead of the
  // right. Mobile bottom sheet still gets the bottom padding.
  useEffect(() => {
    if (!map || !data) return;
    const isDesktop =
      typeof window !== "undefined" && window.innerWidth >= 640;
    map.fitBounds(
      [
        [data.min_lon, data.min_lat],
        [data.max_lon, data.max_lat],
      ],
      {
        padding: {
          top: 80,
          bottom: isDesktop ? 80 : 280,
          left: isDesktop ? 410 : 80,
          right: 80,
        },
        duration: 600,
        maxZoom: 16,
      },
    );
  }, [map, data]);

  // Top-right X always closes the entire sidebar back to the map.
  const close = () => navigate({ to: "/" });
  // Top-left back arrow steps back to the parent list (history pop)
  // so the tab + scroll position are preserved. Deep links fall back
  // to a direct /routes navigate.
  const back = useBackOr(() => navigate({ to: "/routes" }));

  if (isLoading) {
    return (
      <DiscoverSidebar title="Route" onClose={close} onBack={back} backLabel="Routes" mobileCollapsible>
        <p className="flex items-center gap-2 text-xs text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading route…
        </p>
      </DiscoverSidebar>
    );
  }
  if (error || !data) {
    return (
      <DiscoverSidebar title="Route" onClose={close} onBack={back} backLabel="Routes" mobileCollapsible>
        <p className="text-sm text-red-500">
          {error?.message ?? "Route not found"}
        </p>
      </DiscoverSidebar>
    );
  }

  const isOwner = publicKey === authorId;

  const handleExport = () => {
    if (!body.data) {
      toast.error("GPX export needs the route body, which couldn't be loaded.");
      return;
    }
    const gpx = emitGpx({
      name: data.name,
      description: data.description,
      waypoints: body.data.waypoints,
      geometry: body.data.geometry ? decoded : null,
    });
    const blob = new Blob([gpx], { type: "application/gpx+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = gpxFilename(data.name);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async () => {
    if (!session || !isOwner) return;
    setDeleting(true);
    try {
      await session.storage.delete(
        `/pub/mapky.app/routes/${routeId}` as `/pub/${string}`,
      );
      toast.success("Route deleted");
      queryClient.setQueryData<RouteDetails[]>(
        ["mapky", "routes", "user", publicKey],
        (old) =>
          (old ?? []).filter(
            (r) => !(r.author_id === authorId && r.id.endsWith(`:${routeId}`)),
          ),
      );
      navigate({ to: "/routes" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
      setDeleting(false);
    }
  };

  return (
    <>
      <RoutePolylineLayer coords={decoded} dashed={!body.data?.geometry} />

      <DiscoverSidebar title="Route" onClose={close} onBack={back} backLabel="Routes" mobileCollapsible>
        <div className="space-y-3">
          <div>
            <h2 className="truncate text-base font-semibold text-foreground">
              {data.name}
            </h2>
            <p className="text-[11px] uppercase text-muted">{data.activity}</p>
          </div>

          {data.description && (
            <p className="whitespace-pre-line text-sm text-foreground">
              {data.description}
            </p>
          )}

          <RouteStats
            distance_m={data.distance_m}
            duration_s={data.estimated_duration_s}
            elevation_gain_m={data.elevation_gain_m}
            elevation_loss_m={data.elevation_loss_m}
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                openDirections();
                navigate({ to: "/directions" });
              }}
              className="flex items-center gap-1.5 rounded-md bg-accent px-2 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
            >
              <Pencil className="h-3.5 w-3.5" />
              {isOwner ? "Edit" : "Open in directions"}
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-foreground hover:border-accent"
            >
              <Download className="h-3.5 w-3.5" />
              GPX
            </button>
            {isOwner && (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-foreground hover:border-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            )}
          </div>

          {confirmDelete && isOwner && (
            <div className="space-y-2 rounded-md border border-red-500/30 bg-red-50/50 p-2 text-xs dark:bg-red-950/30">
              <p className="text-foreground">
                Delete <span className="font-medium">{data.name}</span>? This
                cannot be undone.
              </p>
              <div className="flex justify-end gap-1.5">
                <button
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                  className="rounded-md border border-border bg-surface px-2 py-1 text-foreground hover:border-border/70 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex items-center gap-1 rounded-md bg-red-500 px-2 py-1 font-medium text-white hover:bg-red-600 disabled:opacity-50"
                >
                  {deleting ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                  Delete
                </button>
              </div>
            </div>
          )}

          <div className="border-t border-border/60 pt-2">
            <RouteTags authorId={authorId} routeId={routeId} />
          </div>

          <p className="text-[10px] text-muted">
            {data.waypoint_count} waypoints
            {body.data?.geometry
              ? ` · snapped via ${body.data.geometry.engine}`
              : bodyAvailable
                ? " · no snapped geometry"
                : body.isLoading
                  ? " · loading geometry…"
                  : " · polyline unavailable"}
          </p>

          {bodyError && !body.isLoading && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] dark:border-amber-800/60 dark:bg-amber-950/40">
              <p className="font-medium text-amber-800 dark:text-amber-300">
                Polyline unavailable
              </p>
              <p className="text-amber-700/80 dark:text-amber-300/70">
                Couldn't reach this route's body on the homeserver. Stats still
                come from the indexer; reload to retry.
              </p>
            </div>
          )}
        </div>
      </DiscoverSidebar>
    </>
  );
}
