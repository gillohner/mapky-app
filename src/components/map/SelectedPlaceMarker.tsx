import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { useMapStore } from "@/stores/map-store";
import { useUiStore } from "@/stores/ui-store";

const SEL_SOURCE = "mapky-selected-place";
const SEL_LAYER_FILL = "mapky-selected-fill";
const SEL_LAYER_LINE = "mapky-selected-line";

const HIGHLIGHT_COLOR = "#22c55e";

const PROTOMAPS_SOURCE = "protomaps";

const PROTOMAPS_SOURCE_LAYERS = [
  "buildings",
  "roads",
  "pois",
  "places",
  "water",
  "landuse",
  "landcover",
  "boundaries",
  "earth",
] as const;

function ensureLayers(map: maplibregl.Map) {
  if (!map.getSource(SEL_SOURCE)) {
    map.addSource(SEL_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }

  // Filled polygon (buildings, areas).
  if (!map.getLayer(SEL_LAYER_FILL)) {
    map.addLayer({
      id: SEL_LAYER_FILL,
      type: "fill",
      source: SEL_SOURCE,
      paint: {
        "fill-color": HIGHLIGHT_COLOR,
        "fill-opacity": 0.22,
      },
    });
  }

  // Stroke for line geometries (roads, paths). Polygons are excluded so the
  // line layer doesn't auto-outline tile-clipped multi-tile polygons.
  if (!map.getLayer(SEL_LAYER_LINE)) {
    map.addLayer({
      id: SEL_LAYER_LINE,
      type: "line",
      source: SEL_SOURCE,
      filter: [
        "any",
        ["==", ["geometry-type"], "LineString"],
        ["==", ["geometry-type"], "MultiLineString"],
      ],
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": HIGHLIGHT_COLOR,
        "line-width": 3,
        "line-opacity": 0.9,
      },
    });
  }
}

function queryGeometryById(
  map: maplibregl.Map,
  featureId: number,
): GeoJSON.Feature[] {
  if (!map.getSource(PROTOMAPS_SOURCE)) return [];

  const out: GeoJSON.Feature[] = [];
  const seen = new Set<string>();

  for (const sourceLayer of PROTOMAPS_SOURCE_LAYERS) {
    let features: ReturnType<typeof map.querySourceFeatures>;
    try {
      features = map.querySourceFeatures(PROTOMAPS_SOURCE, { sourceLayer });
    } catch {
      continue;
    }
    for (const f of features) {
      if (f.id !== featureId) continue;
      const key = `${sourceLayer}:${f.geometry.type}:${JSON.stringify(
        (f.geometry as { coordinates?: unknown }).coordinates,
      ).slice(0, 200)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        type: "Feature",
        geometry: f.geometry,
        properties: {},
      });
    }
  }

  return out;
}

function hasArea(features: GeoJSON.Feature[]): boolean {
  return features.some(
    (f) => f.geometry.type !== "Point" && f.geometry.type !== "MultiPoint",
  );
}

function createPinElement(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "mapky-place-pin";
  el.innerHTML = `
    <svg class="mapky-place-pin__icon" width="28" height="40" viewBox="0 0 28 40" aria-hidden="true">
      <path d="M14 2 C7 2 2 7 2 14 C2 22 14 38 14 38 C14 38 26 22 26 14 C26 7 21 2 14 2 Z"
            fill="${HIGHLIGHT_COLOR}" stroke="white" stroke-width="2"/>
      <circle cx="14" cy="14" r="4" fill="white"/>
    </svg>
    <span class="mapky-place-pin__label"></span>
  `;
  return el;
}

/**
 * Highlights the selected place. When the underlying tile feature is a
 * polygon or line (building, park, road), it's drawn as a translucent
 * fill / stroke. When it's just a point — or no tile geometry could be
 * resolved yet — we render a Google-Maps-style balloon pin with the
 * place name next to it instead of the previous circle/ring overlay.
 */
export function SelectedPlaceMarker() {
  const map = useMapStore((s) => s.map);
  const selected = useUiStore((s) => s.selectedFeature);
  const layerReady = useRef(false);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const pinElRef = useRef<HTMLDivElement | null>(null);

  // Recreate layers after style changes (theme/basemap toggles wipe style).
  useEffect(() => {
    if (!map) return;
    const onStyleData = () => {
      layerReady.current = false;
    };
    map.on("styledata", onStyleData);
    return () => {
      map.off("styledata", onStyleData);
    };
  }, [map]);

  // One Marker instance for the lifetime of the map. We attach/detach it
  // from the map and update label/position on selection changes.
  useEffect(() => {
    if (!map) return;
    const el = createPinElement();
    pinElRef.current = el;
    markerRef.current = new maplibregl.Marker({
      element: el,
      anchor: "bottom",
    });
    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      pinElRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    if (!map) return;
    const marker = markerRef.current;
    const pinEl = pinElRef.current;

    const apply = () => {
      if (!layerReady.current) {
        ensureLayers(map);
        layerReady.current = true;
      }

      const src = map.getSource(SEL_SOURCE) as
        | maplibregl.GeoJSONSource
        | undefined;
      if (!src) return;

      if (!selected) {
        src.setData({ type: "FeatureCollection", features: [] });
        marker?.remove();
        return;
      }

      const features = queryGeometryById(map, selected.featureId);
      const showAreaHighlight = hasArea(features);

      if (showAreaHighlight) {
        // Area / way found in tiles — fill/stroke handles the highlight,
        // hide the balloon pin.
        src.setData({ type: "FeatureCollection", features });
        marker?.remove();
      } else {
        // No area to highlight — drop a balloon pin at the place coords
        // with the name as a label.
        src.setData({ type: "FeatureCollection", features: [] });
        if (marker && pinEl) {
          const labelEl = pinEl.querySelector(
            ".mapky-place-pin__label",
          ) as HTMLSpanElement | null;
          if (labelEl) labelEl.textContent = selected.name ?? "";
          marker.setLngLat([selected.lng, selected.lat]);
          if (!marker.getElement().isConnected) marker.addTo(map);
          else marker.addTo(map); // idempotent
        }
      }
    };

    if (map.isStyleLoaded()) {
      apply();
    } else {
      map.once("idle", apply);
    }

    if (!selected) return;

    // Re-query on idle so the highlight refreshes once tiles around the
    // target finish loading (post-flyTo, pan/zoom into a building, etc.).
    map.on("idle", apply);
    return () => {
      map.off("idle", apply);
    };
  }, [map, selected]);

  return null;
}
