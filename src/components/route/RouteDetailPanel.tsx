import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Edit2, Loader2, Trash2 } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useMapStore } from "@/stores/map-store";
import { useRouteBody, useRouteDetails } from "@/lib/api/hooks";
import { useRouteCreationStore } from "@/stores/route-creation-store";
import { useAutoFocusLayer } from "@/hooks/use-auto-focus-layer";
import { decodePolyline } from "@/lib/routing/polyline";
import { emitGpx, gpxFilename } from "@/lib/gpx/emit";
import type { LngLat } from "@/lib/routing/types";
import type { RouteDetails } from "@/types/mapky";
import { RoutePolylineLayer } from "@/components/map/RoutePolylineLayer";
import { RouteStats } from "./RouteStats";

interface RouteDetailPanelProps {
  authorId: string;
  routeId: string;
}

export function RouteDetailPanel({ authorId, routeId }: RouteDetailPanelProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session, publicKey } = useAuth();
  const map = useMapStore((s) => s.map);
  const loadFromExisting = useRouteCreationStore((s) => s.loadFromExisting);
  // Indexer metadata + homeserver body are fetched separately so a
  // failure on one doesn't blank the whole page. Common failure modes:
  // homeserver offline / unreachable on the user's network → still want
  // to show distance/duration/activity from the indexer with a clear
  // "polyline unavailable" notice instead of "Route not found".
  const meta = useRouteDetails(authorId, routeId);
  const body = useRouteBody(authorId, routeId);
  const data = meta.data;
  const isLoading = meta.isLoading;
  const error = meta.error as Error | null;
  const bodyAvailable = !!body.data;
  const bodyError = body.error as Error | null;
  // Hoisted above the early-return branches so the hook order is stable
  // across renders. (React: "Rendered more hooks than during the
  // previous render" if the loading branch returns early before us.)
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useAutoFocusLayer("routes");

  // Decode the stored polyline for rendering. Falls back to straight lines
  // between waypoints when there's no snapped geometry; renders nothing
  // if the body fetch failed entirely.
  const decoded: LngLat[] = useMemo(() => {
    if (!body.data) return [];
    const poly = body.data.geometry?.polyline;
    if (poly) return decodePolyline(poly);
    return body.data.waypoints.map((w) => [w.lon, w.lat] as LngLat);
  }, [body.data]);

  // Fit map to the route bounds whenever a route loads. The detail card
  // is pinned to the right on md+ (sm:right-2 sm:w-96 ≈ 392 px) and to the
  // bottom on mobile, so pad the appropriate edge to keep the polyline
  // out from under the card.
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
          left: 80,
          right: isDesktop ? 410 : 80,
        },
        duration: 600,
        maxZoom: 16,
      },
    );
  }, [map, data]);

  if (isLoading) {
    return (
      <div className="pointer-events-auto fixed inset-x-2 top-2 z-30 rounded-lg border border-border bg-background/95 p-3 text-sm text-muted shadow-lg backdrop-blur-sm sm:right-2 sm:left-auto sm:w-96">
        <Loader2 className="mr-2 inline-block h-4 w-4 animate-spin" />
        Loading route…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="pointer-events-auto fixed inset-x-2 top-2 z-30 rounded-lg border border-border bg-background/95 p-3 text-sm text-red-500 shadow-lg backdrop-blur-sm sm:right-2 sm:left-auto sm:w-96">
        {error?.message ?? "Route not found"}
      </div>
    );
  }

  const isOwner = publicKey === authorId;

  const handleEdit = () => {
    if (!body.data) {
      toast.error("Can't edit until the route body loads.");
      return;
    }
    loadFromExisting(authorId, routeId, body.data);
    navigate({ to: "/directions" });
  };

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
      <RoutePolylineLayer
        coords={decoded}
        dashed={!body.data?.geometry}
      />

      <div className="pointer-events-auto fixed inset-x-2 bottom-2 z-30 max-h-[60vh] overflow-y-auto rounded-lg border border-border bg-background/95 p-3 shadow-lg backdrop-blur-sm sm:inset-x-auto sm:right-2 sm:top-2 sm:bottom-auto sm:w-96">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-foreground">
              {data.name}
            </h2>
            <p className="text-[11px] uppercase text-muted">
              {data.activity}
            </p>
          </div>
          <button
            onClick={() => navigate({ to: "/routes" })}
            className="rounded p-1 text-muted hover:text-foreground"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {data.description && (
          <p className="mb-2 whitespace-pre-line text-sm text-foreground">
            {data.description}
          </p>
        )}

        <RouteStats
          distance_m={data.distance_m}
          duration_s={data.estimated_duration_s}
          elevation_gain_m={data.elevation_gain_m}
          elevation_loss_m={data.elevation_loss_m}
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={handleEdit}
            className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-foreground hover:border-accent"
          >
            <Edit2 className="h-3.5 w-3.5" />
            Edit (creates new)
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

        {/* Inline delete confirmation. Same pattern as
            CollectionActions — feels native to the app instead of the
            jarring browser confirm() dialog. */}
        {confirmDelete && isOwner && (
          <div className="mt-2 space-y-2 rounded-md border border-red-500/30 bg-red-50/50 p-2 text-xs dark:bg-red-950/30">
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

        <p className="mt-2 text-[10px] text-muted">
          {data.waypoint_count} waypoints
          {body.data?.geometry
            ? ` · snapped via ${body.data.geometry.engine}`
            : bodyAvailable
              ? " · no snapped geometry"
              : body.isLoading
                ? " · loading geometry…"
                : " · polyline unavailable"}
        </p>

        {/* Body fetch failed entirely — homeserver offline, network
            blocked, or the JSON has been deleted. Indexer metadata still
            shows above; flag the missing geometry so the user knows the
            map isn't drawing the actual path. */}
        {bodyError && !body.isLoading && (
          <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] dark:border-amber-800/60 dark:bg-amber-950/40">
            <p className="font-medium text-amber-800 dark:text-amber-300">
              Polyline unavailable
            </p>
            <p className="text-amber-700/80 dark:text-amber-300/70">
              Couldn't reach this route's body on the homeserver. Stats
              still come from the indexer; reload to retry.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
