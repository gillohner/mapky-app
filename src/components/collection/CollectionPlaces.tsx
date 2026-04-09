import { useState } from "react";
import { MapPin } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { parseOsmCanonical } from "@/lib/map/osm-url";
import { useOsmLookup } from "@/lib/api/hooks";

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
    <div className="space-y-1">
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

  const name =
    nominatim?.name ||
    nominatim?.display_name?.split(",")[0] ||
    `${osmType}/${osmId}`;

  const typeLabel = nominatim?.type?.replace(/_/g, " ") ?? "";

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
      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface"
    >
      <MapPin className="h-4 w-4 flex-shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        {isLoading ? (
          <div className="h-4 w-32 animate-pulse rounded bg-border" />
        ) : (
          <div className="flex items-center gap-2">
            <span className="truncate text-sm text-foreground">{name}</span>
            {typeLabel && typeLabel !== "yes" && (
              <span className="flex-shrink-0 rounded bg-surface px-1.5 py-0.5 text-[10px] capitalize text-muted">
                {typeLabel}
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}
