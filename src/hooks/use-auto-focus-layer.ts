import { useEffect } from "react";
import { useUiStore, type DimmableLayer } from "@/stores/ui-store";

const ALL_LAYERS: DimmableLayer[] = ["places", "captures"];

/**
 * When a feature surface (detail page or list view) mounts, dim the
 * other Mapky data layers to ~40% so the focused content stands out.
 *
 * Focus values:
 * - "places" / "captures" — keep that one bright, dim the others.
 * - "routes" — dim places + captures (route detail / list draws its
 *   own polylines).
 * - "collections" — dim places + captures (collection overlays own
 *   the visual focus).
 *
 * Mapky data layers (places / captures) are always-on now, so this
 * hook only manages the dim flags — there's no visibility state to
 * push or restore.
 */
export function useAutoFocusLayer(
  focus: DimmableLayer | "routes" | "collections",
): void {
  useEffect(() => {
    const store = useUiStore.getState();
    for (const l of ALL_LAYERS) {
      // Focus values that don't correspond to a dimmable layer
      // ("routes", "collections") fall through and dim everything.
      if (l !== focus) store.setDimmed(l, true);
    }
    return () => {
      useUiStore.getState().clearDimmed();
    };
  }, [focus]);
}
