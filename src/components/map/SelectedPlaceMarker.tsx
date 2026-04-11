import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { useMapStore } from "@/stores/map-store";
import { useUiStore } from "@/stores/ui-store";

const SEL_SOURCE = "mapky-selected-place";
const SEL_LAYER_FILL = "mapky-selected-fill";
const SEL_LAYER_LINE = "mapky-selected-line";
const SEL_LAYER_GLOW = "mapky-selected-glow";
const SEL_LAYER_RING = "mapky-selected-ring";

const HIGHLIGHT_COLOR = "#22c55e";

/** Protomaps v4 vector tile source name (see lib/map/style.ts). */
const PROTOMAPS_SOURCE = "protomaps";

/**
 * Source layers in the protomaps v4 schema that carry OSM-referenceable
 * geometries. We query each one for the selected feature id so a building
 * polygon, road line, or POI point can all be highlighted.
 */
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

  // Filled polygon (buildings, areas). `fill` only renders Polygon/MultiPolygon.
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
  // line layer doesn't auto-outline tile-clipped multi-tile polygons with
  // the visible cut edges; clean polygon outlining across tile fragments is
  // an open problem (see git history) and the fill alone is acceptable for
  // now.
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

  // Outer glow for point geometries. MapLibre's circle layer renders at every
  // vertex by default — restrict to Point geometries so polygons/lines don't
  // get a circle on every corner.
  if (!map.getLayer(SEL_LAYER_GLOW)) {
    map.addLayer({
      id: SEL_LAYER_GLOW,
      type: "circle",
      source: SEL_SOURCE,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": 22,
        "circle-color": HIGHLIGHT_COLOR,
        "circle-opacity": 0.18,
        "circle-blur": 0.6,
      },
    });
  }

  // Crisp ring for point geometries.
  if (!map.getLayer(SEL_LAYER_RING)) {
    map.addLayer({
      id: SEL_LAYER_RING,
      type: "circle",
      source: SEL_SOURCE,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": 16,
        "circle-color": "transparent",
        "circle-stroke-width": 2.5,
        "circle-stroke-color": HIGHLIGHT_COLOR,
        "circle-stroke-opacity": 0.7,
      },
    });
  }
}

/**
 * Look up the selected feature's actual geometry by querying the protomaps
 * vector source across all OSM-bearing source layers. Returns every match
 * (a building may exist in multiple tiles when it straddles a boundary).
 */
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
      // Dedupe identical geometries returned from neighboring tiles.
      const key = `${sourceLayer}:${f.geometry.type}:${JSON.stringify(
        // Hash a small slice to keep this cheap.
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

/**
 * Highlights the selected place on top of the basemap. Renders the actual
 * tile geometry where available — filled fill for building/area polygons,
 * traced line for ways, and a dot/glow/ring for nodes — so the selection
 * mirrors how openstreetmap.org highlights features.
 *
 * Falls back to a point at the place coordinates when no tile geometry is
 * found (e.g. before tiles around the target finish loading).
 */
export function SelectedPlaceMarker() {
  const map = useMapStore((s) => s.map);
  const selected = useUiStore((s) => s.selectedFeature);
  const layerReady = useRef(false);

  // Recreate layers after style changes (theme toggle wipes the style).
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

  useEffect(() => {
    if (!map) return;

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
        return;
      }

      const features = queryGeometryById(map, selected.featureId);

      if (features.length === 0) {
        // Fallback: point at the place coordinates so the user always sees
        // *something* selected, even before tiles load.
        features.push({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [selected.lng, selected.lat],
          },
          properties: {},
        });
      }

      src.setData({ type: "FeatureCollection", features });
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
