import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  MapPin,
  FolderHeart,
  MessageSquare,
  Route as RouteIcon,
  Camera,
  Layers,
  AlertTriangle,
} from "lucide-react";
import { MobileBottomSheet } from "@/components/shared/MobileBottomSheet";
import { useNavigate } from "@tanstack/react-router";
import {
  useBoundedSearch,
  useNominatimSearch,
  useTagSearch,
  useOsmLookup,
  useOsmLookupBatch,
} from "@/lib/api/hooks";
import { useMapStore } from "@/stores/map-store";
import { useAutoFocusLayer } from "@/hooks/use-auto-focus-layer";
import { useSidebarPresence } from "@/hooks/use-sidebar-presence";
import { parseOsmCanonical } from "@/lib/map/osm-url";
import { resolvePlaceName } from "@/lib/places/place-name";
import type { NominatimSearchResult } from "@/lib/api/nominatim";
import type {
  MapkyPostDetails,
  PlaceDetails,
  ReviewDetails,
  RouteDetails,
} from "@/types/mapky";
import { SearchResultsOverlay } from "@/components/map/SearchResultsOverlay";
import {
  placeStarsLabel,
  sortByRating,
  useEnrichedSearchResults,
  type EnrichedResult,
} from "@/lib/places/enrich-search";

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

function inViewbox(lat: number, lon: number, vb: Viewbox): boolean {
  return (
    lat >= vb.south && lat <= vb.north && lon >= vb.west && lon <= vb.east
  );
}

