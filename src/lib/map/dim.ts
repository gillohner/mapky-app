import { useUiStore, type DimmableLayer } from "@/stores/ui-store";

/**
 * Opacity multiplier applied when an auto-focused detail page wants to
 * keep secondary layers visible-but-de-emphasized. Picked by feel — low
 * enough to obviously fade, high enough to remain useful for context.
 */
export const DIM_FACTOR = 0.4;

/**
 * Returns the current opacity multiplier for a Mapky data layer:
 *   - 0   when focus mode hides this layer, OR no sidebar is open
 *         and the user has it toggled off in the Layers sheet.
 *   - 0.4 when the layer is dimmed (visible context behind a focused
 *         surface — currently unused since we hide instead of dim,
 *         but the tier is kept for future tweaks).
 *   - 1   otherwise.
 *
 * Focus-mode detail: when any list / detail / search panel calls
 * `useAutoFocusLayer`, every non-focused Mapky layer ends up in
 * `hiddenLayers`. The remaining (un-hidden) Mapky layer is the
 * focused one — the user explicitly opened a sidebar for it, so we
 * override their Layers-sheet toggle and force it visible. The
 * toggle re-applies as soon as the sidebar closes.
 *
 * Each map-layer component multiplies its baked opacity values by
 * the result and reapplies via setPaintProperty.
 */
export function useLayerOpacityMultiplier(layer: DimmableLayer): number {
  const focusHidden = useUiStore((s) => s.hiddenLayers.has(layer));
  const focusActive = useUiStore(
    (s) => s.hiddenLayers.size > 0 || s.dimmedLayers.size > 0,
  );
  const dimmed = useUiStore((s) => s.dimmedLayers.has(layer));
  const userVisible = useUiStore((s) =>
    layer === "places"
      ? s.placesLayerVisible
      : layer === "captures"
        ? s.capturesLayerVisible
        : layer === "incidents"
          ? s.incidentsLayerVisible
          : true,
  );
  if (focusHidden) return 0;
  // No focus active → the user's toggle in the Layers sheet wins.
  if (!focusActive && !userVisible) return 0;
  return dimmed ? DIM_FACTOR : 1;
}
