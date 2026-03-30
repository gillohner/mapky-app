import { useEffect, useRef, useCallback, useState } from "react";
import { useMapStore } from "@/stores/map-store";
import { useViewportPlaces } from "@/lib/api/hooks";
import { encodeFeatureId, sourceLayersForType } from "@/lib/map/feature-id";
import type { ViewportBounds } from "@/types/mapky";

interface IndexedEntry {
  featureId: number;
  sourceLayers: string[];
}

/**
 * Marks Mapky-indexed places on the actual tile features via feature-state.
 * No separate GeoJSON layer — the tile POIs/buildings themselves get highlighted.
 */
export function MapkyPlacesLayer() {
  const map = useMapStore((s) => s.map);

  const [bounds, setBounds] = useState<ViewportBounds | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const prevIndexed = useRef<IndexedEntry[]>([]);

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

  // Set feature-state "indexed" on matching tile features
  useEffect(() => {
    if (!map) return;

    // Clear previous indexed states
    for (const entry of prevIndexed.current) {
      for (const sl of entry.sourceLayers) {
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
      return;
    }

    const entries: IndexedEntry[] = [];

    for (const p of places) {
      const fid = encodeFeatureId(p.osm_type, p.osm_id);
      if (!fid) continue;

      const sls = sourceLayersForType(p.osm_type);
      for (const sl of sls) {
        try {
          map.setFeatureState(
            { source: "protomaps", sourceLayer: sl, id: fid },
            { indexed: true },
          );
        } catch {
          /* source layer may not exist */
        }
      }
      entries.push({ featureId: fid, sourceLayers: sls });
    }

    prevIndexed.current = entries;
  }, [map, places]);

  return null;
}
