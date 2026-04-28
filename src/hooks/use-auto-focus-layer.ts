import { useEffect } from "react";
import { useUiStore, type DimmableLayer } from "@/stores/ui-store";

const ALL_LAYERS: DimmableLayer[] = ["places", "captures", "routes"];

/**
 * When a feature detail page mounts (place, capture, route), force its
 * own layer ON — so other routes/places nearby are visible for context —
 * and dim the secondary layers to ~40% so they don't compete visually.
 *
 * On unmount, restore the user's prior visibility choices and clear the
 * dim state. The user's persisted toggles in the Layers sheet are the
 * source of truth between visits.
 */
export function useAutoFocusLayer(focus: DimmableLayer): void {
  useEffect(() => {
    const store = useUiStore.getState();

    const prior = {
      places: store.placesLayerVisible,
      captures: store.capturesLayerVisible,
      routes: store.routesLayerVisible,
    };

    // Force the focus layer on; dim the rest.
    if (focus === "places" && !prior.places) store.setPlacesLayerVisible(true);
    if (focus === "captures" && !prior.captures) store.setCapturesLayerVisible(true);
    if (focus === "routes" && !prior.routes) store.setRoutesLayerVisible(true);

    for (const l of ALL_LAYERS) {
      if (l !== focus) store.setDimmed(l, true);
    }

    return () => {
      const s = useUiStore.getState();
      // Restore each layer to its prior visibility.
      if (s.placesLayerVisible !== prior.places) s.setPlacesLayerVisible(prior.places);
      if (s.capturesLayerVisible !== prior.captures) s.setCapturesLayerVisible(prior.captures);
      if (s.routesLayerVisible !== prior.routes) s.setRoutesLayerVisible(prior.routes);
      s.clearDimmed();
    };
  }, [focus]);
}
