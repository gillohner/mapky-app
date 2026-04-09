import { useEffect, useRef, useCallback } from "react";
import type maplibregl from "maplibre-gl";
import { useMapStore } from "@/stores/map-store";
import { useUiStore } from "@/stores/ui-store";
import type { NominatimSearchResult } from "@/lib/api/nominatim";

interface SearchResultsOverlayProps {
  results: NominatimSearchResult[];
  searchQuery: string;
  searchMode: string;
}

const SOURCE_ID = "search-results";
const CLUSTER_ID = SOURCE_ID + "-clusters";
const CLUSTER_COUNT_ID = SOURCE_ID + "-cluster-count";
const RING_ID = SOURCE_ID + "-ring";
const DOT_ID = SOURCE_ID + "-dot";
const COLOR = "#f59e0b"; // amber — distinct from green (places) and blue/purple (collections)

function resultsToGeoJSON(
  results: NominatimSearchResult[],
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: results.map((r) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [r.lon, r.lat] },
      properties: {
        osm_type: r.osm_type,
        osm_id: r.osm_id,
        name: r.name,
      },
    })),
  };
}

function ensureLayers(map: maplibregl.Map) {
  if (!map.getSource(SOURCE_ID)) {
    map.addSource(SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      cluster: true,
      clusterRadius: 50,
      clusterMaxZoom: 14,
    });
  }

  const beforePois = map.getLayer("pois") ? "pois" : undefined;

  if (!map.getLayer(CLUSTER_ID)) {
    map.addLayer({
      id: CLUSTER_ID,
      type: "circle",
      source: SOURCE_ID,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": COLOR,
        "circle-opacity": 0.25,
        "circle-radius": [
          "step", ["get", "point_count"],
          16, 5, 22, 20, 30, 50, 38,
        ],
        "circle-stroke-width": 2,
        "circle-stroke-color": COLOR,
        "circle-stroke-opacity": 0.5,
      },
    });
  }

  if (!map.getLayer(CLUSTER_COUNT_ID)) {
    map.addLayer({
      id: CLUSTER_COUNT_ID,
      type: "symbol",
      source: SOURCE_ID,
      filter: ["has", "point_count"],
      layout: {
        "text-field": "{point_count_abbreviated}",
        "text-size": 12,
        "text-font": ["Noto Sans Medium"],
        "text-allow-overlap": true,
      },
      paint: {
        "text-color": "#fff",
        "text-halo-color": COLOR,
        "text-halo-width": 1,
      },
    });
  }

  if (!map.getLayer(RING_ID)) {
    map.addLayer(
      {
        id: RING_ID,
        type: "circle",
        source: SOURCE_ID,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            10, 6, 14, 10, 18, 14,
          ],
          "circle-color": COLOR,
          "circle-opacity": 0.2,
          "circle-stroke-width": 2,
          "circle-stroke-color": COLOR,
          "circle-stroke-opacity": 0.6,
        },
      },
      beforePois,
    );
  }

  if (!map.getLayer(DOT_ID)) {
    map.addLayer(
      {
        id: DOT_ID,
        type: "circle",
        source: SOURCE_ID,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            8, 4, 14, 5, 18, 7,
          ],
          "circle-color": COLOR,
          "circle-opacity": 0.8,
        },
      },
      beforePois,
    );
  }
}

export function SearchResultsOverlay({
  results,
  searchQuery,
  searchMode,
}: SearchResultsOverlayProps) {
  const map = useMapStore((s) => s.map);
  const layerReady = useRef(false);

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
        ensureLayers(map);
        layerReady.current = true;
      }
    };

    if (map.isStyleLoaded()) {
      setup();
    } else {
      map.once("idle", setup);
    }

    const src = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (src) {
      src.setData(
        results.length
          ? resultsToGeoJSON(results)
          : { type: "FeatureCollection", features: [] },
      );
    }
  }, [map, results]);

  // Click handlers
  useEffect(() => {
    if (!map) return;

    const onClusterClick = (e: maplibregl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: [CLUSTER_ID],
      });
      if (!features.length) return;

      const clusterIdVal = features[0].properties?.cluster_id;
      if (clusterIdVal == null) return;

      const src = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource;
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

    const onPointClick = (e: maplibregl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: [RING_ID, DOT_ID].filter((id) => map.getLayer(id)),
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
        lat,
        name: props?.name ?? "",
        kind: "",
        osmType,
        osmId: Number(osmId),
        fromSearch: { query: searchQuery, mode: searchMode },
      });
    };

    if (map.getLayer(CLUSTER_ID)) map.on("click", CLUSTER_ID, onClusterClick);
    if (map.getLayer(RING_ID)) map.on("click", RING_ID, onPointClick);
    if (map.getLayer(DOT_ID)) map.on("click", DOT_ID, onPointClick);
    return () => {
      if (map.getLayer(CLUSTER_ID)) map.off("click", CLUSTER_ID, onClusterClick);
      if (map.getLayer(RING_ID)) map.off("click", RING_ID, onPointClick);
      if (map.getLayer(DOT_ID)) map.off("click", DOT_ID, onPointClick);
    };
  }, [map, searchQuery, searchMode]);

  // Cleanup on unmount
  const cleanup = useCallback(() => {
    if (!map) return;
    if (map.getLayer(DOT_ID)) map.removeLayer(DOT_ID);
    if (map.getLayer(RING_ID)) map.removeLayer(RING_ID);
    if (map.getLayer(CLUSTER_COUNT_ID)) map.removeLayer(CLUSTER_COUNT_ID);
    if (map.getLayer(CLUSTER_ID)) map.removeLayer(CLUSTER_ID);
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
  }, [map]);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return null;
}
