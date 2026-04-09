import { useState, useEffect, useRef, useCallback } from "react";
import { X, ChevronUp, ChevronDown, MapPin, FolderHeart, MessageSquare } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useBoundedSearch, useNominatimSearch, useTagSearch, useOsmLookup } from "@/lib/api/hooks";
import { useUiStore } from "@/stores/ui-store";
import { useMapStore } from "@/stores/map-store";
import { parseOsmCanonical } from "@/lib/map/osm-url";
import type { NominatimSearchResult } from "@/lib/api/nominatim";
import type { PlaceDetails, PostDetails } from "@/types/mapky";
import { SearchResultsOverlay } from "@/components/map/SearchResultsOverlay";

interface SearchPanelProps {
  query: string;
  mode: "places" | "tags";
}

type Viewbox = { west: number; north: number; east: number; south: number };

function getViewbox(map: maplibregl.Map | null): Viewbox | null {
  if (!map) return null;
  const b = map.getBounds();
  return {
    west: b.getWest(),
    north: b.getNorth(),
    east: b.getEast(),
    south: b.getSouth(),
  };
}

export function SearchPanel({ query, mode }: SearchPanelProps) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const map = useMapStore((s) => s.map);

  // Reactive viewport — updates on map move (debounced)
  const [viewbox, setViewbox] = useState<Viewbox | null>(() => getViewbox(map));
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!map) return;
    setViewbox(getViewbox(map));

    const onMoveEnd = () => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setViewbox(getViewbox(map));
      }, 800);
    };

    map.on("moveend", onMoveEnd);
    return () => {
      map.off("moveend", onMoveEnd);
      clearTimeout(debounceRef.current);
    };
  }, [map]);

  // Bounded search: Overpass for category queries, Nominatim for name queries
  const { data: latestNearby = [], isLoading: nearbyLoading } =
    useBoundedSearch(mode === "places" ? query : "", viewbox);

  // Global search: fires once per query (reuses existing searchPlaces, cached)
  const { data: globalResultsRaw = [], isLoading: globalLoading } =
    useNominatimSearch(mode === "places" ? query : "");

  const { data: tagResults, isLoading: tagsLoading } = useTagSearch(
    mode === "tags" ? query : "",
  );

  const isLoading = mode === "places" ? (nearbyLoading || globalLoading) : tagsLoading;

  // Accumulate nearby results across viewport moves within the same query.
  // Reset when query changes. New viewport results merge into the accumulated set.
  const accumulatedRef = useRef<Map<string, NominatimSearchResult>>(new Map());
  const lastQueryRef = useRef(query);

  if (lastQueryRef.current !== query) {
    accumulatedRef.current = new Map();
    lastQueryRef.current = query;
  }

  // Merge latest nearby results into accumulator
  for (const r of latestNearby) {
    const key = `${r.osm_type}:${r.osm_id}`;
    if (!accumulatedRef.current.has(key)) {
      accumulatedRef.current.set(key, r);
    }
  }

  // Filter accumulated results to those currently in viewport + latest results
  const currentViewbox = viewbox;
  const nearbyResults = currentViewbox
    ? Array.from(accumulatedRef.current.values()).filter(
        (r) =>
          r.lat >= currentViewbox.south &&
          r.lat <= currentViewbox.north &&
          r.lon >= currentViewbox.west &&
          r.lon <= currentViewbox.east,
      )
    : latestNearby;

  // Dedupe global results against accumulated nearby
  const nearbyIds = new Set(accumulatedRef.current.keys());
  const globalResults = globalResultsRaw.filter(
    (r) => !nearbyIds.has(`${r.osm_type}:${r.osm_id}`),
  );
  const allPlaceResults = [...nearbyResults, ...globalResults];

  useEffect(() => {
    setSidebarOpen(true);
    return () => setSidebarOpen(false);
  }, [setSidebarOpen]);

  const close = () => navigate({ to: "/" });

  const handleSelectPlace = useCallback((result: NominatimSearchResult) => {
    if (map) {
      map.flyTo({ center: [result.lon, result.lat], zoom: 17, duration: 1500 });
    }
    navigate({
      to: "/place/$osmType/$osmId",
      params: { osmType: result.osm_type, osmId: String(result.osm_id) },
      search: {
        lat: result.lat,
        lon: result.lon,
        from: "search",
        fromSearchQuery: query,
        fromSearchMode: mode,
      },
    });
  }, [map, navigate, query, mode]);

  const handleSelectTagPlace = (place: PlaceDetails) => {
    navigate({
      to: "/place/$osmType/$osmId",
      params: { osmType: place.osm_type, osmId: String(place.osm_id) },
      search: {
        from: "search",
        fromSearchQuery: query,
        fromSearchMode: mode,
      },
    });
  };

  const handleSelectCollection = (authorId: string, collectionId: string) => {
    navigate({
      to: "/collection/$authorId/$collectionId",
      params: { authorId, collectionId },
      search: {
        fromSearchQuery: query,
        fromSearchMode: mode,
      },
    });
  };

  const handleSelectPost = (post: PostDetails) => {
    const parsed = parseOsmCanonical(post.osm_canonical);
    if (!parsed) return;
    navigate({
      to: "/place/$osmType/$osmId",
      params: { osmType: parsed.osmType, osmId: String(parsed.osmId) },
      search: {
        from: "search",
        fromSearchQuery: query,
        fromSearchMode: mode,
      },
    });
  };

  const resultCount =
    mode === "places"
      ? allPlaceResults.length
      : ((tagResults?.places?.length ?? 0) +
         (tagResults?.collections?.length ?? 0) +
         (tagResults?.posts?.length ?? 0));

  const resultsContent = (
    <>
      {isLoading && <LoadingSkeleton />}
      {!isLoading && resultCount === 0 && query.length >= 2 && (
        <p className="py-8 text-center text-sm text-muted">
          No results found for &ldquo;{query}&rdquo;
        </p>
      )}
      {!isLoading && query.length < 2 && (
        <p className="py-8 text-center text-sm text-muted">
          Enter at least 2 characters to search
        </p>
      )}

      {/* Places mode — nearby section */}
      {mode === "places" && nearbyResults.length > 0 && (
        <div>
          <div className="mb-1 flex items-center gap-2 px-2">
            <div className="h-2 w-2 rounded-full bg-amber-500" />
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted">
              In this area ({nearbyResults.length})
            </span>
          </div>
          <PlaceResultList results={nearbyResults} onSelect={handleSelectPlace} />
        </div>
      )}

      {/* Places mode — global section */}
      {mode === "places" && globalResults.length > 0 && (
        <div className={nearbyResults.length > 0 ? "mt-2 border-t border-border pt-2" : ""}>
          <div className="mb-1 px-2">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted">
              Other results ({globalResults.length})
            </span>
          </div>
          <PlaceResultList results={globalResults} onSelect={handleSelectPlace} />
        </div>
      )}

      {/* Tags mode */}
      {mode === "tags" && tagResults && (
        <div className="space-y-3">
          {tagResults.places?.length > 0 && (
            <div>
              <div className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                Places
              </div>
              {tagResults.places.map((p) => (
                <TagPlaceResult
                  key={`${p.osm_type}-${p.osm_id}`}
                  place={p}
                  onSelect={() => handleSelectTagPlace(p)}
                />
              ))}
            </div>
          )}

          {tagResults.collections?.length > 0 && (
            <div>
              <div className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                Collections
              </div>
              {tagResults.collections.map((c) => {
                const [authorId, collectionId] = c.id.split(":");
                return (
                  <button
                    key={c.id}
                    onClick={() => handleSelectCollection(authorId, collectionId)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-surface"
                  >
                    <FolderHeart className="h-4 w-4 flex-shrink-0 text-accent" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {c.name}
                      </p>
                      <p className="text-xs text-muted">
                        {c.items.length} places
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {tagResults.posts?.length > 0 && (
            <div>
              <div className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                Posts
              </div>
              {tagResults.posts.map((post) => (
                <button
                  key={`${post.author_id}-${post.id}`}
                  onClick={() => handleSelectPost(post)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-surface"
                >
                  <MessageSquare className="h-4 w-4 flex-shrink-0 text-accent" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">
                      {post.content
                        ? post.content.slice(0, 80) +
                          (post.content.length > 80 ? "..." : "")
                        : post.kind === "review"
                          ? "Review"
                          : "Post"}
                    </p>
                    <p className="text-xs text-muted">
                      {post.kind === "review" && post.rating
                        ? `${(post.rating / 2).toFixed(1)} stars · `
                        : ""}
                      <OsmPlaceName osmCanonical={post.osm_canonical} />
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Map overlay — show ALL accumulated results so markers persist across pans */}
      {mode === "places" && accumulatedRef.current.size > 0 && (
        <SearchResultsOverlay
          results={Array.from(accumulatedRef.current.values())}
          searchQuery={query}
          searchMode={mode}
        />
      )}

      {/* Desktop sidebar */}
      <div className="pointer-events-auto absolute inset-y-0 left-12 z-10 hidden w-[380px] flex-col border-r border-border bg-background shadow-xl md:flex">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">
              Search
            </span>
            {!isLoading && resultCount > 0 && (
              <span className="text-xs text-muted">
                {resultCount} result{resultCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <button
            onClick={close}
            className="rounded-lg p-1 text-muted transition-colors hover:bg-surface hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {query && (
            <p className="mb-3 text-sm text-muted">
              Results for &ldquo;<span className="text-foreground">{query}</span>&rdquo;
            </p>
          )}
          {resultsContent}
        </div>
      </div>

      {/* Mobile bottom sheet */}
      <div
        className={`pointer-events-auto absolute bottom-0 left-0 right-0 z-10 flex flex-col rounded-t-2xl border-t border-border bg-background shadow-2xl transition-[max-height] duration-300 ease-out md:hidden ${
          expanded ? "max-h-[85vh]" : "max-h-[200px]"
        }`}
      >
        <div className="flex-shrink-0 px-4 pt-2 pb-3">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border" />
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">
              Search
            </span>
            {!isLoading && resultCount > 0 && (
              <span className="text-xs text-muted">
                {resultCount} result{resultCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          {query && (
            <p className="mt-1 text-sm text-muted">
              Results for &ldquo;<span className="text-foreground">{query}</span>&rdquo;
            </p>
          )}
          <div className="absolute right-2 top-2 flex items-center gap-1">
            <button
              onClick={() => setExpanded((v) => !v)}
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface hover:text-foreground"
            >
              {expanded ? (
                <ChevronDown className="h-5 w-5" />
              ) : (
                <ChevronUp className="h-5 w-5" />
              )}
            </button>
            <button
              onClick={close}
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {expanded && (
          <div className="flex-1 overflow-y-auto border-t border-border px-4 py-3">
            {resultsContent}
          </div>
        )}
      </div>
    </>
  );
}

/** Reusable place result list for nearby/global sections */
function PlaceResultList({
  results,
  onSelect,
}: {
  results: NominatimSearchResult[];
  onSelect: (result: NominatimSearchResult) => void;
}) {
  return (
    <div className="space-y-0.5">
      {results.map((result) => {
        const typeLabel = result.type?.replace(/_/g, " ") || "";
        const categoryLabel = result.category?.replace(/_/g, " ") || "";
        const badge =
          typeLabel === "yes" || typeLabel === "unclassified"
            ? categoryLabel
            : typeLabel;

        return (
          <button
            key={`${result.osm_type}-${result.osm_id}`}
            onClick={() => onSelect(result)}
            className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface"
          >
            <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-foreground">
                  {result.name}
                </span>
                {badge && (
                  <span className="flex-shrink-0 rounded bg-surface px-1.5 py-0.5 text-[10px] capitalize text-muted">
                    {badge}
                  </span>
                )}
              </div>
              <p className="text-xs leading-relaxed text-muted">
                {result.display_name}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function OsmPlaceName({ osmCanonical }: { osmCanonical: string }) {
  const parsed = parseOsmCanonical(osmCanonical);
  const { data: nominatim } = useOsmLookup(
    parsed?.osmType ?? "",
    parsed?.osmId ?? 0,
    !!parsed,
  );
  return <>{nominatim?.name || nominatim?.display_name?.split(",")[0] || osmCanonical}</>;
}

function TagPlaceResult({
  place,
  onSelect,
}: {
  place: PlaceDetails;
  onSelect: () => void;
}) {
  const { data: nominatim } = useOsmLookup(place.osm_type, place.osm_id, true);

  const name =
    nominatim?.name ||
    nominatim?.display_name?.split(",")[0] ||
    place.osm_canonical;

  const typeLabel = nominatim?.type?.replace(/_/g, " ") ?? "";

  return (
    <button
      onClick={onSelect}
      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-surface"
    >
      <MapPin className="h-4 w-4 flex-shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm text-foreground">{name}</span>
          {typeLabel && typeLabel !== "yes" && (
            <span className="flex-shrink-0 rounded bg-surface px-1.5 py-0.5 text-[10px] capitalize text-muted">
              {typeLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          {place.tag_count > 0 && <span>{place.tag_count} tags</span>}
          {place.review_count > 0 && <span>{place.review_count} reviews</span>}
        </div>
      </div>
    </button>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2.5 px-2">
          <div className="h-4 w-4 animate-pulse rounded-full bg-border" />
          <div className="flex-1 space-y-1">
            <div className="h-4 w-40 animate-pulse rounded bg-border" />
            <div className="h-3 w-56 animate-pulse rounded bg-border" />
          </div>
        </div>
      ))}
    </div>
  );
}
