import { useEffect, useRef, useCallback } from "react";
import type maplibregl from "maplibre-gl";
import { useMapStore } from "@/stores/map-store";
import { useUiStore } from "@/stores/ui-store";
import type { EnrichedResult } from "@/lib/places/enrich-search";

interface SearchResultsOverlayProps {
  results: EnrichedResult[];
  searchQuery: string;
  searchMode: string;
}

const SOURCE_ID = "search-results";
const CLUSTER_ID = SOURCE_ID + "-clusters";
const CLUSTER_COUNT_ID = SOURCE_ID + "-cluster-count";
const RING_ID = SOURCE_ID + "-ring";
const DOT_ID = SOURCE_ID + "-dot";
const RATED_HALO_ID = SOURCE_ID + "-rated-halo";
const RATED_LABEL_ID = SOURCE_ID + "-rated-label";
const COLOR = "#f59e0b"; // amber — distinct from green (places) and blue/purple (collections)

function resultsToGeoJSON(
  results: EnrichedResult[],
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: results.map(({ result, place }) => {
      const rating =
        place && place.review_count > 0
          ? (place.avg_rating / 2).toFixed(1)
          : null;
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [result.lon, result.lat] },
        properties: {
          osm_type: result.osm_type,
          osm_id: result.osm_id,
          name: result.name,
          ...(rating != null ? { rating } : {}),
        },
      };
    }),
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

  // Unrated points: small amber dot with a soft ring around it.
  if (!map.getLayer(RING_ID)) {
    map.addLayer(
      {
        id: RING_ID,
        type: "circle",
        source: SOURCE_ID,
        filter: [
          "all",
          ["!", ["has", "point_count"]],
          ["!", ["has", "rating"]],
        ],
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
        filter: [
          "all",
          ["!", ["has", "point_count"]],
          ["!", ["has", "rating"]],
        ],
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

  // Rated points: bigger filled badge with a white ring so the rating
  // text on top stays legible even on satellite imagery.
  if (!map.getLayer(RATED_HALO_ID)) {
    map.addLayer(
      {
        id: RATED_HALO_ID,
        type: "circle",
        source: SOURCE_ID,
        filter: [
          "all",
          ["!", ["has", "point_count"]],
          ["has", "rating"],
        ],
        paint: {
          "circle-radius": 12,
          "circle-color": COLOR,
          "circle-opacity": 0.95,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      },
      beforePois,
    );
  }

  if (!map.getLayer(RATED_LABEL_ID)) {
    map.addLayer({
      id: RATED_LABEL_ID,
      type: "symbol",
      source: SOURCE_ID,
      filter: [
        "all",
        ["!", ["has", "point_count"]],
        ["has", "rating"],
      ],
      layout: {
        "text-field": ["get", "rating"],
        "text-size": 10,
        "text-font": ["Noto Sans Medium"],
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": COLOR,
        "text-halo-width": 1,
      },
    });
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
        layers: [RING_ID, DOT_ID, RATED_HALO_ID, RATED_LABEL_ID].filter((id) =>
          map.getLayer(id),
        ),
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

    const pointLayers = [RING_ID, DOT_ID, RATED_HALO_ID, RATED_LABEL_ID];
    if (map.getLayer(CLUSTER_ID)) map.on("click", CLUSTER_ID, onClusterClick);
    for (const id of pointLayers) {
      if (map.getLayer(id)) map.on("click", id, onPointClick);
    }
    return () => {
      if (map.getLayer(CLUSTER_ID)) map.off("click", CLUSTER_ID, onClusterClick);
      for (const id of pointLayers) {
        if (map.getLayer(id)) map.off("click", id, onPointClick);
      }
    };
  }, [map, searchQuery, searchMode]);

  // Cleanup on unmount
  const cleanup = useCallback(() => {
    if (!map) return;
    for (const id of [
      RATED_LABEL_ID,
      RATED_HALO_ID,
      DOT_ID,
      RING_ID,
      CLUSTER_COUNT_ID,
      CLUSTER_ID,
    ]) {
      if (map.getLayer(id)) map.removeLayer(id);
    }
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
  }, [map]);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return null;
}
