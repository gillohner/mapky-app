import { useEffect, useMemo, useRef } from "react";
import type maplibregl from "maplibre-gl";
import { useMapStore } from "@/stores/map-store";
import {
  useRouteCreationStore,
  type RouteComputed,
} from "@/stores/route-creation-store";
import type { LngLat } from "@/lib/routing/types";

const SOURCE_LINES = "mapky-routes-alts-lines";
const SOURCE_LABELS = "mapky-routes-alts-labels";

const LAYER_INACTIVE_HIT = "mapky-routes-alts-inactive-hit";
const LAYER_INACTIVE_HALO = "mapky-routes-alts-inactive-halo";
const LAYER_INACTIVE_LINE = "mapky-routes-alts-inactive-line";
const LAYER_ACTIVE_HALO = "mapky-routes-alts-active-halo";
const LAYER_ACTIVE_LINE = "mapky-routes-alts-active-line";
const LAYER_FALLBACK_LINE = "mapky-routes-alts-fallback-line";
const LAYER_LABELS = "mapky-routes-alts-labels";

const COLOR_ACTIVE = "#1A73E8";
const COLOR_INACTIVE = "#9CA3AF";

interface RouteAlternativesLayerProps {
  /**
   * Optional fallback polyline drawn when there's no snapped result yet.
   * Rendered dashed; ignored when alternatives exist.
   */
  fallbackWaypoints?: LngLat[];
}

/**
 * Renders the directions-mode polylines: primary + each alternate.
 *
 *   Active route — bright blue, thick, with white halo
 *   Inactive routes — muted gray, with a floating midpoint label that
 *                     shows the time delta vs the active one and any
 *                     notable tags (via ferry / etc.)
 *
 * Clicking an inactive line/label promotes it to active. The active route
 * sits on top so clicks on it are no-ops (already selected).
 *
 * Used inside <DirectionsLayer />; <RoutePolylineLayer /> is still used
 * for the read-only saved-route viewer.
 */
