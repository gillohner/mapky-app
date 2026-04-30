import { useUiStore, type DimmableLayer } from "@/stores/ui-store";

/**
 * Opacity multiplier applied when an auto-focused detail page wants to
 * keep secondary layers visible-but-de-emphasized. Picked by feel — low
 * enough to obviously fade, high enough to remain useful for context.
 */
export const DIM_FACTOR = 0.4;

/**
 * Returns the current opacity multiplier for a Mapky data layer:
 *   - 0   when the layer is hidden (focus mode: search active, list
 *         filter active, detail panel open with hide=true).
 *   - 0.4 when the layer is dimmed (default focus behavior — visible
 *         but de-emphasized so the focused content stands out).
 *   - 1   otherwise.
 *
 * Hidden takes precedence over dimmed. Each map-layer component
 * multiplies its baked opacity values by the result and reapplies via
 * setPaintProperty.
 */
export function useLayerOpacityMultiplier(layer: DimmableLayer): number {
  const hidden = useUiStore((s) => s.hiddenLayers.has(layer));
  const dimmed = useUiStore((s) => s.dimmedLayers.has(layer));
  if (hidden) return 0;
  return dimmed ? DIM_FACTOR : 1;
}
