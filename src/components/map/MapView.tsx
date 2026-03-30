import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { createMapStyle } from "@/lib/map/style";
import { decodeFeatureId } from "@/lib/map/feature-id";
import { useMapStore } from "@/stores/map-store";
import { useUiStore } from "@/stores/ui-store";

// Style layer IDs from @protomaps/basemaps
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

interface FeatureHit {
  osmType: string;
  osmId: number;
  name: string;
  kind: string;
  sourceLayer: string;
}

/** Try to decode a Protomaps tile feature into an OSM reference. */
function tryDecode(f: maplibregl.MapGeoJSONFeature): FeatureHit | null {
  if (typeof f.id !== "number" || f.id <= 0) return null;
  const decoded = decodeFeatureId(f.id);
  if (!decoded) return null;
  return {
    ...decoded,
    name: f.properties?.name ? String(f.properties.name) : "",
    kind: f.properties?.kind ? String(f.properties.kind) : "",
    sourceLayer: f.sourceLayer ?? "",
  };
}

/** Among features, return the one whose point geometry is nearest to clickPx. */
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

/** Safely filter to layers that actually exist on the map. */
function existingLayers(map: maplibregl.Map, ids: string[]): string[] {
  return ids.filter((id) => map.getLayer(id));
}

/**
 * Layered feature picking — checks POIs, then places, then buildings.
 * Each step uses a filtered queryRenderedFeatures so higher-priority
 * layers can't be shadowed by large polygons underneath.
 */
/** Try to decode the first decodable feature from a list. */
function firstDecodable(
  features: maplibregl.MapGeoJSONFeature[],
): FeatureHit | null {
  for (const f of features) {
    const hit = tryDecode(f);
    if (hit) return hit;
  }
  return null;
}

function pickFeature(
  map: maplibregl.Map,
  point: maplibregl.Point,
): FeatureHit | null {
  const poiLayers = existingLayers(map, POI_LAYERS);
  const placeLayers = existingLayers(map, PLACE_LAYERS);
  const buildingLayers = existingLayers(map, BUILDING_LAYERS);

  // Step 1: exact POI symbol hit
  if (poiLayers.length) {
    const hit = firstDecodable(
      map.queryRenderedFeatures(point, { layers: poiLayers }),
    );
    if (hit) return hit;
  }

  // Step 2: exact place label (city/town/country)
  if (placeLayers.length) {
    const hit = firstDecodable(
      map.queryRenderedFeatures(point, { layers: placeLayers }),
    );
    if (hit) return hit;
  }

  // Step 3: nearby POI (tolerance bbox) — only fires when no symbol was
  // directly clicked, so it can't steal clicks from place labels.
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

  // Step 4: building polygon
  if (buildingLayers.length) {
    const hit = firstDecodable(
      map.queryRenderedFeatures(point, { layers: buildingLayers }),
    );
    if (hit) return hit;
  }

  // Step 5: nothing
  return null;
}

/**
 * Remove the kind restriction from the pois layer so all POI types in the
 * tiles are rendered. The min_zoom property on each feature already controls
 * density — prominent POIs appear at lower zooms, minor ones only at high zoom.
 */
function expandPoiFilter(map: maplibregl.Map) {
  if (!map.getLayer("pois")) return;
  // Show all POI kinds — min_zoom controls density
  map.setFilter("pois", [">=", ["zoom"], ["+", ["get", "min_zoom"], 0]]);
  // Use the kind as icon name, fall back to "building" for kinds without a sprite
  map.setLayoutProperty("pois", "icon-image", [
    "coalesce",
    [
      "image",
      [
        "match",
        ["get", "kind"],
        "station",
        "train_station",
        ["get", "kind"],
      ],
    ],
    ["image", "building"],
  ]);
}

