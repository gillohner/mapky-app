import { useEffect, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Edit2, Loader2, Trash2 } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useMapStore } from "@/stores/map-store";
import { useRoute } from "@/lib/api/hooks";
import { useRouteCreationStore } from "@/stores/route-creation-store";
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
  const { data, isLoading, error } = useRoute(authorId, routeId);

  // Decode the stored polyline for rendering. Falls back to straight lines
  // between waypoints when there's no snapped geometry.
  const decoded: LngLat[] = useMemo(() => {
    const poly = data?.body.geometry?.polyline;
    if (poly) return decodePolyline(poly);
    return data?.body.waypoints.map((w) => [w.lon, w.lat] as LngLat) ?? [];
  }, [data]);

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
    loadFromExisting(authorId, routeId, data.body);
    navigate({ to: "/directions" });
  };

  const handleExport = () => {
    const gpx = emitGpx({
      name: data.name,
      description: data.description,
      waypoints: data.body.waypoints,
      geometry: data.body.geometry ? decoded : null,
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
    if (!confirm("Delete this route? This cannot be undone.")) return;
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
    }
  };

  return (
    <>
      <RoutePolylineLayer coords={decoded} dashed={!data.body.geometry} />

      <div className="pointer-events-auto fixed inset-x-2 bottom-2 z-30 max-h-[60vh] overflow-y-auto rounded-lg border border-border bg-background/95 p-3 shadow-lg backdrop-blur-sm sm:inset-x-auto sm:right-2 sm:top-2 sm:bottom-auto sm:w-96">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-foreground">
              {data.name}
            </h2>
            <p className="text-[11px] uppercase text-muted">
              {data.activity}
              {data.difficulty ? ` · ${data.difficulty}` : ""}
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
              onClick={handleDelete}
              className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-foreground hover:border-red-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          )}
        </div>

        <p className="mt-2 text-[10px] text-muted">
          {data.waypoint_count} waypoints
          {data.body.geometry
            ? ` · snapped via ${data.body.geometry.engine}`
            : " · no snapped geometry"}
        </p>
      </div>
    </>
  );
}
