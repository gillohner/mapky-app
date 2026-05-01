import { useEffect, useRef, useCallback, useState, useMemo } from "react";
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

const SOURCE = "mapky-sequence-lines";
const LINE_LAYER = "mapky-sequence-line";

function buildCoverageGeoJSON(
  captures: GeoCaptureDetails[],
): GeoJSON.FeatureCollection {
  const bySeq = new Map<string, GeoCaptureDetails[]>();
  for (const c of captures) {
    if (!c.sequence_uri) continue;
    let arr = bySeq.get(c.sequence_uri);
    if (!arr) {
      arr = [];
      bySeq.set(c.sequence_uri, arr);
    }
    arr.push(c);
  }

  const features: GeoJSON.Feature[] = [];
  for (const [seqUri, members] of bySeq) {
    if (members.length < 2) continue;
    const sorted = [...members].sort(
      (a, b) => (a.sequence_index ?? 0) - (b.sequence_index ?? 0),
    );
    const coords = sorted.map((m) => [m.lon, m.lat]);
    const firstId = sorted[0].id;
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: coords },
      properties: { sequence_uri: seqUri, first_capture_id: firstId },
    });
  }

  return { type: "FeatureCollection", features };
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

  if (!map.getLayer(LINE_LAYER)) {
    map.addLayer(
      {
        id: LINE_LAYER,
        type: "line",
        source: SOURCE,
        paint: {
          "line-color": accent,
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            2,
            16,
            5,
          ],
          // Kept light so the line reads as connective tissue between
          // dots rather than a primary feature — at 0.6 it competed
          // with the basemap's road network and made the dots harder
          // to pick out.
          "line-opacity": 0.35,
        },
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
      },
      "mapky-capture-point-dot",
    );
  }
}

/**
 * Renders coverage polylines for sequences on the map.
 * Groups viewport captures by sequence_uri and draws a line per sequence.
 * Click a line → navigate to the first capture in that sequence.
 */
export function SequenceCoverageLayer() {
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
  // Fan out a sequence-members fetch for every sequence the viewport
  // touches. Without this the polyline stops at the viewport edge —
  // any siblings outside the bbox aren't in `captures` so the line
  // segment between them never gets drawn. We still gate filtering on
  // `visibleIds` (sidebar filter) but only on the viewport set, so a
  // sequence that bleeds out of the bbox stays whole.
  const { extras: seqExtras } = useSequenceMembersFanOut(captures);

  const geojson = useMemo(() => {
    const base = captures?.length
      ? visibleIds
        ? captures.filter((c) => visibleIds.has(c.id))
        : captures
      : [];
    // Stack three sources: viewport (filtered), pinned siblings from
    // the active capture detail panel, and the sequence members
    // fan-out for any sequence touching the viewport. Dedupe by id.
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
    return merged.length ? buildCoverageGeoJSON(merged) : null;
  }, [captures, visibleIds, pinned, seqExtras]);

  // Hold latest GeoJSON in a ref so the deferred "idle" / styledata
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
    dataRef.current = geojson ?? { type: "FeatureCollection", features: [] };
    if (!map) return;
    const src = map.getSource(SOURCE) as maplibregl.GeoJSONSource | undefined;
    src?.setData(dataRef.current);
  }, [map, geojson]);

  const dim = useLayerOpacityMultiplier("captures");
  useEffect(() => {
    if (!map) return;
    const apply = () => {
      if (map.getLayer(LINE_LAYER)) {
        map.setPaintProperty(LINE_LAYER, "line-opacity", 0.35 * dim);
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

    const onClick = (e: maplibregl.MapMouseEvent) => {
      if (useRouteCreationStore.getState().isOpen) return;
      const features = map.queryRenderedFeatures(e.point, {
        layers: [LINE_LAYER],
      });
      if (!features.length) return;

      const firstCaptureId = features[0].properties?.first_capture_id;
      if (!firstCaptureId) return;

      e.originalEvent.stopPropagation();
      const [authorId, captureId] = firstCaptureId.split(":");
      if (authorId && captureId) {
        navigate({
          to: "/capture/$authorId/$captureId",
          params: { authorId, captureId },
        });
      }
    };

    map.on("click", LINE_LAYER, onClick);

    const onMouseEnter = () => {
      if (map.getLayer(LINE_LAYER)) map.getCanvas().style.cursor = "pointer";
    };
    const onMouseLeave = () => {
      map.getCanvas().style.cursor = "";
    };
    map.on("mouseenter", LINE_LAYER, onMouseEnter);
    map.on("mouseleave", LINE_LAYER, onMouseLeave);

    return () => {
      map.off("click", LINE_LAYER, onClick);
      map.off("mouseenter", LINE_LAYER, onMouseEnter);
      map.off("mouseleave", LINE_LAYER, onMouseLeave);
    };
  }, [map, navigate]);

  return null;
}
