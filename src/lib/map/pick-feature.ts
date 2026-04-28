import type maplibregl from "maplibre-gl";
import { decodeFeatureId } from "@/lib/map/feature-id";

const POI_LAYERS = ["pois"];
const PLACE_LAYERS = [
  "places_subplace",
  "places_locality",
  "places_region",
  "places_country",
];
const BUILDING_LAYERS = ["buildings"];

/** Pixels of tolerance for near-miss POI clicks. */
const POI_TOLERANCE = 20;

export interface FeatureHit {
  osmType: string;
  osmId: number;
  name: string;
  kind: string;
  sourceLayer: string;
  /** Feature's actual coordinates (if point geometry). */
  lng?: number;
  lat?: number;
}

function tryDecode(f: maplibregl.MapGeoJSONFeature): FeatureHit | null {
  if (typeof f.id !== "number" || f.id <= 0) return null;
  const decoded = decodeFeatureId(f.id);
  if (!decoded) return null;
  const hit: FeatureHit = {
    ...decoded,
    name: f.properties?.name ? String(f.properties.name) : "",
    kind: f.properties?.kind ? String(f.properties.kind) : "",
    sourceLayer: f.sourceLayer ?? "",
  };
  if (f.geometry.type === "Point") {
    const [lng, lat] = f.geometry.coordinates as [number, number];
    hit.lng = lng;
    hit.lat = lat;
  }
  return hit;
}

function findNearest(
  features: maplibregl.MapGeoJSONFeature[],
  map: maplibregl.Map,
  clickPx: { x: number; y: number },
): FeatureHit | null {
  let best: FeatureHit | null = null;
  let bestDist = Infinity;

  for (const f of features) {
    const hit = tryDecode(f);
    if (!hit) continue;

    let dist = 0;
    if (f.geometry.type === "Point") {
      const coords = f.geometry.coordinates as [number, number];
      const pt = map.project(coords);
      dist = Math.hypot(pt.x - clickPx.x, pt.y - clickPx.y);
    }

    if (dist < bestDist) {
      best = hit;
      bestDist = dist;
    }
  }

  return best;
}

function existingLayers(map: maplibregl.Map, ids: string[]): string[] {
  return ids.filter((id) => map.getLayer(id));
}

function firstDecodable(
  features: maplibregl.MapGeoJSONFeature[],
): FeatureHit | null {
  for (const f of features) {
    const hit = tryDecode(f);
    if (hit) return hit;
  }
  return null;
}

/**
 * Layered feature picker. Checks (in order): POI under cursor, place
 * label (city/town/country), nearby POI within a 20-px tolerance, and
 * finally building polygon. Each step uses a filtered
 * queryRenderedFeatures so higher-priority layers can't be shadowed by
 * large polygons underneath. Returns null when nothing decodable is
 * within reach.
 */
export function pickFeature(
  map: maplibregl.Map,
  point: maplibregl.Point,
): FeatureHit | null {
  const poiLayers = existingLayers(map, POI_LAYERS);
  const placeLayers = existingLayers(map, PLACE_LAYERS);
  const buildingLayers = existingLayers(map, BUILDING_LAYERS);

  if (poiLayers.length) {
    const hit = firstDecodable(
      map.queryRenderedFeatures(point, { layers: poiLayers }),
    );
    if (hit) return hit;
  }

  if (placeLayers.length) {
    const hit = firstDecodable(
      map.queryRenderedFeatures(point, { layers: placeLayers }),
    );
    if (hit) return hit;
  }

  if (poiLayers.length) {
    const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
      [point.x - POI_TOLERANCE, point.y - POI_TOLERANCE],
      [point.x + POI_TOLERANCE, point.y + POI_TOLERANCE],
    ];
    const nearby = map.queryRenderedFeatures(bbox, { layers: poiLayers });
    if (nearby.length) {
      const nearest = findNearest(nearby, map, point);
      if (nearest) return nearest;
    }
  }

  if (buildingLayers.length) {
    const hit = firstDecodable(
      map.queryRenderedFeatures(point, { layers: buildingLayers }),
    );
    if (hit) return hit;
  }

  return null;
}
