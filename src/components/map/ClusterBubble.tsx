import { memo } from "react";

interface Props {
  total: number;
  /** Reviewed-place sub-count drives the ring intensity — a cell with
   *  rated places gets a stronger accent ring so dense review areas
   *  stand out. Optional; absent treats the cluster as plain. */
  reviewed?: number;
}

/**
 * Cluster bubble for the low-zoom viewport.
 *
 * Pure count + accent ring. Bitcoin used to surface here as a corner
 * badge ("3 BTC of 12 places"), but the BTCMap-flooded merchants
 * dominated those counts and the place layer now narrows to Mapky-
 * engaged places by default — the BTC sub-count was a holdover from
 * before the BTC overlay split. Bitcoin merchants live in the
 * dedicated `/btc/viewport` overlay layer instead.
 *
 * Sized logarithmically (32-52 px) so a 5-place cluster and a
 * 5000-place cluster don't collapse into the same dot. Hover bumps
 * ring opacity to make clickability obvious.
 */
function ClusterBubbleImpl({ total, reviewed = 0 }: Props) {
  const diameter = Math.max(32, Math.min(52, 28 + Math.log10(total + 1) * 8));
  const hasReviews = reviewed > 0;
  // Font scales modestly with diameter so bigger bubbles get a
  // proportionally larger number — keeps density readable at a glance.
  const fontSize = diameter >= 46 ? 14 : diameter >= 38 ? 12 : 11;

  return (
    <div
      className="relative"
      style={{ width: diameter, height: diameter }}
      aria-label={`${total} places${
        hasReviews ? `, ${reviewed} reviewed` : ""
      }`}
    >
      <div
        className={[
          "absolute inset-0 flex items-center justify-center rounded-full",
          "bg-background/95 backdrop-blur-sm shadow-md",
          "transition-all duration-150",
          // Reviewed-cells get a stronger accent ring to stand out;
          // un-reviewed Mapky clusters use the same accent at lower
          // intensity so the visual language stays consistent.
          hasReviews
            ? "ring-2 ring-accent shadow-accent/20"
            : "ring-1 ring-accent/40",
          "hover:ring-accent",
        ].join(" ")}
      >
        <span
          className="select-none font-semibold tabular-nums text-foreground"
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
  (a, b) => a.total === b.total && a.reviewed === b.reviewed,
);
