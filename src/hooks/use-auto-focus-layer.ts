import { useEffect } from "react";
import { useUiStore, type DimmableLayer } from "@/stores/ui-store";

const ALL_LAYERS: DimmableLayer[] = ["places", "captures"];

/**
 * When a feature detail page mounts (place, capture, route), force its
 * own layer ON — so other items nearby are visible for context — and
 * dim the secondary layers to ~40% so they don't compete visually.
 *
 * "routes" is accepted as a focus value even though there's no routes
 * map overlay anymore: the route detail page renders its own polyline
 * and we still want places + captures dimmed for visual focus.
 *
 * On unmount, restore the user's prior visibility choices and clear
 * the dim state.
 */
export function useAutoFocusLayer(focus: DimmableLayer | "routes"): void {
  useEffect(() => {
    const store = useUiStore.getState();

    const prior = {
      places: store.placesLayerVisible,
      captures: store.capturesLayerVisible,
    };

    if (focus === "places" && !prior.places) store.setPlacesLayerVisible(true);
    if (focus === "captures" && !prior.captures)
      store.setCapturesLayerVisible(true);

    for (const l of ALL_LAYERS) {
      if (l !== focus) store.setDimmed(l, true);
    }

    return () => {
      const s = useUiStore.getState();
      if (s.placesLayerVisible !== prior.places)
        s.setPlacesLayerVisible(prior.places);
      if (s.capturesLayerVisible !== prior.captures)
        s.setCapturesLayerVisible(prior.captures);
      s.clearDimmed();
    };
  }, [focus]);
}
