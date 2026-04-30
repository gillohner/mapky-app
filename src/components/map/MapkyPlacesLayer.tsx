import { useEffect, useRef, useCallback, useState } from "react";
import type maplibregl from "maplibre-gl";
import { useMapStore } from "@/stores/map-store";
import { useUiStore } from "@/stores/ui-store";
import { useRouteCreationStore } from "@/stores/route-creation-store";
import { useViewportPlaces } from "@/lib/api/hooks";
import { useLayerOpacityMultiplier } from "@/lib/map/dim";

import type { PlaceDetails, ViewportBounds } from "@/types/mapky";

const SOURCE = "mapky-places";
const CLUSTER_LAYER = "mapky-clusters";
const CLUSTER_COUNT = "mapky-cluster-count";
const POINT_RING = "mapky-point-ring";
const POINT_DOT = "mapky-point-dot";
const RATED_HALO = "mapky-rated-halo";
const RATED_LABEL = "mapky-rated-label";

function placesToGeoJSON(places: PlaceDetails[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: places.map((p) => {
      // Only attach a rating when there's at least one review — the
      // RATED_LABEL symbol layer is filtered on `["has", "rating"]`,
      // so unreviewed places stay rendered as the plain green dot.
      const rating =
        p.review_count > 0 ? (p.avg_rating / 2).toFixed(1) : null;
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.lon, p.lat] },
        properties: {
          osm_type: p.osm_type,
          osm_id: p.osm_id,
          review_count: p.review_count,
          tag_count: p.tag_count,
          ...(rating != null ? { rating } : {}),
        },
      };
    }),
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

  // Unrated places: ring + small dot (existing behavior).
  if (!map.getLayer(POINT_RING)) {
    map.addLayer(
      {
        id: POINT_RING,
        type: "circle",
        source: SOURCE,
        filter: [
          "all",
          ["!", ["has", "point_count"]],
          ["!", ["has", "rating"]],
        ],
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
        filter: [
          "all",
          ["!", ["has", "point_count"]],
          ["!", ["has", "rating"]],
        ],
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

  // Reviewed places: filled green halo with the rating drawn on top.
  // Same visual language the search overlay uses for its rated dots,
  // so the user can read mapky reputation at a glance regardless of
  // which surface surfaced the place.
  if (!map.getLayer(RATED_HALO)) {
    map.addLayer(
      {
        id: RATED_HALO,
        type: "circle",
        source: SOURCE,
        filter: [
          "all",
          ["!", ["has", "point_count"]],
          ["has", "rating"],
        ],
        paint: {
          "circle-radius": 12,
          "circle-color": accent,
          "circle-opacity": 0.95,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      },
      beforePois,
    );
  }

  if (!map.getLayer(RATED_LABEL)) {
    map.addLayer({
      id: RATED_LABEL,
      type: "symbol",
      source: SOURCE,
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
        "text-halo-color": accent,
        "text-halo-width": 1,
      },
    });
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

  const { data: places } = useViewportPlaces(bounds);
  // When the discover sidebar is filtering, only render the matching
  // subset on the map. Null means "no filter — show everything".
  const visibleKeys = useUiStore((s) => s.visiblePlaceKeys);

  // Hold the latest GeoJSON in a ref so setup() (which can run via the
  // deferred "idle" listener AFTER places has already loaded) can
  // populate the source on first attach without waiting for another
  // React render. Same pattern as RoutePolylineLayer.
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

    // Recreate layers after style changes (theme/basemap swap wipes
    // them) and re-push the latest data inside the same listener so
    // the source isn't left empty waiting for the next React render.
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
    const filtered = places?.length
      ? visibleKeys
        ? places.filter((p) =>
            visibleKeys.has(`${p.osm_type}:${p.osm_id}`),
          )
        : places
      : [];
    dataRef.current = filtered.length
      ? placesToGeoJSON(filtered)
      : { type: "FeatureCollection", features: [] };
    if (!map) return;
    const src = map.getSource(SOURCE) as maplibregl.GeoJSONSource | undefined;
    src?.setData(dataRef.current);
  }, [map, places, visibleKeys]);

  // Apply dim multiplier when this layer is in the background of a focused
  // detail page. Multiplies the baked opacity values; reapplied on every
  // change to the multiplier and after style reloads (theme toggle).
  const dim = useLayerOpacityMultiplier("places");
  useEffect(() => {
    if (!map) return;
    const apply = () => {
      if (map.getLayer(CLUSTER_LAYER)) {
        map.setPaintProperty(CLUSTER_LAYER, "circle-opacity", 0.25 * dim);
        map.setPaintProperty(CLUSTER_LAYER, "circle-stroke-opacity", 0.5 * dim);
      }
      if (map.getLayer(CLUSTER_COUNT)) {
        map.setPaintProperty(CLUSTER_COUNT, "text-opacity", dim);
      }
      if (map.getLayer(POINT_RING)) {
        map.setPaintProperty(POINT_RING, "circle-opacity", 0.15 * dim);
        map.setPaintProperty(POINT_RING, "circle-stroke-opacity", 0.5 * dim);
      }
      if (map.getLayer(POINT_DOT)) {
        map.setPaintProperty(POINT_DOT, "circle-opacity", 0.7 * dim);
      }
      if (map.getLayer(RATED_HALO)) {
        map.setPaintProperty(RATED_HALO, "circle-opacity", 0.95 * dim);
        map.setPaintProperty(RATED_HALO, "circle-stroke-opacity", dim);
      }
      if (map.getLayer(RATED_LABEL)) {
        map.setPaintProperty(RATED_LABEL, "text-opacity", dim);
      }
    };
    apply();
    map.on("styledata", apply);
    return () => {
      map.off("styledata", apply);
    };
  }, [map, dim]);

  // Click on cluster → zoom in
  useEffect(() => {
    if (!map) return;

    const onClusterClick = (e: maplibregl.MapMouseEvent) => {
      if (useRouteCreationStore.getState().isOpen) return;
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
      // Skip place navigation while route creation owns map clicks.
      if (useRouteCreationStore.getState().isOpen) return;

      const features = map.queryRenderedFeatures(e.point, {
        layers: [POINT_RING, POINT_DOT, RATED_HALO, RATED_LABEL].filter(
          (id) => map.getLayer(id),
        ),
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

    const pointLayers = [POINT_RING, POINT_DOT, RATED_HALO, RATED_LABEL];
    map.on("click", CLUSTER_LAYER, onClusterClick);
    for (const id of pointLayers) map.on("click", id, onPointClick);
    return () => {
      map.off("click", CLUSTER_LAYER, onClusterClick);
      for (const id of pointLayers) map.off("click", id, onPointClick);
    };
  }, [map]);

  return null;
}
