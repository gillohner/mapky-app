import { memo } from "react";
import { Star, type LucideIcon } from "lucide-react";

export type BalloonVariant = "mapky" | "bitcoin" | "both";

interface Props {
  variant: BalloonVariant;
  /** Pre-formatted rating string (e.g. "4.6") or null when the place
   * has no reviews yet. Only meaningful for "mapky" / "both" — when
   * present, renders as a small chip ABOVE the balloon head. */
  rating: string | null;
  /** Lucide icon for the place's OSM category. Always shown inside
   * the balloon head (the rating no longer competes for that space).
   * Falls back to a small white dot until Nominatim resolves the
   * category. */
  Icon: LucideIcon | null;
  /** When set, marks the place as a member of an active collection
   * overlay. The whole balloon body switches to this color with a
   * white border (overrides the variant's body color), so collection
   * pins read as one cohesive group at a glance. */
  collectionColor?: string;
}

const ACCENT = "#0d9488"; // teal-600 — matches --raw-accent
const BITCOIN = "#f7931a";
// Dark orange used for the stroke when a place is BOTH Mapky-rated AND
// Bitcoin-accepting. White would blend with the teal core; the dark
// orange ring reinforces "this place carries both signals" at a
// glance.
const BITCOIN_DARK = "#9a3412"; // orange-800

/**
 * Teardrop balloon for OSM POIs we have a signal for. Same SVG path
 * SelectedPlaceMarker uses (consistent visual language across
 * selected and non-selected states), with the category icon centered
 * on the balloon's round head and the rating (if any) hovering above
 * as a small star chip.
 *
 * Variants:
 *   - "mapky":   accent-teal body
 *   - "bitcoin": Bitcoin-orange body
 *   - "both":    orange body wrapping a smaller accent-teal core
 *
 * Head content priority:
 *   1. Category icon if Nominatim has resolved a known type
 *   2. Small white dot fallback while Nominatim is still loading
 * Rating (when present) renders as a separate chip above the head, so
 * "what is this" and "how rated" are readable at the same time.
 *
 * memoized on its primitive props (and Icon by reference, since
 * Lucide components are stable singletons) so panning the map
 * doesn't re-render every balloon.
 */
function PlaceBalloonImpl({ variant, rating, Icon, collectionColor }: Props) {
  // Collection membership overrides the variant body — places pinned
  // to an active collection render entirely in that collection's
  // color with a white outline. Only when no collection is active
  // does the Mapky/Bitcoin variant drive the body color.
  const inCollection = !!collectionColor;
  const outer = inCollection
    ? collectionColor
    : variant === "mapky"
      ? ACCENT
      : BITCOIN;
  const showRating = variant !== "bitcoin" && rating !== null;
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
          fill={outer}
          stroke={!inCollection && variant === "both" ? BITCOIN_DARK : "#ffffff"}
          strokeWidth={2}
        />
        {!inCollection && variant === "both" && (
          // Mapky+Bitcoin (no collection): orange body wraps a
          // smaller accent-teal core so both signals show. When a
          // collection takes over the body, we drop the core — the
          // collection identity becomes the loudest signal.
          <circle cx={14} cy={14} r={8} fill={ACCENT} />
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
    a.Icon === b.Icon &&
    a.collectionColor === b.collectionColor,
);
