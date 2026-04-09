import { useEffect, useRef, useCallback, useState } from "react";
import type maplibregl from "maplibre-gl";
import { useMapStore } from "@/stores/map-store";
import { useUiStore } from "@/stores/ui-store";
import { useCollection } from "@/lib/api/hooks";
import { parseOsmCanonical } from "@/lib/map/osm-url";
import { fetchPlaceDetail } from "@/lib/api/mapky";
import { lookupOsmElement } from "@/lib/api/nominatim";

interface CollectionOverlayProps {
  authorId: string;
  collectionId: string;
  color: string;
}

interface ResolvedPlace {
  osmType: string;
  osmId: number;
  lat: number;
  lon: number;
}

const SOURCE_PREFIX = "collection-";
const CLUSTER_SUFFIX = "-clusters";
const CLUSTER_COUNT_SUFFIX = "-cluster-count";
const RING_SUFFIX = "-ring";
const DOT_SUFFIX = "-dot";

function placesToGeoJSON(
  places: ResolvedPlace[],
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: places.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      properties: { osm_type: p.osmType, osm_id: p.osmId },
    })),
  };
}

async function resolveCoordinates(
  items: string[],
): Promise<ResolvedPlace[]> {
  const results: ResolvedPlace[] = [];
  for (const url of items) {
    const parsed = parseOsmCanonical(url);
    if (!parsed) continue;
    try {
      // Try nexus first (fast, has lat/lon for indexed places)
      const detail = await fetchPlaceDetail(parsed.osmType, parsed.osmId);
      if (detail.lat && detail.lon) {
        results.push({
          osmType: parsed.osmType,
          osmId: parsed.osmId,
          lat: detail.lat,
          lon: detail.lon,
        });
        continue;
      }
    } catch {
      // Not indexed — fall back to Nominatim
    }
    try {
      const nom = await lookupOsmElement(parsed.osmType, parsed.osmId);
      if (nom.lat != null && nom.lon != null) {
        results.push({
          osmType: parsed.osmType,
          osmId: parsed.osmId,
          lat: nom.lat,
          lon: nom.lon,
        });
      }
    } catch {
      // Skip unresolvable items
    }
  }
  return results;
}

function ensureLayers(
  map: maplibregl.Map,
  sourceId: string,
  clusterId: string,
  clusterCountId: string,
  ringId: string,
  dotId: string,
  color: string,
) {
  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      cluster: true,
      clusterRadius: 50,
      clusterMaxZoom: 14,
    });
  }

  const beforePois = map.getLayer("pois") ? "pois" : undefined;

  // Cluster circles
  if (!map.getLayer(clusterId)) {
    map.addLayer({
      id: clusterId,
      type: "circle",
      source: sourceId,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": color,
        "circle-opacity": 0.25,
        "circle-radius": [
          "step", ["get", "point_count"],
          16, 5, 22, 20, 30, 50, 38,
        ],
        "circle-stroke-width": 2,
        "circle-stroke-color": color,
        "circle-stroke-opacity": 0.5,
      },
    });
  }

  // Cluster count labels
  if (!map.getLayer(clusterCountId)) {
    map.addLayer({
      id: clusterCountId,
      type: "symbol",
      source: sourceId,
      filter: ["has", "point_count"],
      layout: {
        "text-field": "{point_count_abbreviated}",
        "text-size": 12,
        "text-font": ["Noto Sans Medium"],
        "text-allow-overlap": true,
      },
      paint: {
        "text-color": "#fff",
        "text-halo-color": color,
        "text-halo-width": 1,
      },
    });
  }

  // Individual point ring
  if (!map.getLayer(ringId)) {
    map.addLayer(
      {
        id: ringId,
        type: "circle",
        source: sourceId,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            10, 6, 14, 10, 18, 14,
          ],
          "circle-color": color,
          "circle-opacity": 0.2,
          "circle-stroke-width": 2,
          "circle-stroke-color": color,
          "circle-stroke-opacity": 0.6,
        },
      },
      beforePois,
    );
  }

  // Individual point dot
  if (!map.getLayer(dotId)) {
    map.addLayer(
      {
        id: dotId,
        type: "circle",
        source: sourceId,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            8, 4, 14, 5, 18, 7,
          ],
          "circle-color": color,
          "circle-opacity": 0.8,
        },
      },
      beforePois,
    );
  }
}

