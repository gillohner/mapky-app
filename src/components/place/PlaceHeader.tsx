import { ExternalLink, Star, MessageSquare, Tag, Camera } from "lucide-react";
import type { PlaceDetails } from "@/types/mapky";
import { useNominatimReverse } from "@/lib/api/hooks";

function formatType(type: string | null, category: string | null): string | null {
  if (!type && !category) return null;
  const t = type?.replace(/_/g, " ") ?? "";
  const c = category?.replace(/_/g, " ") ?? "";
  // Avoid showing redundant "yes" type (Nominatim returns this for some features)
  if (t === "yes" || t === "unclassified") return c || null;
  if (c && c !== t) return `${t} · ${c}`;
  return t || null;
}

function RatingStars({ rating }: { rating: number }) {
  const display = rating / 2; // 1-10 internal → 1-5 display
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
  place: PlaceDetails;
}

export function PlaceHeader({ place }: PlaceHeaderProps) {
  const { data: nominatim, isLoading: nameLoading } = useNominatimReverse(
    place.lat,
    place.lon,
  );

  const placeName =
    nominatim?.name ||
    nominatim?.display_name?.split(",")[0] ||
    `${place.osm_type}/${place.osm_id}`;

  const locationType = formatType(nominatim?.type ?? null, nominatim?.category ?? null);
  const osmUrl = `https://www.openstreetmap.org/${place.osm_type}/${place.osm_id}`;

  return (
    <div>
      <h2 className="pr-16 text-lg font-semibold text-foreground">
        {nameLoading ? (
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
        {place.review_count > 0 && <RatingStars rating={place.avg_rating} />}

        <div className="flex items-center gap-2.5 text-xs text-muted">
          {place.review_count > 0 && (
            <span className="flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              {place.review_count}
            </span>
          )}
          {place.tag_count > 0 && (
            <span className="flex items-center gap-1">
              <Tag className="h-3 w-3" />
              {place.tag_count}
            </span>
          )}
          {place.photo_count > 0 && (
            <span className="flex items-center gap-1">
              <Camera className="h-3 w-3" />
              {place.photo_count}
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

      {place.review_count === 0 && place.tag_count === 0 && (
        <p className="mt-2 text-xs text-muted">No reviews or tags yet</p>
      )}
    </div>
  );
}