export function RouteAlternativesLayer({
  fallbackWaypoints,
}: RouteAlternativesLayerProps) {
  const map = useMapStore((s) => s.map);
  const primary = useRouteCreationStore((s) => s.primary);
  const alternates = useRouteCreationStore((s) => s.alternates);
  const selected = useRouteCreationStore((s) => s.selectedAlternate);
  const selectAlternate = useRouteCreationStore((s) => s.selectAlternate);

  const lineFC = useMemo<GeoJSON.FeatureCollection>(() => {
    if (!primary || primary.decoded.length < 2) {
      // Fallback dashed line between user-input waypoints (pre-snap state).
      if (fallbackWaypoints && fallbackWaypoints.length >= 2) {
        return {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: {
                type: "LineString",
                coordinates: fallbackWaypoints,
              },
              properties: {
                routeIndex: 0,
                isActive: true,
                isFallback: true,
              },
            },
          ],
        };
      }
      return { type: "FeatureCollection", features: [] };
    }

    const features: GeoJSON.Feature[] = [];
    const all: { route: RouteComputed; index: number }[] = [
      { route: primary, index: 0 },
      ...alternates.map((a, i) => ({ route: a, index: i + 1 })),
    ];

    for (const { route, index } of all) {
      if (route.decoded.length < 2) continue;
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: route.decoded },
        properties: {
          routeIndex: index,
          isActive: index === selected,
          isFallback: false,
        },
      });
    }
    return { type: "FeatureCollection", features };
  }, [primary, alternates, selected, fallbackWaypoints]);

  // Floating midpoint labels for non-active alternatives. Only computed
  // when we have a real snapped active route to compare against.
  const labelFC = useMemo<GeoJSON.FeatureCollection>(() => {
    if (!primary) return { type: "FeatureCollection", features: [] };
    const active =
      selected === 0 ? primary : alternates[selected - 1] ?? primary;

    const features: GeoJSON.Feature[] = [];
    const all: { route: RouteComputed; index: number }[] = [
      { route: primary, index: 0 },
      ...alternates.map((a, i) => ({ route: a, index: i + 1 })),
    ];
    for (const { route, index } of all) {
      if (index === selected) continue;
      if (route.decoded.length < 2) continue;
      const text = labelFor(route, active);
      if (!text) continue;
      const [lng, lat] = midpointOf(route.decoded);
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [lng, lat] },
        properties: { routeIndex: index, text },
      });
    }
    return { type: "FeatureCollection", features };
  }, [primary, alternates, selected]);

  // Persist a ref to the click handler so we don't re-bind every render.
  const onClickRef = useRef<(e: maplibregl.MapMouseEvent) => void>(() => {});
  onClickRef.current = (e: maplibregl.MapMouseEvent) => {
    if (!map) return;
    const features = map.queryRenderedFeatures(e.point, {
      layers: [LAYER_INACTIVE_HIT, LAYER_LABELS],
    });
    if (!features.length) return;
    const idx = features[0].properties?.routeIndex;
    if (typeof idx === "number") {
      selectAlternate(idx);
    }
  };

  // Hold the latest computed data in a ref so `ensure()` (which can run
  // asynchronously via style.load) populates the sources with the
  // current values rather than the empty defaults that were captured
  // when the effect first scheduled.
  const lineFCRef = useRef<GeoJSON.FeatureCollection>(lineFC);
  const labelFCRef = useRef<GeoJSON.FeatureCollection>(labelFC);
  lineFCRef.current = lineFC;
  labelFCRef.current = labelFC;

  // Mount sources + layers once.
  useEffect(() => {
    if (!map) return;

    const ensure = () => {
      if (!map.getSource(SOURCE_LINES)) {
        map.addSource(SOURCE_LINES, {
          type: "geojson",
          data: lineFCRef.current,
        });
      }
      if (!map.getSource(SOURCE_LABELS)) {
        map.addSource(SOURCE_LABELS, {
          type: "geojson",
          data: labelFCRef.current,
        });
      }

      // Inactive: wide invisible click target + halo + line.
      if (!map.getLayer(LAYER_INACTIVE_HIT)) {
        map.addLayer({
          id: LAYER_INACTIVE_HIT,
          type: "line",
          source: SOURCE_LINES,
          filter: ["==", ["get", "isActive"], false],
          paint: { "line-color": "#000", "line-width": 18, "line-opacity": 0 },
          layout: { "line-cap": "round", "line-join": "round" },
        });
      }
      if (!map.getLayer(LAYER_INACTIVE_HALO)) {
        map.addLayer({
          id: LAYER_INACTIVE_HALO,
          type: "line",
          source: SOURCE_LINES,
          filter: ["==", ["get", "isActive"], false],
          paint: {
            "line-color": "#FFFFFF",
            "line-opacity": 0.5,
            "line-width": 8,
            "line-blur": 1,
          },
          layout: { "line-cap": "round", "line-join": "round" },
        });
      }
      if (!map.getLayer(LAYER_INACTIVE_LINE)) {
        map.addLayer({
          id: LAYER_INACTIVE_LINE,
          type: "line",
          source: SOURCE_LINES,
          filter: ["==", ["get", "isActive"], false],
          paint: {
            "line-color": COLOR_INACTIVE,
            "line-width": 4,
            "line-opacity": 0.9,
          },
          layout: { "line-cap": "round", "line-join": "round" },
        });
      }
      // Active: rendered last so it sits visually on top.
      if (!map.getLayer(LAYER_ACTIVE_HALO)) {
        map.addLayer({
          id: LAYER_ACTIVE_HALO,
          type: "line",
          source: SOURCE_LINES,
          filter: ["==", ["get", "isActive"], true],
          paint: {
            "line-color": "#FFFFFF",
            "line-opacity": 0.7,
            "line-width": 10,
            "line-blur": 1,
          },
          layout: { "line-cap": "round", "line-join": "round" },
        });
      }
      // Snapped active line: solid blue. We split snap-vs-fallback into
      // two layers because MapLibre's `line-dasharray` doesn't support
      // feature-data expressions — silently failing or dropping the
      // entire layer in some builds.
      if (!map.getLayer(LAYER_ACTIVE_LINE)) {
        map.addLayer({
          id: LAYER_ACTIVE_LINE,
          type: "line",
          source: SOURCE_LINES,
          filter: [
            "all",
            ["==", ["get", "isActive"], true],
            ["!=", ["get", "isFallback"], true],
          ],
          paint: { "line-color": COLOR_ACTIVE, "line-width": 6 },
          layout: { "line-cap": "round", "line-join": "round" },
        });
      }
      // Fallback (pre-snap): dashed gray line connecting waypoints in order.
      if (!map.getLayer(LAYER_FALLBACK_LINE)) {
        map.addLayer({
          id: LAYER_FALLBACK_LINE,
          type: "line",
          source: SOURCE_LINES,
          filter: ["==", ["get", "isFallback"], true],
          paint: {
            "line-color": COLOR_ACTIVE,
            "line-width": 4,
            "line-opacity": 0.7,
            "line-dasharray": [2, 2],
          },
          layout: { "line-cap": "round", "line-join": "round" },
        });
      }
      // Floating labels — only rendered for inactive alternatives.
      if (!map.getLayer(LAYER_LABELS)) {
        map.addLayer({
          id: LAYER_LABELS,
          type: "symbol",
          source: SOURCE_LABELS,
          layout: {
            "text-field": ["get", "text"],
            "text-size": 11,
            "text-font": ["Noto Sans Regular"],
            "text-padding": 4,
            "text-allow-overlap": false,
            "text-ignore-placement": false,
          },
          paint: {
            "text-color": "#374151",
            "text-halo-color": "#FFFFFF",
            "text-halo-width": 2,
            "text-halo-blur": 1,
          },
        });
      }
    };

    if (!map.isStyleLoaded()) {
      map.once("style.load", ensure);
    } else {
      ensure();
    }

    const handler = (e: maplibregl.MapMouseEvent) => onClickRef.current(e);
    const onEnter = () => (map.getCanvas().style.cursor = "pointer");
    const onLeave = () => (map.getCanvas().style.cursor = "");

    map.on("click", LAYER_INACTIVE_HIT, handler);
    map.on("click", LAYER_LABELS, handler);
    map.on("mouseenter", LAYER_INACTIVE_HIT, onEnter);
    map.on("mouseleave", LAYER_INACTIVE_HIT, onLeave);
    map.on("mouseenter", LAYER_LABELS, onEnter);
    map.on("mouseleave", LAYER_LABELS, onLeave);

    return () => {
      map.off("click", LAYER_INACTIVE_HIT, handler);
      map.off("click", LAYER_LABELS, handler);
      map.off("mouseenter", LAYER_INACTIVE_HIT, onEnter);
      map.off("mouseleave", LAYER_INACTIVE_HIT, onLeave);
      map.off("mouseenter", LAYER_LABELS, onEnter);
      map.off("mouseleave", LAYER_LABELS, onLeave);
      for (const id of [
        LAYER_LABELS,
        LAYER_FALLBACK_LINE,
        LAYER_ACTIVE_LINE,
        LAYER_ACTIVE_HALO,
        LAYER_INACTIVE_LINE,
        LAYER_INACTIVE_HALO,
        LAYER_INACTIVE_HIT,
      ]) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      for (const id of [SOURCE_LABELS, SOURCE_LINES]) {
        if (map.getSource(id)) map.removeSource(id);
      }
    };
  }, [map]);

  // Sync data on every change.
  useEffect(() => {
    if (!map) return;
    const linesSrc = map.getSource(SOURCE_LINES) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (linesSrc) linesSrc.setData(lineFC);
    const labelsSrc = map.getSource(SOURCE_LABELS) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (labelsSrc) labelsSrc.setData(labelFC);
  }, [map, lineFC, labelFC]);

  return null;
}

/** Pick a stable midpoint coordinate for the label. */
function midpointOf(coords: LngLat[]): LngLat {
  if (coords.length === 0) return [0, 0];
  if (coords.length === 1) return coords[0];
  return coords[Math.floor(coords.length / 2)];
}

/**
 * Build the floating label for an inactive alternate. Examples:
 *   "+5 min"
 *   "−2 min"
 *   "+3 min · via ferry"
 *   "via ferry"   (when duration delta is < 1 min)
 */
function labelFor(alt: RouteComputed, active: RouteComputed): string {
  const dt = alt.duration_s - active.duration_s;
  const minDelta = Math.round(dt / 60);
  const parts: string[] = [];
  if (Math.abs(minDelta) >= 1) {
    const sign = minDelta > 0 ? "+" : "−";
    parts.push(`${sign}${Math.abs(minDelta)} min`);
  }
  if (alt.hasFerry) parts.push("via ferry");
  return parts.join(" · ");
}
