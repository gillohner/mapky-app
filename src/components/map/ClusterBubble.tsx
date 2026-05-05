import { memo } from "react";
import { Bitcoin } from "lucide-react";

interface Props {
  total: number;
  btc: number;
  reviewed: number;
  tagged: number;
}

/**
 * Cluster bubble for the low-zoom viewport.
 *
 * Design language matches the rest of the app: theme-token colors
 * (bg-background, text-foreground, ring-accent), a soft elevation
 * shadow, and a subtle ring that intensifies when the cell carries
 * BTC-accepting places. The number is the primary signal; the
 * Bitcoin badge in the upper-right is the secondary one.
 *
 * Sized logarithmically (36-60px) so a 5-place cluster and a
 * 5000-place cluster don't collapse into the same dot. Hover bumps
 * scale + ring opacity to make clickability obvious.
 */
function ClusterBubbleImpl({ total, btc, reviewed }: Props) {
  // Log scale on the diameter — even at 1M+ a cluster never dominates
  // the map. Tighter range than before (32-52 px) so dense areas
  // don't pile bubbles into a soup of overlapping circles.
  const diameter = Math.max(32, Math.min(52, 28 + Math.log10(total + 1) * 8));
  const hasBtc = btc > 0;
  const hasReviews = reviewed > 0;
  // Font scales modestly with diameter so bigger bubbles get a
  // proportionally larger number — keeps density readable at a glance.
  const fontSize =
    diameter >= 46 ? 14 : diameter >= 38 ? 12 : 11;

  return (
    <div
      // Outer wrapper is bigger than the visual bubble to give the
      // BTC badge room without being clipped by the marker bbox. The
      // bubble itself is centered inside.
      className="relative"
      style={{ width: diameter + 16, height: diameter + 16 }}
      aria-label={`${total} places${hasBtc ? `, ${btc} accept Bitcoin` : ""}${
        hasReviews ? `, ${reviewed} reviewed` : ""
      }`}
    >
      <div
        className={[
          // Centered bubble inside the wrapper. Themed surface, soft
          // shadow, ring carries the BTC signal: accent-colored when
          // any place in this cell accepts BTC, neutral border otherwise.
          "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
          "flex items-center justify-center rounded-full",
          "bg-background/95 backdrop-blur-sm shadow-md",
          "transition-all duration-150",
          hasBtc
            ? "ring-2 ring-accent shadow-accent/20"
            : "ring-1 ring-border",
          "hover:ring-accent",
        ].join(" ")}
        style={{ width: diameter, height: diameter }}
      >
        <span
          className="select-none font-semibold tabular-nums text-foreground"
          style={{ fontSize, lineHeight: 1 }}
        >
          {abbreviate(total)}
        </span>
      </div>

      {/* BTC corner badge — pinned to the top-right of the WRAPPER,
          not the bubble, so the badge has its own real estate and
          doesn't visually overlap with the count when the cluster is
          small. Mirrors the corner-dot pattern on PlaceBalloon. */}
      {hasBtc && (
        <span
          className={[
            "absolute right-0 top-0",
            "flex items-center gap-0.5",
            "rounded-full bg-accent text-[10px] font-bold text-white",
            "px-1.5 py-0.5 shadow-sm",
            "ring-2 ring-background",
          ].join(" ")}
          aria-hidden
        >
          <Bitcoin className="h-2.5 w-2.5" strokeWidth={2.5} />
          {abbreviate(btc)}
        </span>
      )}
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
    a.btc === b.btc &&
    a.reviewed === b.reviewed &&
    a.tagged === b.tagged,
);
