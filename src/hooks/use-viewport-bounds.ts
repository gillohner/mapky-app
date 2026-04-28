import { useCallback, useEffect, useRef, useState } from "react";
import type maplibregl from "maplibre-gl";
import { useMapStore } from "@/stores/map-store";
import type { ViewportBounds } from "@/types/mapky";

/**
 * Track the current map viewport bbox and re-fire on debounced moveend.
 * Mirrors the pattern used by MapkyPlacesLayer / CaptureMarkersLayer /
 * RouteList — extracted so every discover sidebar gets the same behavior
 * without duplicating the effect.
 */
export function useViewportBounds(enabled = true) {
  const map = useMapStore((s) => s.map);
  const [bbox, setBbox] = useState<ViewportBounds | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const updateBounds = useCallback(() => {
    if (!map) return;
    setBbox(boundsOf(map));
  }, [map]);

  useEffect(() => {
    if (!enabled || !map) return;
    const onMoveEnd = () => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(updateBounds, 400);
    };
    if (map.loaded()) updateBounds();
    else map.once("load", updateBounds);
    map.on("moveend", onMoveEnd);
    return () => {
      map.off("moveend", onMoveEnd);
      clearTimeout(debounceRef.current);
    };
  }, [enabled, map, updateBounds]);

  return bbox;
}

function boundsOf(map: maplibregl.Map): ViewportBounds {
  const b = map.getBounds();
  return {
    minLat: b.getSouth(),
    minLon: b.getWest(),
    maxLat: b.getNorth(),
    maxLon: b.getEast(),
  };
}
