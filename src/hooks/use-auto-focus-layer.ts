import { useEffect } from "react";
import { useUiStore, type DimmableLayer } from "@/stores/ui-store";

const ALL_LAYERS: DimmableLayer[] = ["places", "captures"];

/**
 * When a feature detail page mounts (place, capture, route), dim the
 * secondary Mapky layers to ~40% so the focused content stands out.
 *
 * "routes" is accepted as a focus value even though there's no routes
 * map overlay: the route detail page renders its own polyline and we
 * still want places + captures dimmed for visual focus.
 *
 * Mapky data layers (places / captures) are always-on now, so this
 * hook only manages the dim flags — there's no visibility state to
 * push or restore.
 */
export function useAutoFocusLayer(focus: DimmableLayer | "routes"): void {
  useEffect(() => {
    const store = useUiStore.getState();
    for (const l of ALL_LAYERS) {
      if (l !== focus) store.setDimmed(l, true);
    }
    return () => {
      useUiStore.getState().clearDimmed();
    };
  }, [focus]);
}
