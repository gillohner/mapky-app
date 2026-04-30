import { useEffect } from "react";
import { useUiStore, type DimmableLayer } from "@/stores/ui-store";

const ALL_LAYERS: DimmableLayer[] = ["places", "captures"];

/**
 * When a feature surface (detail page or list view) mounts, fade the
 * other Mapky data layers so the focused content stands out.
 *
 * Focus values:
 * - "places" / "captures" — keep that one bright, fade the others.
 * - "routes" — fade places + captures (route detail / list draws its
 *   own polylines).
 * - "collections" — fade places + captures (collection overlays own
 *   the visual focus).
 *
 * Modes:
 * - default ("dim") — others render at 40% opacity (visible context).
 * - "hide"          — others render at 0% (full focus mode used by
 *                      search and active list-filters).
 *
 * Mapky data layers (places / captures) are always-on now, so this
 * hook only manages the dim/hide flags — there's no visibility state
 * to push or restore.
 */
export function useAutoFocusLayer(
  focus: DimmableLayer | "routes" | "collections",
  opts: { hide?: boolean } = {},
): void {
  const hide = !!opts.hide;
  useEffect(() => {
    const store = useUiStore.getState();
    for (const l of ALL_LAYERS) {
      if (l === focus) continue;
      if (hide) {
        store.setHidden(l, true);
        // Also keep the dim flag off so we don't end up with stale
        // dim state on transitions hide → no-hide.
        store.setDimmed(l, false);
      } else {
        store.setDimmed(l, true);
      }
    }
    return () => {
      const s = useUiStore.getState();
      s.clearDimmed();
      s.clearHidden();
    };
  }, [focus, hide]);
}
