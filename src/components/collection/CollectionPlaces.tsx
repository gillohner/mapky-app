import { useState } from "react";
import { MapPin } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { parseOsmCanonical, fallbackPlaceLabel } from "@/lib/map/osm-url";
import {
  useOsmLookup,
  usePlaceDetail,
  usePlaceTags,
} from "@/lib/api/hooks";
import { placeStarsLabel } from "@/lib/places/enrich-search";

interface CollectionPlacesProps {
  items: string[];
  /** Pass collection context for back-navigation from place panel */
  authorId?: string;
  collectionId?: string;
}

const PAGE_SIZE = 20;

export function CollectionPlaces({ items, authorId, collectionId }: CollectionPlacesProps) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? items : items.slice(0, PAGE_SIZE);

  if (items.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted">
        No places in this collection yet
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {visible.map((url) => {
        const parsed = parseOsmCanonical(url);
        if (!parsed) return null;
        return (
          <PlaceItem
            key={url}
            osmType={parsed.osmType}
            osmId={parsed.osmId}
            fromAuthor={authorId}
            fromCollection={collectionId}
          />
        );
      })}
      {!showAll && items.length > PAGE_SIZE && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full rounded-lg py-2 text-center text-sm text-accent hover:bg-surface"
        >
          Show all {items.length} places
        </button>
      )}
    </div>
  );
}

function PlaceItem({
  osmType,
  osmId,
  fromAuthor,
  fromCollection,
}: {
  osmType: string;
  osmId: number;
  fromAuthor?: string;
  fromCollection?: string;
}) {
  const navigate = useNavigate();
  const { data: nominatim, isLoading } = useOsmLookup(osmType, osmId, true);
  // Rating + tags live on the indexer side (mapky-nexus-plugin), not
  // in Nominatim. Fetch both per row — hooks share TanStack cache keys
  // with PlaceList / PlacePanel so opening a place is instant.
  const { data: place } = usePlaceDetail(osmType, osmId);
  const { data: tags } = usePlaceTags(osmType, osmId);

  const name =
    nominatim?.name ||
    nominatim?.display_name?.split(",")[0] ||
    fallbackPlaceLabel(osmType, osmId);

  const typeLabel = nominatim?.type?.replace(/_/g, " ") ?? "";
  const stars = placeStarsLabel(place ?? null);
  const topTags = (tags ?? []).slice(0, 3);
  const overflow = (tags?.length ?? 0) - topTags.length;

  const handleClick = () => {
    navigate({
      to: "/place/$osmType/$osmId",
      params: { osmType, osmId: String(osmId) },
      search: {
        lat: nominatim?.lat ?? undefined,
        lon: nominatim?.lon ?? undefined,
        from: fromCollection ? "collection" : undefined,
        fromAuthor: fromAuthor,
        fromCollection: fromCollection,
      },
    });
  };

  return (
    <button
      onClick={handleClick}
      className="flex w-full items-start gap-2 rounded-md border border-border bg-surface p-2 text-left transition-colors hover:border-accent"
    >
      <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        {isLoading ? (
          <div className="h-4 w-32 animate-pulse rounded bg-border" />
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="truncate text-sm text-foreground">{name}</span>
              {typeLabel && typeLabel !== "yes" && (
                <span className="flex-shrink-0 rounded bg-background px-1.5 py-0.5 text-[10px] capitalize text-muted">
                  {typeLabel}
                </span>
              )}
              {stars && (
                <span className="flex-shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                  {stars}
                </span>
              )}
            </div>
            {topTags.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {topTags.map((t) => (
                  <span
                    key={t.label}
                    className="rounded-full bg-background px-2 py-0.5 text-[11px] text-muted"
                  >
                    {t.label}
                  </span>
                ))}
                {overflow > 0 && (
                  <span className="text-[10px] text-muted">+{overflow}</span>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </button>
  );
}
