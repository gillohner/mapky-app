import { memo } from "react";
import { Star, type LucideIcon } from "lucide-react";

/**
 * Balloon variant — drives the body color and whether the BTC badge
 * shows. We collapsed to two variants once BTCMap data was synced into
 * the :Place graph and the server started returning `accepts_bitcoin`
 * on every place. The frontend no longer guesses about BTC status —
 * either the place flag says yes (→ accent color + BTC badge) or no.
 *
 * `place-btc` is the accent variant the user asked us to elevate:
 * Bitcoin-accepted places ARE the accent on the map. Non-BTC places
 * render in a muted slate so the BTC ones pop.
 */
export type BalloonVariant = "place" | "place-btc";

interface Props {
  variant: BalloonVariant;
  /** Pre-formatted rating string (e.g. "4.6") or null when the place
   * has no reviews yet. Renders as a small star chip ABOVE the balloon
   * head when present. */
  rating: string | null;
  /** Lucide icon for the place's OSM category. Always shown inside
   * the balloon head (the rating no longer competes for that space).
   * Falls back to a small white dot until Nominatim resolves the
   * category. */
  Icon: LucideIcon | null;
}

const ACCENT = "#0d9488"; // teal-600 — matches --raw-accent
const MUTED = "#475569"; // slate-600 — non-BTC places, less visually loud
const BITCOIN = "#f7931a"; // BTC orange, used only on the corner badge

/**
 * Teardrop balloon for OSM POIs we have a signal for. Same SVG path
 * SelectedPlaceMarker uses (consistent visual language across
 * selected and non-selected states), with the category icon centered
 * on the balloon's round head and the rating (if any) hovering above
 * as a small star chip.
 *
 * Variants:
 *   - "place"     → muted slate body — no BTC signal
 *   - "place-btc" → accent teal body + small orange BTC badge in the
 *                    upper-right corner of the head
 *
 * BTC acceptance is communicated by *both* the body color (accent
 * teal) AND a corner badge — the accent color says "this is a place
 * we care about" and the orange dot says "specifically because BTC".
 *
 * memoized on its primitive props (and Icon by reference, since
 * Lucide components are stable singletons) so panning the map
 * doesn't re-render every balloon.
 */
function PlaceBalloonImpl({ variant, rating, Icon }: Props) {
  const body = variant === "place-btc" ? ACCENT : MUTED;
  const showBtcBadge = variant === "place-btc";
  const showRating = rating !== null;
  // Reserve vertical space for the chip when present so the SVG
  // bottom (the teardrop tip) still aligns with the marker anchor.
  const totalHeight = showRating ? 53 : 37;
  return (
    <div
      className="relative inline-block"
      style={{ width: 26, height: totalHeight }}
      aria-hidden
    >
      {showRating && (
        // Star chip above the balloon. White pill with a thin border
        // and a soft shadow so it stays readable on every basemap
        // (light, dark, satellite). Amber star + dark text gives the
        // contrast the user asked for.
        <span
          className="absolute left-1/2 -translate-x-1/2 flex items-center gap-0.5 rounded-full border border-black/10 bg-white px-1.5 py-px shadow"
          style={{
            top: 0,
            // Tight font so the chip fits in 14px of vertical space.
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
            fontWeight: 700,
            fontSize: 10,
            lineHeight: 1,
            color: "#111827", // gray-900 for contrast on the white pill
            whiteSpace: "nowrap",
          }}
        >
          <Star
            size={9}
            strokeWidth={2}
            // Filled star reads at this size — the outline alone is
            // too thin to register against the pill background.
            style={{ fill: "#f59e0b", color: "#f59e0b" }}
          />
          {rating}
        </span>
      )}
      <svg
        width={26}
        height={37}
        viewBox="0 0 28 40"
        style={{
          display: "block",
          overflow: "visible",
          // Push the SVG below the chip when present.
          marginTop: showRating ? 16 : 0,
        }}
      >
        <path
          d="M14 2 C7 2 2 7 2 14 C2 22 14 38 14 38 C14 38 26 22 26 14 C26 7 21 2 14 2 Z"
          fill={body}
          stroke="#ffffff"
          strokeWidth={2}
        />
        {showBtcBadge && (
          // Small BTC orange dot in the upper-right corner of the
          // round head. Always-on signal — independent of any layer
          // toggle, because BTC acceptance is intrinsic to the place,
          // not a separate overlay anymore.
          <circle
            cx={22}
            cy={6}
            r={4}
            fill={BITCOIN}
            stroke="#ffffff"
            strokeWidth={1.5}
          />
        )}
      </svg>
      {/* Head overlay — category icon (always when known), with a
          fallback dot until Nominatim resolves the type. Positioned
          over the round part of the teardrop (≈ top 22px). */}
      <span
        className="pointer-events-none absolute flex items-center justify-center text-white"
        style={{
          left: 2,
          top: showRating ? 18 : 2,
          width: 22,
          height: 22,
        }}
      >
        {Icon ? (
          <Icon size={12} strokeWidth={2.5} />
        ) : (
          <span className="block h-1.5 w-1.5 rounded-full bg-white" />
        )}
      </span>
    </div>
  );
}

export const PlaceBalloon = memo(
  PlaceBalloonImpl,
  (a, b) =>
    a.variant === b.variant &&
    a.rating === b.rating &&
    a.Icon === b.Icon,
);
