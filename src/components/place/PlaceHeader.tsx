import { ExternalLink, Star, MessageSquare, Tag, Camera } from "lucide-react";
import type { PlaceDetails } from "@/types/mapky";
import { useOsmLookup } from "@/lib/api/hooks";
import { buildAddressName, resolvePlaceName } from "@/lib/places/place-name";

function formatType(type: string | null, category: string | null): string | null {
  if (!type && !category) return null;
  const t = type?.replace(/_/g, " ") ?? "";
  const c = category?.replace(/_/g, " ") ?? "";
  if (t === "yes" || t === "unclassified") return c || null;
  if (c && c !== t) return `${t} · ${c}`;
  return t || null;
}

function RatingStars({ rating }: { rating: number }) {
  const display = rating / 2;
  const full = Math.floor(display);
  const hasHalf = display - full >= 0.5;

  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${
            i < full
              ? "fill-amber-400 text-amber-400"
              : i === full && hasHalf
                ? "fill-amber-400/50 text-amber-400"
                : "text-border"
          }`}
        />
      ))}
      <span className="ml-1 text-xs text-muted">{display.toFixed(1)}</span>
    </div>
  );
}

interface PlaceHeaderProps {
  osmType: string;
  osmId: number;
  place?: PlaceDetails;
  /** Fallback name from tile click (used before Nominatim loads) */
  tileName?: string;
  /** Fallback kind from tile click */
  tileKind?: string;
}

export function PlaceHeader({ osmType, osmId, place, tileName, tileKind }: PlaceHeaderProps) {
  const needsLookup = !tileName || !!place;
  const {
    data: nominatim,
    isLoading: nameLoading,
    isError: nameError,
  } = useOsmLookup(osmType, osmId, needsLookup);

  // Shared resolver — nominatim.name → tile name → built address →
  // display_name fragment → "way 12345" identifier. Centralised so a
  // place's name is identical in the header, the list rows, and the
  // sidebar peek.
  const placeName = resolvePlaceName(osmType, osmId, nominatim, tileName);
  // Show skeleton only while the lookup is genuinely in flight — once
  // we have ANY signal (nominatim, tileName, or fallback) we render.
  const haveResolved =
    !!nominatim?.name ||
    !!tileName ||
    !!buildAddressName(nominatim?.address) ||
    !!nominatim?.display_name;
  const showSkeleton = nameLoading && !tileName && !nameError && !haveResolved;

  const locationType =
    formatType(nominatim?.type ?? null, nominatim?.category ?? null) ||
    (tileKind ? tileKind.replace(/_/g, " ") : null);

  const osmUrl = `https://www.openstreetmap.org/${osmType}/${osmId}`;
  const isIndexed = !!place;

  return (
    <div>
      <h2 className="pr-16 text-lg font-semibold text-foreground">
        {showSkeleton ? (
          <span className="inline-block h-5 w-40 animate-pulse rounded bg-border" />
        ) : (
          placeName
        )}
      </h2>

      {locationType && (
        <span className="mt-1 inline-block rounded bg-surface px-2 py-0.5 text-xs capitalize text-muted">
          {locationType}
        </span>
      )}

      {nominatim?.display_name && (
        <p className="mt-1 pr-16 text-xs leading-relaxed text-muted">
          {nominatim.display_name}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-3">
        {isIndexed && place.review_count > 0 && (
          <RatingStars rating={place.avg_rating} />
        )}

        <div className="flex items-center gap-2.5 text-xs text-muted">
          {isIndexed && place.review_count > 0 && (
            <span className="flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              {place.review_count}
            </span>
          )}
          {isIndexed && place.tag_count > 0 && (
            <span className="flex items-center gap-1">
              <Tag className="h-3 w-3" />
              {place.tag_count}
            </span>
          )}
          {isIndexed && place.photo_count > 0 && (
            <span className="flex items-center gap-1">
              <Camera className="h-3 w-3" />
              {place.photo_count}
            </span>
          )}
          {!isIndexed && (
            <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-xs font-medium text-accent">
              Not yet on Mapky
            </span>
          )}
          <a
            href={osmUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-muted hover:text-foreground"
          >
            <ExternalLink className="h-3 w-3" />
            OSM
          </a>
        </div>
      </div>

      {isIndexed && place.review_count === 0 && place.tag_count === 0 && (
        <p className="mt-2 text-xs text-muted">No reviews or tags yet</p>
      )}
    </div>
  );
}