export function SearchPanel({ query, mode }: SearchPanelProps) {
  const navigate = useNavigate();
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

  const isLoading =
    mode === "places" ? nearbyLoading || globalLoading : tagsLoading;

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

  // Enrich every Nominatim result with the indexer's PlaceDetails +
  // tags via batched useQueries. Sort the nearby and global subsets
  // independently so the highest-rated nearby is at the top of its
  // section (we don't reorder across sections — "in this area" stays
  // a separate group).
  const allAccumulated = useMemo(
    () => {
      // Merge nearby (bounded) + global so the enrichment pipeline
      // covers both — without this, enrichedGlobal was always empty.
      const combined = new Map(accumulatedRef.current);
      for (const r of globalResultsRaw) {
        const key = `${r.osm_type}:${r.osm_id}`;
        if (!combined.has(key)) combined.set(key, r);
      }
      return Array.from(combined.values());
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [latestNearby, globalResultsRaw, accumulatedRef.current.size],
  );
  const enrichedAll = useEnrichedSearchResults(allAccumulated);
  const enrichedByKey = useMemo(() => {
    const map = new Map<string, EnrichedResult>();
    for (const e of enrichedAll) {
      map.set(`${e.result.osm_type}:${e.result.osm_id}`, e);
    }
    return map;
  }, [enrichedAll]);
  const enrichedNearby = useMemo(
    () =>
      sortByRating(
        nearbyResults
          .map((r) => enrichedByKey.get(`${r.osm_type}:${r.osm_id}`))
          .filter((e): e is EnrichedResult => !!e),
      ),
    [nearbyResults, enrichedByKey],
  );
  const enrichedGlobal = useMemo(
    () =>
      sortByRating(
        globalResults
          .map((r) => enrichedByKey.get(`${r.osm_type}:${r.osm_id}`))
          .filter((e): e is EnrichedResult => !!e),
      ),
    [globalResults, enrichedByKey],
  );

  useSidebarPresence();

  // Search is the loudest "focus mode" the app has — the user typed a
  // query expecting an answer, so kill EVERY Mapky data layer until
  // they leave /search. Orange-dot search markers and any pinned
  // collection overlays still render (they're not in the dimmable
  // set), so the user keeps the context they actually asked for.
  // (null focus = no exception, hide everything.)
  useAutoFocusLayer(null, { hide: true });

  // ONE batched Nominatim lookup for every OSM ref the visible
  // result rows will look up (tag-mode places + every post's anchor
  // place). Pre-seeds the per-id cache so each row's useOsmLookup
  // resolves synchronously instead of firing its own /lookup.
  const tagLookupRefs = useMemo(() => {
    if (mode !== "tags" || !tagResults) return [];
    const seen = new Set<string>();
    const refs: Array<{ osmType: string; osmId: number }> = [];
    const add = (osmType: string, osmId: number) => {
      const k = `${osmType}:${osmId}`;
      if (seen.has(k)) return;
      seen.add(k);
      refs.push({ osmType, osmId });
    };
    for (const p of tagResults.places ?? []) add(p.osm_type, p.osm_id);
    for (const review of tagResults.reviews ?? []) {
      const parsed = parseOsmCanonical(review.osm_canonical);
      if (parsed) add(parsed.osmType, parsed.osmId);
    }
    return refs;
  }, [mode, tagResults]);
  const { byKey: tagBatchByKey } = useOsmLookupBatch(tagLookupRefs);

  // Build EnrichedResult-shaped rows for tag-mode places so they can
  // share the same map overlay + sectioned list UI as places-mode.
  // Names come from the batched Nominatim cache; the indexer's
  // PlaceDetails (rating, counts) drops in directly as `place`.
  const tagEnrichedAll = useMemo<EnrichedResult[]>(() => {
    if (mode !== "tags" || !tagResults?.places) return [];
    return tagResults.places.map((p) => {
      const nom = tagBatchByKey.get(`${p.osm_type}:${p.osm_id}`) ?? null;
      const name = resolvePlaceName(p.osm_type, p.osm_id, nom);
      return {
        result: {
          osm_type: p.osm_type,
          osm_id: p.osm_id,
          name,
          display_name: nom?.display_name ?? "",
          type: nom?.type ?? "",
          category: nom?.category ?? "",
          lat: p.lat,
          lon: p.lon,
        },
        place: p,
        tags: [],
      };
    });
  }, [mode, tagResults?.places, tagBatchByKey]);

  // Split tag-mode places by current viewport — same nearby/global
  // sectioning the places-mode results use, so the user can scan
  // "what near me matches this tag" before drifting outward.
  const tagEnrichedNearby = useMemo(
    () =>
      sortByRating(
        currentViewbox
          ? tagEnrichedAll.filter(({ result: r }) =>
              inViewbox(r.lat, r.lon, currentViewbox),
            )
          : [],
      ),
    [tagEnrichedAll, currentViewbox],
  );
  const tagEnrichedGlobal = useMemo(() => {
    const seen = new Set(
      tagEnrichedNearby.map(
        (e) => `${e.result.osm_type}:${e.result.osm_id}`,
      ),
    );
    return sortByRating(
      tagEnrichedAll.filter(
        (e) => !seen.has(`${e.result.osm_type}:${e.result.osm_id}`),
      ),
    );
  }, [tagEnrichedAll, tagEnrichedNearby]);

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

  const handleSelectReview = (review: ReviewDetails) => {
    const parsed = parseOsmCanonical(review.osm_canonical);
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

  /**
   * Navigation target for a `:MapkyAppPost` search result. We don't have a
   * standalone post-detail route, so we follow `parent_uri` to the nearest
   * anchored context: the OSM place, the route / collection / capture detail,
   * or the place behind a review parent. When the parent is itself another
   * post, we walk the chain (bounded depth) using whatever posts the
   * tag-search payload already returned — no extra round-trips.
   */
  const handleSelectPost = (post: MapkyPostDetails) => {
    const visited = new Set<string>();
    let current: MapkyPostDetails | undefined = post;
    for (let i = 0; i < 5 && current; i++) {
      const parentUri: string | null = current.parent_uri;
      if (!parentUri) return;

      const osm = parentUri.match(
        /^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/(\d+)\/?$/,
      );
      if (osm) {
        navigate({
          to: "/place/$osmType/$osmId",
          params: { osmType: osm[1], osmId: osm[2] },
          search: {
            from: "search",
            fromSearchQuery: query,
            fromSearchMode: mode,
          },
        });
        return;
      }

      const matched = parentUri.match(
        /^pubky:\/\/([^/]+)\/pub\/mapky\.app\/(reviews|routes|collections|geo_captures|sequences|incidents|posts)\/([^/?#]+)/,
      );
      if (!matched) return;
      const parentAuthor: string = matched[1];
      const parentType: string = matched[2];
      const parentId: string = matched[3];

      if (parentType === "routes") {
        navigate({
          to: "/route/$authorId/$routeId",
          params: { authorId: parentAuthor, routeId: parentId },
        });
        return;
      }
      if (parentType === "collections") {
        handleSelectCollection(parentAuthor, parentId);
        return;
      }
      if (parentType === "geo_captures") {
        navigate({
          to: "/capture/$authorId/$captureId",
          params: { authorId: parentAuthor, captureId: parentId },
        });
        return;
      }
      if (parentType === "reviews") {
        const reviewCompound = `${parentAuthor}:${parentId}`;
        const review = tagResults?.reviews?.find(
          (r) =>
            r.id === reviewCompound ||
            (r.author_id === parentAuthor && r.id === parentId),
        );
        if (review) handleSelectReview(review);
        return;
      }
      if (parentType === "posts") {
        // Walk up: find the parent post in this same tag-search payload and
        // re-resolve from it. Stop if we've already seen this id (cycle) or
        // the parent isn't in the payload (would need a network fetch).
        const key = `${parentAuthor}:${parentId}`;
        if (visited.has(key)) return;
        visited.add(key);
        current = tagResults?.posts?.find(
          (p) =>
            p.id === parentId &&
            (p.author_id === parentAuthor || p.id === key),
        );
        continue;
      }
      // sequences / incidents — no detail route yet.
      return;
    }
  };

  const resultCount =
    mode === "places"
      ? allPlaceResults.length
      : (tagResults?.places?.length ?? 0) +
        (tagResults?.collections?.length ?? 0) +
        (tagResults?.reviews?.length ?? 0) +
        (tagResults?.posts?.length ?? 0) +
        (tagResults?.routes?.length ?? 0) +
        (tagResults?.geo_captures?.length ?? 0) +
        (tagResults?.sequences?.length ?? 0) +
        (tagResults?.incidents?.length ?? 0);

  const handleSelectRoute = (route: RouteDetails) => {
    const idx = route.id.indexOf(":");
    const routeId = idx >= 0 ? route.id.slice(idx + 1) : route.id;
    navigate({
      to: "/route/$authorId/$routeId",
      params: { authorId: route.author_id, routeId },
    });
  };

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

      {/* Places mode — nearby section, sorted by rating. */}
      {mode === "places" && enrichedNearby.length > 0 && (
        <div>
          <div className="mb-1 flex items-center gap-2 px-2">
            <div className="h-2 w-2 rounded-full bg-amber-500" />
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted">
              In this area ({enrichedNearby.length})
            </span>
          </div>
          <PlaceResultList rows={enrichedNearby} onSelect={handleSelectPlace} />
        </div>
      )}

      {/* Places mode — global section, also sorted by rating. */}
      {mode === "places" && enrichedGlobal.length > 0 && (
        <div className={enrichedNearby.length > 0 ? "mt-2 border-t border-border pt-2" : ""}>
          <div className="mb-1 px-2">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted">
              Other results ({enrichedGlobal.length})
            </span>
          </div>
          <PlaceResultList rows={enrichedGlobal} onSelect={handleSelectPlace} />
        </div>
      )}

      {/* Tags mode — places sectioned by viewport (matches places-mode
          structure), then collections / posts / routes underneath. */}
      {mode === "tags" && tagResults && (
        <div className="space-y-3">
          {tagEnrichedNearby.length > 0 && (
            <div>
              <div className="mb-1 flex items-center gap-2 px-2">
                <div className="h-2 w-2 rounded-full bg-amber-500" />
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted">
                  In this area ({tagEnrichedNearby.length})
                </span>
              </div>
              {tagEnrichedNearby.map(({ place }) =>
                place ? (
                  <TagPlaceResult
                    key={`${place.osm_type}-${place.osm_id}`}
                    place={place}
                    onSelect={() => handleSelectTagPlace(place)}
                  />
                ) : null,
              )}
            </div>
          )}
          {tagEnrichedGlobal.length > 0 && (
            <div
              className={
                tagEnrichedNearby.length > 0
                  ? "border-t border-border pt-2"
                  : ""
              }
            >
              <div className="mb-1 px-2">
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted">
                  Other places ({tagEnrichedGlobal.length})
                </span>
              </div>
              {tagEnrichedGlobal.map(({ place }) =>
                place ? (
                  <TagPlaceResult
                    key={`${place.osm_type}-${place.osm_id}`}
                    place={place}
                    onSelect={() => handleSelectTagPlace(place)}
                  />
                ) : null,
              )}
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

          {tagResults.reviews?.length > 0 && (
            <div>
              <div className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                Reviews
              </div>
              {tagResults.reviews.map((review) => (
                <button
                  key={`${review.author_id}-${review.id}`}
                  onClick={() => handleSelectReview(review)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-surface"
                >
                  <MessageSquare className="h-4 w-4 flex-shrink-0 text-accent" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">
                      {review.content
                        ? review.content.slice(0, 80) +
                          (review.content.length > 80 ? "..." : "")
                        : "Review"}
                    </p>
                    <p className="text-xs text-muted">
                      {`${(review.rating / 2).toFixed(1)} stars · `}
                      <OsmPlaceName osmCanonical={review.osm_canonical} />
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {tagResults.routes?.length > 0 && (
            <div>
              <div className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                Routes
              </div>
              {tagResults.routes.map((route) => (
                <button
                  key={route.id}
                  onClick={() => handleSelectRoute(route)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-surface"
                >
                  <RouteIcon className="h-4 w-4 flex-shrink-0 text-accent" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {route.name || "Untitled route"}
                    </p>
                    <p className="text-xs uppercase text-muted">
                      {route.activity}
                    </p>
                  </div>
                </button>
              ))}
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
                        : "Post"}
                    </p>
                    <p className="text-xs text-muted">{post.kind}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {tagResults.geo_captures?.length > 0 && (
            <div>
              <div className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                Captures
              </div>
              {tagResults.geo_captures.map((c) => {
                const compoundId = c.id.includes(":") ? c.id : `${c.author_id}:${c.id}`;
                const [authorId, captureId] = compoundId.split(":");
                return (
                  <button
                    key={compoundId}
                    onClick={() =>
                      navigate({
                        to: "/capture/$authorId/$captureId",
                        params: { authorId, captureId },
                      })
                    }
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-surface"
                  >
                    <Camera className="h-4 w-4 flex-shrink-0 text-accent" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {c.caption || "Untitled capture"}
                      </p>
                      <p className="text-xs uppercase text-muted">{c.kind}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {tagResults.sequences?.length > 0 && (
            <div>
              <div className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                Sequences
              </div>
              {tagResults.sequences.map((s) => (
                <div
                  key={s.id}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-surface"
                >
                  <Layers className="h-4 w-4 flex-shrink-0 text-accent" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {s.name || "Untitled sequence"}
                    </p>
                    <p className="text-xs text-muted">
                      {s.capture_count} captures
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tagResults.incidents?.length > 0 && (
            <div>
              <div className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                Incidents
              </div>
              {tagResults.incidents.map((i) => (
                <div
                  key={i.id}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-surface"
                >
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-500" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {i.description || i.incident_type}
                    </p>
                    <p className="text-xs uppercase text-muted">
                      {i.incident_type} · {i.severity}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Map overlay — show ALL accumulated results so markers persist
          across pans. Pass enriched rows so the overlay can render
          rating + Bitcoin signals. Tag mode now also surfaces every
          place that matched the tag, sorted nearby-first. */}
      {(mode === "places" ? enrichedAll : tagEnrichedAll).length > 0 && (
        <SearchResultsOverlay
          results={mode === "places" ? enrichedAll : tagEnrichedAll}
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

      {/* Mobile: shared draggable bottom sheet (3 snap positions) */}
      <MobileBottomSheet
        defaultSnap="middle"
        header={
          <div className="px-4 pb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
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
                  <p className="mt-1 truncate text-sm text-muted">
                    Results for &ldquo;
                    <span className="text-foreground">{query}</span>&rdquo;
                  </p>
                )}
              </div>
              <button
                onClick={close}
                className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        }
      >
        <div className="border-t border-border px-4 py-3">
          {resultsContent}
        </div>
      </MobileBottomSheet>
    </>
  );
}

/** Reusable place result list for nearby/global sections */
function PlaceResultList({
  rows,
  onSelect,
}: {
  rows: EnrichedResult[];
  onSelect: (result: NominatimSearchResult) => void;
}) {
  return (
    <div className="space-y-0.5">
      {rows.map(({ result, place, tags }) => {
        const typeLabel = result.type?.replace(/_/g, " ") || "";
        const categoryLabel = result.category?.replace(/_/g, " ") || "";
        const badge =
          typeLabel === "yes" || typeLabel === "unclassified"
            ? categoryLabel
            : typeLabel;
        const stars = placeStarsLabel(place);
        const topTags = tags.slice(0, 2);

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
                {stars && (
                  <span className="flex-shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                    {stars}
                  </span>
                )}
              </div>
              <p className="text-xs leading-relaxed text-muted">
                {result.display_name}
              </p>
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
                  {tags.length > topTags.length && (
                    <span className="text-[10px] text-muted">
                      +{tags.length - topTags.length}
                    </span>
                  )}
                </div>
              )}
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
  const name = parsed
    ? resolvePlaceName(parsed.osmType, parsed.osmId, nominatim)
    : osmCanonical;
  return <>{name}</>;
}

function TagPlaceResult({
  place,
  onSelect,
}: {
  place: PlaceDetails;
  onSelect: () => void;
}) {
  const { data: nominatim } = useOsmLookup(place.osm_type, place.osm_id, true);
  const name = resolvePlaceName(place.osm_type, place.osm_id, nominatim);
  const typeLabel = nominatim?.type?.replace(/_/g, " ") ?? "";
  const stars = placeStarsLabel(place);

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
          {stars && (
            <span className="flex-shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
              {stars}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          {place.tag_count > 0 && <span>{place.tag_count} tags</span>}
          {place.review_count > 0 && (
            <span>
              {place.review_count} review{place.review_count === 1 ? "" : "s"}
            </span>
          )}
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
