import { useEffect, useRef } from "react";
import { useMapStore } from "@/stores/map-store";
import { useUiStore, type SelectedFeature } from "@/stores/ui-store";

/**
 * Highlights the selected place on the actual tile feature via feature-state.
 * No separate marker — the tile POI/building itself gets the highlight.
 */
export function SelectedPlaceMarker() {
  const map = useMapStore((s) => s.map);
  const selected = useUiStore((s) => s.selectedFeature);
  const prevRef = useRef<SelectedFeature | null>(null);

  useEffect(() => {
    if (!map) return;

    // Clear previous selection
    const prev = prevRef.current;
    if (prev) {
      for (const sl of prev.sourceLayers) {
        try {
          map.removeFeatureState(
            { source: "protomaps", sourceLayer: sl, id: prev.featureId },
            "selected",
          );
        } catch {
          /* layer may not exist after style change */
        }
      }
      prevRef.current = null;
    }

    // Apply new selection
    if (selected) {
      for (const sl of selected.sourceLayers) {
        try {
          map.setFeatureState(
            { source: "protomaps", sourceLayer: sl, id: selected.featureId },
            { selected: true },
          );
        } catch {
          /* source layer may not exist */
        }
      }
      prevRef.current = selected;
    }
  }, [map, selected]);

  return null;
}
