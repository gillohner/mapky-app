import { useUiStore, type DimmableLayer } from "@/stores/ui-store";

/**
 * Opacity multiplier applied when an auto-focused detail page wants to
 * keep secondary layers visible-but-de-emphasized. Picked by feel — low
 * enough to obviously fade, high enough to remain useful for context.
 */
export const DIM_FACTOR = 0.4;

/**
 * Returns 1.0 when this layer is at full visibility, DIM_FACTOR when the
 * `useAutoFocusLayer` hook on a detail page has marked it as a secondary
 * layer. Each map-layer component multiplies its baked opacity values by
 * the result and reapplies via setPaintProperty.
 */
export function useLayerOpacityMultiplier(layer: DimmableLayer): number {
  const dimmed = useUiStore((s) => s.dimmedLayers.has(layer));
  return dimmed ? DIM_FACTOR : 1;
}
