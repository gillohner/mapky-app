import { useEffect, useRef, useCallback, useState } from "react";
import type maplibregl from "maplibre-gl";
import { useMapStore } from "@/stores/map-store";
import { useUiStore } from "@/stores/ui-store";
import { useViewportPlaces } from "@/lib/api/hooks";

import type { PlaceDetails, ViewportBounds } from "@/types/mapky";

const SOURCE = "mapky-places";
const CLUSTER_LAYER = "mapky-clusters";
const CLUSTER_COUNT = "mapky-cluster-count";
const POINT_RING = "mapky-point-ring";
const POINT_DOT = "mapky-point-dot";

function placesToGeoJSON(places: PlaceDetails[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: places.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      properties: {
        osm_type: p.osm_type,
        osm_id: p.osm_id,
        review_count: p.review_count,
        tag_count: p.tag_count,
      },
    })),
  };
}

function getAccent(theme: "light" | "dark") {
  return theme === "dark" ? "#22c55e" : "#16a34a";
}

function ensureLayers(map: maplibregl.Map, theme: "light" | "dark") {
  const accent = getAccent(theme);

  if (!map.getSource(SOURCE)) {
    map.addSource(SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      cluster: true,
      clusterRadius: 50,
      clusterMaxZoom: 14,
    });
  }

  // --- Cluster circles (zoom < ~15) ---
  if (!map.getLayer(CLUSTER_LAYER)) {
    map.addLayer({
      id: CLUSTER_LAYER,
      type: "circle",
      source: SOURCE,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": accent,
        "circle-opacity": 0.25,
        "circle-radius": [
          "step",
          ["get", "point_count"],
          16, // < 5 points
          5, 22,
          20, 30,
          50, 38,
        ],
        "circle-stroke-width": 2,
        "circle-stroke-color": accent,
        "circle-stroke-opacity": 0.5,
      },
    });
  }

  // --- Cluster count label ---
  if (!map.getLayer(CLUSTER_COUNT)) {
    map.addLayer({
      id: CLUSTER_COUNT,
      type: "symbol",
      source: SOURCE,
      filter: ["has", "point_count"],
      layout: {
        "text-field": "{point_count_abbreviated}",
        "text-size": 12,
        "text-font": ["Noto Sans Medium"],
        "text-allow-overlap": true,
      },
      paint: {
        "text-color": theme === "dark" ? "#fff" : "#fff",
        "text-halo-color": accent,
        "text-halo-width": 1,
      },
    });
  }

  // --- Individual place: ring behind POI icon ---
  // Rendered BEFORE (below) the pois layer so the POI icon sits on top
  const beforePois = map.getLayer("pois") ? "pois" : undefined;

  if (!map.getLayer(POINT_RING)) {
    map.addLayer(
      {
        id: POINT_RING,
        type: "circle",
        source: SOURCE,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10, 5,
            14, 8,
            18, 12,
          ],
          "circle-color": accent,
          "circle-opacity": 0.15,
          "circle-stroke-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10, 1,
            18, 2,
          ],
          "circle-stroke-color": accent,
          "circle-stroke-opacity": 0.5,
        },
      },
      beforePois,
    );
  }

  // --- Small inner dot (always visible, even when tile POI not loaded) ---
  if (!map.getLayer(POINT_DOT)) {
    map.addLayer(
      {
        id: POINT_DOT,
        type: "circle",
        source: SOURCE,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8, 3,
            14, 4,
            18, 5,
          ],
          "circle-color": accent,
          "circle-opacity": 0.7,
        },
      },
      beforePois,
    );
  }
}

/**
 * Shows Mapky-indexed places on the map with:
 * - Clustered circles at low zoom (shows how many places are in an area)
 * - Individual rings + dots at high zoom (highlights the POI icon)
 */
export function MapkyPlacesLayer() {
  const map = useMapStore((s) => s.map);
  const theme = useMapStore((s) => s.theme);
  const visible = useUiStore((s) => s.placesLayerVisible);

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

  // Debounced viewport tracking
  useEffect(() => {
    if (!map) return;

    const onMoveEnd = () => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(updateBounds, 500);
    };

    if (map.loaded()) {
      updateBounds();
    } else {
      map.once("load", updateBounds);
    }

    map.on("moveend", onMoveEnd);
    return () => {
      map.off("moveend", onMoveEnd);
      clearTimeout(debounceRef.current);
    };
  }, [map, updateBounds]);

  // Recreate layers after style changes (theme toggle removes all layers)
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

  const { data: places } = useViewportPlaces(visible ? bounds : null);

  // Update GeoJSON source
  useEffect(() => {
    if (!map) return;

    const setup = () => {
      if (!layerReady.current) {
        ensureLayers(map, theme);
        layerReady.current = true;
      }
    };

    if (map.isStyleLoaded()) {
      setup();
    } else {
      map.once("idle", setup);
    }

    const src = map.getSource(SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (src) {
      src.setData(
        places?.length
          ? placesToGeoJSON(places)
          : { type: "FeatureCollection", features: [] },
      );
    }
  }, [map, places, theme]);

  // Toggle layer visibility
  useEffect(() => {
    if (!map) return;
    const vis = visible ? "visible" : "none";
    for (const id of [CLUSTER_LAYER, CLUSTER_COUNT, POINT_RING, POINT_DOT]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
    }
  }, [map, visible]);

  // Click on cluster → zoom in
  useEffect(() => {
    if (!map) return;

    const onClusterClick = (e: maplibregl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: [CLUSTER_LAYER],
      });
      if (!features.length) return;

      const clusterId = features[0].properties?.cluster_id;
      if (clusterId == null) return;

      const src = map.getSource(SOURCE) as maplibregl.GeoJSONSource;
      src.getClusterExpansionZoom(clusterId).then((zoom) => {
        const geom = features[0].geometry;
        if (geom.type === "Point") {
          map.easeTo({
            center: geom.coordinates as [number, number],
            zoom: zoom,
          });
        }
      });
    };

    // Click on individual place dot → navigate using the exact place data
    const onPointClick = (e: maplibregl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: [POINT_RING, POINT_DOT],
      });
      if (!features.length) return;

      const props = features[0].properties;
      const osmType = props?.osm_type;
      const osmId = props?.osm_id;
      if (!osmType || !osmId) return;

      // Use the GeoJSON feature coordinates (actual place location), not click coords
      const geom = features[0].geometry;
      const [lon, lat] =
        geom.type === "Point"
          ? (geom.coordinates as [number, number])
          : [e.lngLat.lng, e.lngLat.lat];

      // Stop the event from propagating to MapView's general click handler
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

    map.on("click", CLUSTER_LAYER, onClusterClick);
    map.on("click", POINT_RING, onPointClick);
    map.on("click", POINT_DOT, onPointClick);
    return () => {
      map.off("click", CLUSTER_LAYER, onClusterClick);
      map.off("click", POINT_RING, onPointClick);
      map.off("click", POINT_DOT, onPointClick);
    };
  }, [map]);

  return null;
}
