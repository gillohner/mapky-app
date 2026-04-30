import { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import { useMapStore } from "@/stores/map-store";
import { readRouteBody } from "@/lib/pubky/storage";
import { decodePolyline } from "@/lib/routing/polyline";
import type { RouteDetails, RouteFullJson } from "@/types/mapky";

interface Props {
  routes: RouteDetails[] | undefined;
}

const SOURCE = "mapky-routes-index";
const LINES_LAYER = "mapky-routes-index-lines";
const HALO_LAYER = "mapky-routes-index-halo";
const STARTS_SOURCE = "mapky-routes-index-starts";
const STARTS_LAYER = "mapky-routes-index-starts-dots";

/** Per-route hue palette so adjacent polylines stay visually
 * distinguishable. Same set as collection overlays for visual
 * consistency across the app. */
const ROUTE_COLORS = [
  "#3b82f6", // blue
  "#a855f7", // purple
  "#f97316", // orange
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#eab308", // yellow
  "#ef4444", // red
  "#22c55e", // green
  "#8b5cf6", // violet
];

/** Stable color per (authorId, routeId) — same route across re-renders
 * keeps its color even as the routes list reorders. Exported so the
 * RouteCard list rows can show a matching color stripe. */
export function routeColor(authorId: string, routeId: string): string {
  const key = `${authorId}:${routeId}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return ROUTE_COLORS[Math.abs(h) % ROUTE_COLORS.length];
}

/**
 * Renders every route in a list (Mine or Viewport) as a polyline on the
 * map. Bodies are stored on each author's homeserver, so we batch-fetch
 * them through TanStack `useQueries` — same cache key as the detail
 * view's `useRouteBody`, so opening a route detail later is instant.
 *
 * Click any line/start marker → navigate to that route's detail page.
 *
 * The layer is intentionally a sibling of `RoutePolylineLayer` (used by
 * the detail view): same map, different sourceId, so they don't fight.
 */
export function RoutesIndexLayer({ routes }: Props) {
  const map = useMapStore((s) => s.map);
  const navigate = useNavigate();

  // Stable list of route refs for useQueries — splits compound id into
  // (author, route) once so the fetcher signature stays a pair.
  const refs = useMemo(
    () =>
      (routes ?? []).map((r) => {
        const idx = r.id.indexOf(":");
        const authorId = idx >= 0 ? r.id.slice(0, idx) : r.author_id;
        const routeId = idx >= 0 ? r.id.slice(idx + 1) : r.id;
        return { meta: r, authorId, routeId };
      }),
    [routes],
  );

  const bodies = useQueries({
    queries: refs.map((r) => ({
      queryKey: ["mapky", "route-body", r.authorId, r.routeId],
      queryFn: () => readRouteBody<RouteFullJson>(r.authorId, r.routeId),
      enabled: !!r.authorId && !!r.routeId,
      staleTime: 5 * 60_000,
      retry: false,
    })),
  });

  // Compose lines + start markers as two separate FeatureCollections —
  // line + circle layers can't share a source cleanly without filters.
  const { lineFC, startFC } = useMemo(() => {
    const lines: Feature<LineString>[] = [];
    const starts: Feature<Point>[] = [];
    refs.forEach((r, i) => {
      const body = bodies[i].data;
      const props = {
        author_id: r.authorId,
        route_id: r.routeId,
        name: r.meta.name ?? "",
        activity: r.meta.activity,
        color: routeColor(r.authorId, r.routeId),
      };
      if (body?.geometry?.polyline) {
        const coords = decodePolyline(body.geometry.polyline);
        if (coords.length >= 2) {
          lines.push({
            type: "Feature",
            geometry: { type: "LineString", coordinates: coords },
            properties: props,
          });
        }
      }
      // Always plot a start marker so the route is still findable
      // before its body resolves (or if the homeserver fails).
      const lat = r.meta.start_lat ?? r.meta.min_lat;
      const lon = r.meta.start_lon ?? r.meta.min_lon;
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        starts.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [lon, lat] },
          properties: props,
        });
      }
    });
    return {
      lineFC: { type: "FeatureCollection", features: lines } as FeatureCollection<LineString>,
      startFC: { type: "FeatureCollection", features: starts } as FeatureCollection<Point>,
    };
  }, [refs, bodies]);

  // Hold latest data in refs so the styledata re-attach (after a
  // basemap/theme swap) can repopulate without waiting for React.
  const lineRef = useRef<FeatureCollection<LineString>>(lineFC);
  const startRef = useRef<FeatureCollection<Point>>(startFC);
  lineRef.current = lineFC;
  startRef.current = startFC;

  useEffect(() => {
    if (!map) return;

    const ensure = () => {
      try {
        if (!map.getSource(SOURCE)) {
          map.addSource(SOURCE, { type: "geojson", data: lineRef.current });
        } else {
          (map.getSource(SOURCE) as maplibregl.GeoJSONSource).setData(
            lineRef.current,
          );
        }
        if (!map.getSource(STARTS_SOURCE)) {
          map.addSource(STARTS_SOURCE, {
            type: "geojson",
            data: startRef.current,
          });
        } else {
          (map.getSource(STARTS_SOURCE) as maplibregl.GeoJSONSource).setData(
            startRef.current,
          );
        }
        if (!map.getLayer(HALO_LAYER)) {
          map.addLayer({
            id: HALO_LAYER,
            type: "line",
            source: SOURCE,
            paint: {
              "line-color": "#FFFFFF",
              "line-opacity": 0.6,
              "line-width": 7,
              "line-blur": 1,
            },
            layout: { "line-cap": "round", "line-join": "round" },
          });
        }
        if (!map.getLayer(LINES_LAYER)) {
          map.addLayer({
            id: LINES_LAYER,
            type: "line",
            source: SOURCE,
            paint: {
              "line-color": ["get", "color"],
              "line-width": 4,
              "line-opacity": 0.85,
            },
            layout: { "line-cap": "round", "line-join": "round" },
          });
        }
        if (!map.getLayer(STARTS_LAYER)) {
          map.addLayer({
            id: STARTS_LAYER,
            type: "circle",
            source: STARTS_SOURCE,
            paint: {
              "circle-radius": 6,
              "circle-color": ["get", "color"],
              "circle-stroke-color": "#FFFFFF",
              "circle-stroke-width": 2,
            },
          });
        }
      } catch {
        // Style not ready — styledata listener below retries.
      }
    };

    ensure();
    const onStyleData = () => {
      if (!map.getSource(SOURCE) || !map.getLayer(LINES_LAYER)) ensure();
    };
    map.on("styledata", onStyleData);

    // Pointer cursor + click → detail. Hooked once; cleanup removes both.
    const onMouseEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const onMouseLeave = () => {
      map.getCanvas().style.cursor = "";
    };
    const onClick = (
      e: maplibregl.MapLayerMouseEvent | maplibregl.MapLayerTouchEvent,
    ) => {
      const f = e.features?.[0];
      if (!f) return;
      const authorId = f.properties?.author_id as string | undefined;
      const routeId = f.properties?.route_id as string | undefined;
      if (!authorId || !routeId) return;
      navigate({
        to: "/route/$authorId/$routeId",
        params: { authorId, routeId },
      });
    };
    for (const id of [LINES_LAYER, HALO_LAYER, STARTS_LAYER]) {
      map.on("mouseenter", id, onMouseEnter);
      map.on("mouseleave", id, onMouseLeave);
      map.on("click", id, onClick);
    }

    return () => {
      map.off("styledata", onStyleData);
      for (const id of [LINES_LAYER, HALO_LAYER, STARTS_LAYER]) {
        map.off("mouseenter", id, onMouseEnter);
        map.off("mouseleave", id, onMouseLeave);
        map.off("click", id, onClick);
      }
      if (map.getLayer(STARTS_LAYER)) map.removeLayer(STARTS_LAYER);
      if (map.getLayer(LINES_LAYER)) map.removeLayer(LINES_LAYER);
      if (map.getLayer(HALO_LAYER)) map.removeLayer(HALO_LAYER);
      if (map.getSource(STARTS_SOURCE)) map.removeSource(STARTS_SOURCE);
      if (map.getSource(SOURCE)) map.removeSource(SOURCE);
    };
  }, [map, navigate]);

  // Push fresh data when the bodies finish loading — `ensure()` already
  // handles the first paint via dataRef, this keeps subsequent updates
  // (route added/removed, bodies arriving) flowing.
  useEffect(() => {
    if (!map) return;
    const lineSrc = map.getSource(SOURCE) as
      | maplibregl.GeoJSONSource
      | undefined;
    const startSrc = map.getSource(STARTS_SOURCE) as
      | maplibregl.GeoJSONSource
      | undefined;
    lineSrc?.setData(lineFC);
    startSrc?.setData(startFC);
  }, [map, lineFC, startFC]);

  return null;
}
