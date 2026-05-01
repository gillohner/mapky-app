import { useEffect, useRef, useCallback, useState } from "react";
import type maplibregl from "maplibre-gl";
import { useNavigate } from "@tanstack/react-router";
import { useMapStore } from "@/stores/map-store";
import { useUiStore } from "@/stores/ui-store";
import { useRouteCreationStore } from "@/stores/route-creation-store";
import {
  useViewportCaptures,
  useSequenceMembersFanOut,
} from "@/lib/api/hooks";
import { useLayerOpacityMultiplier } from "@/lib/map/dim";

import type { GeoCaptureDetails, ViewportBounds } from "@/types/mapky";

const SOURCE = "mapky-captures";
const POINT_DOT = "mapky-capture-point-dot";
const POINT_ARROW = "mapky-capture-point-arrow";

function capturesToGeoJSON(
  captures: GeoCaptureDetails[],
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: captures.map((c) => {
      const [authorId, captureId] = c.id.split(":");
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [c.lon, c.lat] },
        properties: {
          author_id: authorId,
          capture_id: captureId,
          kind: c.kind,
          heading: c.heading ?? -1,
          has_heading: c.heading != null,
        },
      };
    }),
  };
}

function getAccent(theme: "light" | "dark") {
  return theme === "dark" ? "#38bdf8" : "#0284c7";
}

function ensureLayers(map: maplibregl.Map, theme: "light" | "dark") {
  const accent = getAccent(theme);

  if (!map.getSource(SOURCE)) {
    map.addSource(SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }

  if (!map.getLayer(POINT_DOT)) {
    map.addLayer({
      id: POINT_DOT,
      type: "circle",
      source: SOURCE,
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          8,
          2,
          14,
          5,
          18,
          8,
        ],
        "circle-color": accent,
        "circle-opacity": 0.9,
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#fff",
      },
    });
  }

  if (!map.getLayer(POINT_ARROW)) {
    map.addLayer({
      id: POINT_ARROW,
      type: "symbol",
      source: SOURCE,
      filter: ["==", ["get", "has_heading"], true],
      layout: {
        "text-field": "▲",
        "text-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          12,
          10,
          18,
          16,
        ],
        "text-rotate": ["get", "heading"],
        "text-rotation-alignment": "map",
        "text-allow-overlap": true,
        "text-ignore-placement": true,
        "text-offset": [0, -0.9],
      },
      paint: {
        "text-color": accent,
        "text-halo-color": "#fff",
        "text-halo-width": 1.2,
      },
    });
  }
}

/**
 * Shows individual GeoCapture markers on the map — no clustering.
 * Coverage lines are handled by SequenceCoverageLayer.
 */
export function CaptureMarkersLayer() {
  const map = useMapStore((s) => s.map);
  const theme = useMapStore((s) => s.theme);
  const navigate = useNavigate();

  const [bounds, setBounds] = useState<ViewportBounds | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const layerReady = useRef(false);

  const updateBounds = useCallback(() => {
    if (!map) return;
    const b = map.getBounds();
    setBounds({
      minLat: b.getSouth(),
      minLon: b.getWest(),
      maxLat: b.getNorth(),
      maxLon: b.getEast(),
    });
  }, [map]);

  useEffect(() => {
    if (!map) return;
    const onMoveEnd = () => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(updateBounds, 500);
    };
    if (map.loaded()) updateBounds();
    else map.once("load", updateBounds);
    map.on("moveend", onMoveEnd);
    return () => {
      map.off("moveend", onMoveEnd);
      clearTimeout(debounceRef.current);
    };
  }, [map, updateBounds]);

  const { data: captures } = useViewportCaptures(bounds);
  const visibleIds = useUiStore((s) => s.visibleCaptureIds);
  const pinned = useUiStore((s) => s.pinnedCaptures);
  // Pull in every sequence's full member list so dots that anchor the
  // SequenceCoverageLayer's polyline outside the viewport still render
  // — otherwise the line would visibly end on a missing endpoint when
  // the next sibling is just past the bbox.
  const { extras: seqExtras } = useSequenceMembersFanOut(captures);

  // Same source-races-style-load pattern as MapkyPlacesLayer: hold
  // current GeoJSON in a ref so the deferred "idle" / styledata
  // re-attach can populate without waiting for another React render.
  const dataRef = useRef<GeoJSON.FeatureCollection>({
    type: "FeatureCollection",
    features: [],
  });

  useEffect(() => {
    if (!map) return;

    const setup = () => {
      if (!layerReady.current) {
        ensureLayers(map, theme);
        layerReady.current = true;
      }
      const src = map.getSource(SOURCE) as
        | maplibregl.GeoJSONSource
        | undefined;
      src?.setData(dataRef.current);
    };

    const onStyleData = () => {
      layerReady.current = false;
      setup();
    };
    map.on("styledata", onStyleData);

    if (map.isStyleLoaded()) setup();
    else map.once("idle", setup);

    return () => {
      map.off("styledata", onStyleData);
    };
  }, [map, theme]);

  useEffect(() => {
    const base = captures?.length
      ? visibleIds
        ? captures.filter((c) => visibleIds.has(c.id))
        : captures
      : [];
    // Stack three sources: viewport (filtered), pinned siblings from
    // the active capture detail panel, and the sequence members
    // fan-out for any sequence touching the viewport. Dedupe by id so
    // the line never looks orphaned at a viewport edge.
    const seen = new Set(base.map((c) => c.id));
    const merged = [...base];
    for (const c of pinned ?? []) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      merged.push(c);
    }
    for (const c of seqExtras) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      merged.push(c);
    }
    dataRef.current = merged.length
      ? capturesToGeoJSON(merged)
      : { type: "FeatureCollection", features: [] };
    if (!map) return;
    const src = map.getSource(SOURCE) as maplibregl.GeoJSONSource | undefined;
    src?.setData(dataRef.current);
  }, [map, captures, visibleIds, pinned, seqExtras]);

  const dim = useLayerOpacityMultiplier("captures");
  useEffect(() => {
    if (!map) return;
    const apply = () => {
      if (map.getLayer(POINT_DOT)) {
        map.setPaintProperty(POINT_DOT, "circle-opacity", 0.9 * dim);
        map.setPaintProperty(POINT_DOT, "circle-stroke-opacity", dim);
      }
      if (map.getLayer(POINT_ARROW)) {
        map.setPaintProperty(POINT_ARROW, "text-opacity", dim);
      }
    };
    apply();
    map.on("styledata", apply);
    return () => {
      map.off("styledata", apply);
    };
  }, [map, dim]);

  useEffect(() => {
    if (!map) return;

    const onPointClick = (e: maplibregl.MapMouseEvent) => {
      if (useRouteCreationStore.getState().isOpen) return;
      const features = map.queryRenderedFeatures(e.point, {
        layers: [POINT_DOT, POINT_ARROW],
      });
      if (!features.length) return;

      const props = features[0].properties;
      const authorId = props?.author_id;
      const captureId = props?.capture_id;
      if (!authorId || !captureId) return;

      e.originalEvent.stopPropagation();

      navigate({
        to: "/capture/$authorId/$captureId",
        params: { authorId, captureId },
      });
    };

    map.on("click", POINT_DOT, onPointClick);
    map.on("click", POINT_ARROW, onPointClick);
    return () => {
      map.off("click", POINT_DOT, onPointClick);
      map.off("click", POINT_ARROW, onPointClick);
    };
  }, [map, navigate]);

  return null;
}