export function CollectionOverlay({
  authorId,
  collectionId,
  color,
}: CollectionOverlayProps) {
  const map = useMapStore((s) => s.map);
  const { data: collection } = useCollection(authorId, collectionId);
  const [resolved, setResolved] = useState<ResolvedPlace[]>([]);
  const layerReady = useRef(false);

  const sourceId = SOURCE_PREFIX + collectionId;
  const clusterId = sourceId + CLUSTER_SUFFIX;
  const clusterCountId = sourceId + CLUSTER_COUNT_SUFFIX;
  const ringId = sourceId + RING_SUFFIX;
  const dotId = sourceId + DOT_SUFFIX;

  // Resolve coordinates when collection items change
  useEffect(() => {
    if (!collection?.items.length) {
      setResolved([]);
      return;
    }
    let cancelled = false;
    resolveCoordinates(collection.items).then((places) => {
      if (!cancelled) setResolved(places);
    });
    return () => { cancelled = true; };
  }, [collection?.items]);

  // Recreate layers after style changes
  useEffect(() => {
    if (!map) return;
    const onStyleData = () => { layerReady.current = false; };
    map.on("styledata", onStyleData);
    return () => { map.off("styledata", onStyleData); };
  }, [map]);

  // Sync GeoJSON source
  useEffect(() => {
    if (!map) return;

    const setup = () => {
      if (!layerReady.current) {
        ensureLayers(map, sourceId, clusterId, clusterCountId, ringId, dotId, color);
        layerReady.current = true;
      }
    };

    if (map.isStyleLoaded()) {
      setup();
    } else {
      map.once("idle", setup);
    }

    const src = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
    if (src) {
      src.setData(
        resolved.length
          ? placesToGeoJSON(resolved)
          : { type: "FeatureCollection", features: [] },
      );
    }
  }, [map, resolved, sourceId, clusterId, clusterCountId, ringId, dotId, color]);

  // Click on cluster → zoom in
  useEffect(() => {
    if (!map) return;

    const onClusterClick = (e: maplibregl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: [clusterId],
      });
      if (!features.length) return;

      const clusterIdVal = features[0].properties?.cluster_id;
      if (clusterIdVal == null) return;

      const src = map.getSource(sourceId) as maplibregl.GeoJSONSource;
      src.getClusterExpansionZoom(clusterIdVal).then((zoom) => {
        const geom = features[0].geometry;
        if (geom.type === "Point") {
          map.easeTo({
            center: geom.coordinates as [number, number],
            zoom,
          });
        }
      });
    };

    // Click on individual place dot → navigate
    const onPointClick = (e: maplibregl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: [ringId, dotId].filter((id) => map.getLayer(id)),
      });
      if (!features.length) return;

      const props = features[0].properties;
      const osmType = props?.osm_type;
      const osmId = props?.osm_id;
      if (!osmType || !osmId) return;

      const geom = features[0].geometry;
      const [lon, lat] =
        geom.type === "Point"
          ? (geom.coordinates as [number, number])
          : [e.lngLat.lng, e.lngLat.lat];

      e.originalEvent.stopPropagation();

      useUiStore.getState().setPendingPoiClick({
        lng: lon,
        lat: lat,
        name: "",
        kind: "",
        osmType,
        osmId: Number(osmId),
      });
    };

    if (map.getLayer(clusterId)) map.on("click", clusterId, onClusterClick);
    if (map.getLayer(ringId)) map.on("click", ringId, onPointClick);
    if (map.getLayer(dotId)) map.on("click", dotId, onPointClick);
    return () => {
      if (map.getLayer(clusterId)) map.off("click", clusterId, onClusterClick);
      if (map.getLayer(ringId)) map.off("click", ringId, onPointClick);
      if (map.getLayer(dotId)) map.off("click", dotId, onPointClick);
    };
  }, [map, sourceId, clusterId, ringId, dotId]);

  // Cleanup on unmount
  const cleanupLayers = useCallback(() => {
    if (!map) return;
    if (map.getLayer(dotId)) map.removeLayer(dotId);
    if (map.getLayer(ringId)) map.removeLayer(ringId);
    if (map.getLayer(clusterCountId)) map.removeLayer(clusterCountId);
    if (map.getLayer(clusterId)) map.removeLayer(clusterId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);
  }, [map, sourceId, clusterId, clusterCountId, ringId, dotId]);

  useEffect(() => {
    return cleanupLayers;
  }, [cleanupLayers]);

  return null;
}
