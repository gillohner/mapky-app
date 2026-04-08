import { ExternalLink, Star, MessageSquare, Tag, Camera } from "lucide-react";
import type { PlaceDetails } from "@/types/mapky";
import { useOsmLookup } from "@/lib/api/hooks";

function formatType(type: string | null, category: string | null): string | null {
  if (!type && !category) return null;
  const t = type?.replace(/_/g, " ") ?? "";
  const c = category?.replace(/_/g, " ") ?? "";
  if (t === "yes" || t === "unclassified") return c || null;
  if (c && c !== t) return `${t} · ${c}`;
  return t || null;
}

/** Build a display name from Nominatim address fields. */
function buildAddressName(address: Record<string, string>): string | null {
  const num = address.house_number;
  const road = address.road;
  if (num && road) return `${num} ${road}`;
  if (road) return road;
  for (const key of ["hamlet", "village", "suburb", "town", "city"]) {
    if (address[key]) return address[key];
  }
  return null;
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
  place?: PlaceDetails;
  /** Fallback name from tile click (used before Nominatim loads) */
  tileName?: string;
  /** Fallback kind from tile click */
  tileKind?: string;
}

export function PlaceHeader({ place, tileName, tileKind }: PlaceHeaderProps) {
  const osmType = place?.osm_type ?? "node";
  const osmId = place?.osm_id ?? 0;
  const needsLookup = !tileName || !!place;
  const { data: nominatim, isLoading: nameLoading } = useOsmLookup(
    osmType,
    osmId,
    needsLookup,
  );

  const placeName =
    nominatim?.name ||
    tileName ||
    (nominatim?.address && buildAddressName(nominatim.address)) ||
    nominatim?.display_name?.split(",")[0] ||
    `${osmType}/${osmId}`;

  const locationType =
    formatType(nominatim?.type ?? null, nominatim?.category ?? null) ||
    (tileKind ? tileKind.replace(/_/g, " ") : null);

  const osmUrl = `https://www.openstreetmap.org/${osmType}/${osmId}`;
  const isIndexed = !!place;

  return (
    <div>
      <h2 className="pr-16 text-lg font-semibold text-foreground">
        {nameLoading && !tileName ? (
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
        <p className="mt-1 pr-16 text-xs text-muted line-clamp-1">
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
