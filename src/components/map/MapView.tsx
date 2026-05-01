import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { Maximize2 } from "lucide-react";
import { createMapStyle } from "@/lib/map/style";
import { pickFeature } from "@/lib/map/pick-feature";
import { useMapStore } from "@/stores/map-store";
import { useUiStore } from "@/stores/ui-store";
import { useRouteCreationStore } from "@/stores/route-creation-store";

// Layer IDs we still need locally for hover/click logic.
const POI_LAYERS = ["pois"];
const PLACE_LAYERS = [
  "places_subplace",
  "places_locality",
  "places_region",
  "places_country",
];

function existingLayers(map: maplibregl.Map, ids: string[]): string[] {
  return ids.filter((id) => map.getLayer(id));
}

/**
 * Remove the kind restriction from the pois layer so all POI types in the
 * tiles are rendered. The min_zoom property on each feature already controls
 * density — prominent POIs appear at lower zooms, minor ones only at high zoom.
 */
function expandPoiFilter(map: maplibregl.Map, theme: "light" | "dark") {
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
  // Fix text colors — Protomaps sets the fallback color identical to the halo,
  // making unlisted kinds invisible. Override with readable fallback + halo.
  const nature = ["beach", "forest", "marina", "park", "peak", "zoo", "garden", "bench"];
  const transit = ["aerodrome", "station", "bus_stop", "ferry_terminal"];
  const civic = ["stadium", "university", "library", "school", "animal", "toilets", "drinking_water", "post_office", "building", "townhall"];
  const shopping = ["supermarket", "convenience", "books", "beauty", "electronics", "clothes"];
  const food = ["restaurant", "fast_food", "cafe", "bar"];
  const culture = ["attraction", "museum", "theatre", "artwork"];

  const isDark = theme === "dark";
  map.setPaintProperty("pois", "text-color", [
    "case",
    ["in", ["get", "kind"], ["literal", nature]],
    isDark ? "#30C573" : "#20834D",
    ["in", ["get", "kind"], ["literal", transit]],
    isDark ? "#2B5CEA" : "#315BCF",
    ["in", ["get", "kind"], ["literal", civic]],
    isDark ? "#93939F" : "#6A5B8F",
    ["in", ["get", "kind"], ["literal", shopping]],
    isDark ? "#4299BB" : "#1A8CBD",
    ["in", ["get", "kind"], ["literal", food]],
    isDark ? "#F19B6E" : "#CB6704",
    ["in", ["get", "kind"], ["literal", culture]],
    "#EF56BA",
    // Readable fallback for all other kinds
    isDark ? "#b0b0b0" : "#555555",
  ]);
  map.setPaintProperty(
    "pois",
    "text-halo-color",
    isDark ? "#1f1f1f" : "#e2dfda",
  );
  map.setPaintProperty("pois", "text-halo-width", 1.5);
}

/**
 * Removed: feature-state-based highlight layers on the "protomaps" vector source.
 * MapLibre 5.x has a bug in coalesceChanges where it crashes accessing
 * this.state[sourceLayer][featureId].selected for features with no state set,
 * spamming errors on every render frame.
 *
 * Indexed places are highlighted via the GeoJSON dots layer (MapkyPlacesLayer).
 * Selected places are highlighted via the GeoJSON marker (SelectedPlaceMarker).
 */

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const initializedRef = useRef(false);
  const hoverPopupRef = useRef<maplibregl.Popup | null>(null);
  const { center, zoom, theme, basemap, satelliteLabels, setMap, setView } =
    useMapStore();
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const streetViewActive = useUiStore((s) => s.streetViewActive);
  const streetViewExpanded = useUiStore((s) => s.streetViewExpanded);
  const streetViewCenter = useUiStore((s) => s.streetViewCenter);
  const toggleStreetViewExpanded = useUiStore((s) => s.toggleStreetViewExpanded);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: createMapStyle(theme, basemap, { satelliteLabels }),
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
      expandPoiFilter(map, theme);
    });

    map.on("moveend", () => {
      const c = map.getCenter();
      setView([c.lng, c.lat], map.getZoom());
    });

    // Click: layered queries — POI (exact) → place → POI (nearby) → building
    map.on("click", (e) => {
      // Route-creation owns map clicks while open; skip POI navigation.
      if (useRouteCreationStore.getState().isOpen) return;

      // If the click landed on a GeoCapture marker, let CaptureMarkersLayer handle it.
      const captureLayers = existingLayers(map, [
        "mapky-capture-point-dot",
        "mapky-capture-point-arrow",
      ]);
      if (captureLayers.length) {
        const captureHits = map.queryRenderedFeatures(e.point, {
          layers: captureLayers,
        });
        if (captureHits.length > 0) return;
      }

      const hit = pickFeature(map, e.point);
      if (hit) {
        useUiStore.getState().setPendingPoiClick({
          lng: hit.lng ?? e.lngLat.lng,
          lat: hit.lat ?? e.lngLat.lat,
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
      // When the cursor is over an HTML marker (Mapky balloon, capture
      // marker, selected pin, etc.), that overlay owns the tooltip.
      // MapLibre still fires `mousemove` on the map container for
      // events that originate on overlay DOM elements, so without this
      // bail we'd stack the basemap-label tooltip on top of whichever
      // POI tooltip the marker just opened.
      const tgt = e.originalEvent.target as Element | null;
      if (tgt?.closest?.(".maplibregl-marker")) {
        map.getCanvas().style.cursor = "";
        hoverPopup.remove();
        return;
      }

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

  // Re-add highlight layers after style changes (theme/basemap/labels
  // switch removes all layers, custom layers re-attach via styledata
  // listeners).
  useEffect(() => {
    if (!mapRef.current || !initializedRef.current) return;
    mapRef.current.setStyle(
      createMapStyle(theme, basemap, { satelliteLabels }),
    );
    mapRef.current.once("idle", () => {
      if (mapRef.current) {
        expandPoiFilter(mapRef.current, theme);
      }
    });
  }, [theme, basemap, satelliteLabels]);

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

  // Resize map when switching between fullscreen and mini-map
  const isMiniMap = streetViewActive && streetViewExpanded;
  useEffect(() => {
    if (!mapRef.current || !initializedRef.current) return;
    setTimeout(() => mapRef.current?.resize(), 50);
  }, [isMiniMap]);

  // Sync map to current street-view capture location (both mini and full modes)
  useEffect(() => {
    if (!mapRef.current || !initializedRef.current) return;
    if (!streetViewActive || !streetViewCenter) return;
    mapRef.current.easeTo({
      center: streetViewCenter as [number, number],
      zoom: isMiniMap ? 16 : 17,
      duration: 400,
    });
  }, [streetViewActive, streetViewCenter, isMiniMap]);

  return (
    <div
      ref={wrapperRef}
      className={
        isMiniMap
          ? "pointer-events-auto absolute bottom-20 right-4 z-[10] h-[140px] w-[200px] overflow-hidden rounded-2xl shadow-2xl ring-2 ring-white/20 md:h-[200px] md:w-[280px]"
          : "absolute inset-0"
      }
    >
      <div
        ref={containerRef}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />
      {streetViewActive && (
        <button
          type="button"
          onClick={toggleStreetViewExpanded}
          className="absolute right-2 top-2 z-10 rounded-lg bg-black/50 p-1.5 text-white/80 backdrop-blur transition-colors hover:bg-black/70 hover:text-white"
          aria-label={isMiniMap ? "Expand map" : "Expand street view"}
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