/** Add highlight layers that respond to feature-state on the protomaps source. */
function addHighlightLayers(map: maplibregl.Map) {
  const poisBefore = map.getLayer("pois") ? "pois" : undefined;

  for (const srcLayer of ["pois", "places"]) {
    const selId = `mapky-sel-${srcLayer}`;
    const idxId = `mapky-idx-${srcLayer}`;

    if (!map.getLayer(selId)) {
      map.addLayer(
        {
          id: selId,
          type: "circle",
          source: "protomaps",
          "source-layer": srcLayer,
          paint: {
            "circle-radius": [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              18,
              0,
            ],
            "circle-color": "#22c55e",
            "circle-opacity": [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              0.25,
              0,
            ],
            "circle-stroke-width": [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              2,
              0,
            ],
            "circle-stroke-color": "#22c55e",
            "circle-stroke-opacity": [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              0.6,
              0,
            ],
          },
        },
        poisBefore,
      );
    }

    if (!map.getLayer(idxId)) {
      map.addLayer(
        {
          id: idxId,
          type: "circle",
          source: "protomaps",
          "source-layer": srcLayer,
          paint: {
            "circle-radius": [
              "case",
              ["boolean", ["feature-state", "indexed"], false],
              5,
              0,
            ],
            "circle-color": "#22c55e",
            "circle-opacity": [
              "case",
              ["boolean", ["feature-state", "indexed"], false],
              0.55,
              0,
            ],
            "circle-stroke-width": [
              "case",
              ["boolean", ["feature-state", "indexed"], false],
              1.5,
              0,
            ],
            "circle-stroke-color": "#22c55e",
            "circle-stroke-opacity": [
              "case",
              ["boolean", ["feature-state", "indexed"], false],
              0.4,
              0,
            ],
          },
        },
        poisBefore,
      );
    }
  }

  // Buildings get a fill highlight instead of circles
  if (!map.getLayer("mapky-sel-buildings")) {
    map.addLayer({
      id: "mapky-sel-buildings",
      type: "fill",
      source: "protomaps",
      "source-layer": "buildings",
      paint: {
        "fill-color": "#22c55e",
        "fill-opacity": [
          "case",
          ["boolean", ["feature-state", "selected"], false],
          0.35,
          ["boolean", ["feature-state", "indexed"], false],
          0.2,
          0,
        ],
      },
    });
  }
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const initializedRef = useRef(false);
  const hoverPopupRef = useRef<maplibregl.Popup | null>(null);
  const { center, zoom, theme, setMap, setView } = useMapStore();
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: createMapStyle(theme),
      center: center,
      zoom: zoom,
    });

    map.addControl(new maplibregl.NavigationControl(), "bottom-right");

    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      "bottom-right",
    );

    // Hover tooltip popup
    const hoverPopup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      className: "mapky-hover-tooltip",
      offset: [0, -10],
    });
    hoverPopupRef.current = hoverPopup;

    map.on("load", () => {
      initializedRef.current = true;
      expandPoiFilter(map);
      addHighlightLayers(map);
    });

    map.on("moveend", () => {
      const c = map.getCenter();
      setView([c.lng, c.lat], map.getZoom());
    });

    // Click: layered queries — POI (exact) → place → POI (nearby) → building
    map.on("click", (e) => {
      const hit = pickFeature(map, e.point);
      if (hit) {
        useUiStore.getState().setPendingPoiClick({
          lng: e.lngLat.lng,
          lat: e.lngLat.lat,
          name: hit.name,
          kind: hit.kind,
          osmType: hit.osmType,
          osmId: hit.osmId,
          sourceLayer: hit.sourceLayer,
        });
      }
    });

    // Hover: POI first, then places — exact point only (no tolerance on hover)
    map.on("mousemove", (e) => {
      const poiLayers = existingLayers(map, POI_LAYERS);
      const placeLayers = existingLayers(map, PLACE_LAYERS);

      const pois = poiLayers.length
        ? map.queryRenderedFeatures(e.point, { layers: poiLayers })
        : [];
      const named = pois.find((f) => f.properties?.name);

      const place =
        named ??
        (placeLayers.length
          ? map
              .queryRenderedFeatures(e.point, { layers: placeLayers })
              .find((f) => f.properties?.name)
          : undefined);

      if (place) {
        map.getCanvas().style.cursor = "pointer";
        hoverPopup
          .setLngLat(e.lngLat)
          .setHTML(`<span>${String(place.properties!.name)}</span>`)
          .addTo(map);
      } else {
        map.getCanvas().style.cursor = "";
        hoverPopup.remove();
      }
    });

    mapRef.current = map;
    setMap(map);

    return () => {
      hoverPopup.remove();
      hoverPopupRef.current = null;
      setMap(null);
      mapRef.current = null;
      initializedRef.current = false;
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-add highlight layers after style changes (theme switch removes all layers)
  useEffect(() => {
    if (!mapRef.current || !initializedRef.current) return;
    mapRef.current.setStyle(createMapStyle(theme));
    mapRef.current.once("idle", () => {
      if (mapRef.current) {
        expandPoiFilter(mapRef.current);
        addHighlightLayers(mapRef.current);
      }
    });
  }, [theme]);

  // Adjust map padding when sidebar opens/closes (desktop only)
  useEffect(() => {
    if (!mapRef.current || !initializedRef.current) return;
    const isDesktop = window.matchMedia("(min-width: 768px)").matches;
    if (!isDesktop) return;
    mapRef.current.easeTo({
      padding: {
        left: sidebarOpen ? 428 : 48,
        top: 0,
        right: 0,
        bottom: 0,
      },
      duration: 300,
    });
  }, [sidebarOpen]);

  return (
    <div
      ref={containerRef}
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
    />
  );
}
