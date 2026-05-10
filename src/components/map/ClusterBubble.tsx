import { memo } from "react";

export type ClusterVariant = "mapky" | "btc";

interface Props {
  total: number;
  /** Reviewed-place sub-count drives the ring intensity — a cell with
   *  rated places gets a stronger accent ring so dense review areas
   *  stand out. Optional; absent treats the cluster as plain. Only
   *  meaningful for `variant: "mapky"` (the BTC overlay doesn't carry
   *  sub-counts). */
  reviewed?: number;
  /** Color theme. `mapky` = teal accent (Mapky-engaged places).
   *  `btc` = orange (Bitcoin-accepting POIs). Both share the same
   *  layout so a place that's both Mapky-engaged AND BTC produces
   *  two stacked bubbles at the same lat/lon, conveying both signals. */
  variant?: ClusterVariant;
}

/**
 * Cluster bubble for the low-zoom viewport.
 *
 * Two color variants: `mapky` (teal) for the place layer, `btc`
 * (orange) for the BTC overlay layer. Same shape, same sizing logic,
 * different fills — visually consistent across layers but clearly
 * distinguishable. When both layers cluster the same cell, the
 * server-side cell-midpoint snapping gives them identical lat/lon, so
 * the user sees them perfectly stacked at the same map point.
 *
 * Sized logarithmically (32-52 px) so a 5-place cluster and a
 * 5000-place cluster don't collapse into the same dot.
 */
function ClusterBubbleImpl({ total, reviewed = 0, variant = "mapky" }: Props) {
  const diameter = Math.max(32, Math.min(52, 28 + Math.log10(total + 1) * 8));
  const hasReviews = reviewed > 0;
  // Font scales modestly with diameter so bigger bubbles get a
  // proportionally larger number — keeps density readable at a glance.
  const fontSize = diameter >= 46 ? 14 : diameter >= 38 ? 12 : 11;

  // Variant-specific ring + text colors. Background stays themed
  // (`bg-background/95`) so dark mode reads correctly; only the ring
  // and number color change between Mapky/BTC.
  const ringClass =
    variant === "btc"
      ? "ring-2 ring-[color:var(--btc-orange,#f7931a)] shadow-[color:var(--btc-orange,#f7931a)]/20"
      : hasReviews
        ? "ring-2 ring-accent shadow-accent/20"
        : "ring-1 ring-accent/40";
  const textClass =
    variant === "btc" ? "text-[color:var(--btc-orange,#f7931a)]" : "text-foreground";

  return (
    <div
      className="relative"
      style={{ width: diameter, height: diameter }}
      aria-label={`${total} ${
        variant === "btc" ? "Bitcoin POI" : "place"
      }${total === 1 ? "" : "s"}${
        variant === "mapky" && hasReviews ? `, ${reviewed} reviewed` : ""
      }`}
    >
      <div
        className={[
          "absolute inset-0 flex items-center justify-center rounded-full",
          "bg-background/95 backdrop-blur-sm shadow-md",
          "transition-all duration-150",
          ringClass,
          variant === "btc"
            ? "hover:ring-[color:var(--btc-orange,#f7931a)]"
            : "hover:ring-accent",
        ].join(" ")}
      >
        <span
          className={`select-none font-semibold tabular-nums ${textClass}`}
          style={{ fontSize, lineHeight: 1 }}
        >
          {abbreviate(total)}
        </span>
      </div>
    </div>
  );
}

/** Compact thousand-separator for in-bubble display.
 *   1234 → "1.2k", 12345 → "12k", 1234567 → "1.2M" */
function abbreviate(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export const ClusterBubble = memo(
  ClusterBubbleImpl,
  (a, b) =>
    a.total === b.total &&
    a.reviewed === b.reviewed &&
    a.variant === b.variant,
);
