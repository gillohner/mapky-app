import { useEffect, useRef, useCallback, useState } from "react";
import type maplibregl from "maplibre-gl";
import { useMapStore } from "@/stores/map-store";
import { useViewportPlaces } from "@/lib/api/hooks";
import { encodeFeatureId, HIGHLIGHT_SOURCE_LAYERS } from "@/lib/map/feature-id";
import type { PlaceDetails, ViewportBounds } from "@/types/mapky";

const DOT_SOURCE = "mapky-indexed-dots";
const DOT_LAYER = "mapky-indexed-dots-layer";

interface IndexedEntry {
  featureId: number;
}

function placesToGeoJSON(
  places: PlaceDetails[],
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: places.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      properties: {
        osm_type: p.osm_type,
        osm_id: p.osm_id,
      },
    })),
  };
}

function getAccentColor(theme: "light" | "dark") {
  return theme === "dark" ? "#22c55e" : "#16a34a";
}

/** Add the GeoJSON fallback dot layer if it doesn't exist. */
function ensureDotLayer(map: maplibregl.Map, theme: "light" | "dark") {
  if (!map.getSource(DOT_SOURCE)) {
    map.addSource(DOT_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }

  if (!map.getLayer(DOT_LAYER)) {
    const beforeId = map.getLayer("pois") ? "pois" : undefined;
    map.addLayer(
      {
        id: DOT_LAYER,
        type: "circle",
        source: DOT_SOURCE,
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8, 3,
            14, 5,
            18, 7,
          ],
          "circle-color": getAccentColor(theme),
          "circle-opacity": 0.6,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": getAccentColor(theme),
          "circle-stroke-opacity": 0.3,
        },
      },
      beforeId,
    );
  }
}

/**
 * Marks Mapky-indexed places with two complementary approaches:
 * 1. Feature-state "indexed" on tile features — highlights the actual POI/building
 *    when the tile has the feature loaded (high zoom).
 * 2. GeoJSON fallback dots — small accent circles from Nexus API coordinates,
 *    visible at all zoom levels. At high zoom both show; the dot sits behind the
 *    tile POI icon so the feature-state highlight is the primary indicator.
 */
export function MapkyPlacesLayer() {
  const map = useMapStore((s) => s.map);
  const theme = useMapStore((s) => s.theme);

  const [bounds, setBounds] = useState<ViewportBounds | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const prevIndexed = useRef<IndexedEntry[]>([]);
  const dotLayerAdded = useRef(false);

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

  // Re-add dot layer after style changes (theme switch removes all layers)
  useEffect(() => {
    if (!map) return;
    const onStyleData = () => {
      dotLayerAdded.current = false;
    };
    map.on("styledata", onStyleData);
    return () => {
      map.off("styledata", onStyleData);
    };
  }, [map]);

  const { data: places } = useViewportPlaces(bounds);

  // Update both feature-state and GeoJSON dots
  useEffect(() => {
    if (!map) return;

    // Ensure dot layer exists
    const addDots = () => {
      if (!dotLayerAdded.current) {
        ensureDotLayer(map, theme);
        dotLayerAdded.current = true;
      }
    };

    if (map.isStyleLoaded()) {
      addDots();
    } else {
      map.once("idle", addDots);
    }

    // Clear previous feature-state
    for (const entry of prevIndexed.current) {
      for (const sl of HIGHLIGHT_SOURCE_LAYERS) {
        try {
          map.removeFeatureState(
            { source: "protomaps", sourceLayer: sl, id: entry.featureId },
            "indexed",
          );
        } catch {
          /* layer may not exist */
        }
      }
    }

    if (!places?.length) {
      prevIndexed.current = [];
      // Clear dots
      const src = map.getSource(DOT_SOURCE) as maplibregl.GeoJSONSource | undefined;
      if (src) src.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    // Set feature-state on tile features
    const entries: IndexedEntry[] = [];
    for (const p of places) {
      const fid = encodeFeatureId(p.osm_type, p.osm_id);
      if (!fid) continue;

      for (const sl of HIGHLIGHT_SOURCE_LAYERS) {
        try {
          map.setFeatureState(
            { source: "protomaps", sourceLayer: sl, id: fid },
            { indexed: true },
          );
        } catch {
          /* source layer may not exist */
        }
      }
      entries.push({ featureId: fid });
    }
    prevIndexed.current = entries;

    // Update GeoJSON dots
    const src = map.getSource(DOT_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (src) {
      src.setData(placesToGeoJSON(places));
    }
  }, [map, places, theme]);

  return null;
}
