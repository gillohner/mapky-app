import type { ReactElement } from "react";
import { Star, Tag, MessageCircle, FolderHeart, Filter, RotateCcw } from "lucide-react";
import { useUiStore } from "@/stores/ui-store";
import { PLACE_ACTIVITIES, type PlaceActivity } from "@/types/mapky";

interface PlaceFilterControlsProps {
  /** Tighten the layout when embedded in a sidebar list. */
  variant?: "sheet" | "compact";
  /** Render disabled (Layer sheet uses this when the master Places toggle is off). */
  disabled?: boolean;
}

const ACTIVITY_LABEL: Record<PlaceActivity, string> = {
  tagged: "Tagged",
  reviewed: "Reviewed",
  posted: "Posted",
  collected: "Collected",
};

const ACTIVITY_ICON: Record<
  PlaceActivity,
  (props: { className?: string }) => ReactElement
> = {
  tagged: ({ className }) => <Tag className={className} />,
  reviewed: ({ className }) => <Star className={className} />,
  posted: ({ className }) => <MessageCircle className={className} />,
  collected: ({ className }) => <FolderHeart className={className} />,
};

/**
 * Filter controls for the Places layer. Two dimensions:
 *
 * - **Activity** — multi-select OR pills (`tagged|reviewed|posted|collected`).
 *   Each picks one or more activity dimensions a place must satisfy. Pills
 *   combine with OR — the empty set means "any place in viewport".
 * - **Min rating** — 0–5 floor on the average rating; default 0 (no filter).
 *
 * Sent server-side as `?activity=tagged,reviewed&min_rating=4` to
 * `/v0/mapky/viewport`. Filtering happens in the same Cypher pass — no
 * client-side post-filtering, no second query.
 *
 * Mounted both in the Layer sheet (top-right floating panel) and inside
 * the Places sidebar tab so users can adjust filters without opening
 * the sheet.
 */
export function PlaceFilterControls({
  variant = "sheet",
  disabled = false,
}: PlaceFilterControlsProps) {
  const placesFilters = useUiStore((s) => s.placesFilters);
  const togglePlaceActivity = useUiStore((s) => s.togglePlaceActivity);
  const setMinRating = useUiStore((s) => s.setMinRating);
  const resetPlacesFilters = useUiStore((s) => s.resetPlacesFilters);

  const hasFilter =
    placesFilters.activities.length > 0 ||
    (placesFilters.minRating ?? 0) > 0;

  const containerClass =
    variant === "sheet"
      ? "flex flex-col gap-2 pl-7 pr-2 pb-1.5"
      : "flex flex-col gap-2";

  return (
    <div
      className={`${containerClass} ${
        disabled ? "opacity-50 pointer-events-none" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {PLACE_ACTIVITIES.map((a) => {
          const Icon = ACTIVITY_ICON[a];
          const on = placesFilters.activities.includes(a);
          return (
            <button
              key={a}
              type="button"
              onClick={() => togglePlaceActivity(a)}
              aria-pressed={on}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                on
                  ? "border-accent/40 bg-accent/10 text-accent"
                  : "border-border bg-surface text-muted hover:border-accent/60 hover:text-accent"
              }`}
            >
              <Icon className="h-3 w-3" />
              {ACTIVITY_LABEL[a]}
            </button>
          );
        })}
        {hasFilter && (
          <button
            type="button"
            onClick={resetPlacesFilters}
            className="ml-auto inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-1 text-[10px] text-muted hover:text-foreground"
            title="Clear filters"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
        )}
      </div>
      <RatingSlider
        value={placesFilters.minRating ?? 0}
        onChange={setMinRating}
      />
      {variant === "compact" && (
        <p className="text-[10px] text-muted">
          <Filter className="mr-1 inline-block h-3 w-3" aria-hidden />
          Combine activity pills with OR (any match). Min rating filters
          places below the threshold.
        </p>
      )}
    </div>
  );
}

function RatingSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted">
      <Star
        className={`h-3.5 w-3.5 ${value > 0 ? "text-accent" : "text-muted"}`}
        aria-hidden
      />
      <span className="w-16 shrink-0">Min rating</span>
      <input
        type="range"
        min={0}
        max={5}
        step={0.5}
        value={value}
        onChange={(e) => {
          const next = parseFloat(e.target.value);
          onChange(Number.isFinite(next) ? next : undefined);
        }}
        className="flex-1 accent-accent"
        aria-label="Minimum rating"
      />
      <span
        className={`w-7 text-right tabular-nums ${
          value > 0 ? "text-foreground" : "text-muted"
        }`}
      >
        {value > 0 ? value.toFixed(1) : "any"}
      </span>
    </label>
  );
}
