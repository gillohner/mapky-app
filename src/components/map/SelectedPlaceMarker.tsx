import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import maplibregl from "maplibre-gl";
import { useMapStore } from "@/stores/map-store";
import { useUiStore } from "@/stores/ui-store";
import { usePlaceDetail, useOsmLookup } from "@/lib/api/hooks";
import { categoryIcon } from "@/lib/places/category-icon";

const SEL_SOURCE = "mapky-selected-place";
const SEL_LAYER_FILL = "mapky-selected-fill";
const SEL_LAYER_LINE = "mapky-selected-line";

const HIGHLIGHT_COLOR = "#dc2626"; // red-600 — used for the balloon pin only
// Area fill (polygons, building footprints, line geometries) uses a
// brighter amber instead of red. Red at 22% opacity disappeared into
// dark roads / red-roofed buildings / busy backgrounds; amber pops
// against gray streets, green parks, dark satellite imagery alike.
const AREA_HIGHLIGHT_COLOR = "#f59e0b"; // amber-500

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

  // Filled polygon (buildings, areas). Higher opacity than before so
  // the highlight reads even on busy basemaps; amber pops against the
  // gray/green palette Protomaps uses.
  //
  // `fill-antialias: false` is load-bearing: `querySourceFeatures`
  // returns one tile-clipped slice per tile, so a forest spanning N
  // tiles becomes N separate polygons whose artificial edges along
  // tile boundaries get antialiased. Adjacent slices share those
  // edges — the overlapping antialiased strokes double up and show
  // as darker bars crossing the polygon at every tile seam. With
  // antialiasing off the fill is solid edge-to-edge and the seams
  // disappear; the real polygon outline is still drawn smoothly by
  // the basemap's own landcover/landuse layers below.
  if (!map.getLayer(SEL_LAYER_FILL)) {
    map.addLayer({
      id: SEL_LAYER_FILL,
      type: "fill",
      source: SEL_SOURCE,
      paint: {
        "fill-color": AREA_HIGHLIGHT_COLOR,
        "fill-opacity": 0.3,
        "fill-antialias": false,
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
        "line-color": AREA_HIGHLIGHT_COLOR,
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
  // The teardrop SVG no longer carries a white inner dot — the
  // category icon (rendered via React portal into `__cat` below) sits
  // there instead, mirroring the hover balloon. A small dot stays as
  // the fallback when Nominatim hasn't resolved the category yet.
  el.innerHTML = `
    <span class="mapky-place-pin__rating" aria-hidden="true">
      <span class="mapky-place-pin__rating-star">★</span>
      <span class="mapky-place-pin__rating-value"></span>
    </span>
    <svg class="mapky-place-pin__icon" width="40" height="56" viewBox="0 0 28 40" aria-hidden="true">
      <path d="M14 2 C7 2 2 7 2 14 C2 22 14 38 14 38 C14 38 26 22 26 14 C26 7 21 2 14 2 Z"
            fill="${HIGHLIGHT_COLOR}" stroke="white" stroke-width="2"/>
    </svg>
    <span class="mapky-place-pin__cat" aria-hidden="true"></span>
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
  // Slot the category icon portals into. Held in state (not a ref) so
  // React re-renders once the host element exists, otherwise the icon
  // never gets mounted on the very first selection.
  const [iconSlot, setIconSlot] = useState<HTMLSpanElement | null>(null);

  // Pull the indexer's rating so the selected pin can mirror the
  // hover-balloon chip ("★ 4.6"). usePlaceDetail's queryKey matches
  // PlaceList / PlacePanel, so this is a free cache hit when the user
  // selected from a list — only the first selection from a search
  // result actually fetches.
  const { data: place } = usePlaceDetail(
    selected?.osmType ?? "",
    selected?.osmId ?? 0,
  );
  const ratingLabel =
    place && place.review_count > 0
      ? (place.avg_rating / 2).toFixed(1)
      : null;

  // Resolve the category icon the same way PlaceBalloon does. Cached
  // by `["nominatim", "lookup", type, id]`, so a balloon-resolved
  // place opens with the icon already in hand.
  const { data: nominatim } = useOsmLookup(
    selected?.osmType ?? "",
    selected?.osmId ?? 0,
    !!selected,
  );
  const Icon = (() => {
    const t = nominatim?.type;
    if (!t || t === "yes" || t === "unclassified") return null;
    return categoryIcon(t);
  })();

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
    setIconSlot(
      el.querySelector(".mapky-place-pin__cat") as HTMLSpanElement | null,
    );
    markerRef.current = new maplibregl.Marker({
      element: el,
      anchor: "bottom",
    });
    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      pinElRef.current = null;
      setIconSlot(null);
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
        // No area to highlight — drop a balloon pin at the place coords.
        // The basemap label already names the place; the sidebar header
        // names it too. A persistent floating label next to the pin
        // duplicates that information and follows the user even when
        // they're not hovering, so it's deliberately omitted.
        src.setData({ type: "FeatureCollection", features: [] });
        if (marker && pinEl) {
          // Mirror the hover-balloon's star chip on the selected pin
          // so a place's rating stays visible after the user clicks
          // through. Hidden when the place isn't Mapky-rated.
          const ratingEl = pinEl.querySelector(
            ".mapky-place-pin__rating",
          ) as HTMLSpanElement | null;
          const ratingValueEl = pinEl.querySelector(
            ".mapky-place-pin__rating-value",
          ) as HTMLSpanElement | null;
          if (ratingEl && ratingValueEl) {
            if (ratingLabel) {
              ratingValueEl.textContent = ratingLabel;
              ratingEl.style.display = "";
            } else {
              ratingValueEl.textContent = "";
              ratingEl.style.display = "none";
            }
          }

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
  }, [map, selected, ratingLabel]);

  // Portal the category icon into the pin's `.__cat` slot. When the
  // marker isn't on the map (selected has an area highlight, or no
  // selection at all) the slot stays empty — icon disappears with it.
  return Icon && iconSlot
    ? createPortal(
        <Icon size={14} strokeWidth={2.5} aria-hidden />,
        iconSlot,
      )
    : null;
}
