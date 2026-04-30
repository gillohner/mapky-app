import { useMemo } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { fetchPlaceDetail, fetchPlaceTags } from "@/lib/api/mapky";
import type { NominatimSearchResult } from "@/lib/api/nominatim";
import type { PlaceDetails, PostTagDetails } from "@/types/mapky";

export interface EnrichedResult {
  result: NominatimSearchResult;
  /** Mapky-indexed place metadata, when this OSM ref has one. */
  place: PlaceDetails | null;
  tags: PostTagDetails[];
}

/**
 * Decorate a list of Nominatim search results with the indexer's
 * `PlaceDetails` (rating + review/tag/photo counts) and per-place tag
 * labels.
 *
 * Avoids N+1 by reading the `useViewportPlaces` TanStack cache first
 * — those entries already carry rating data, so most "in this area"
 * results need zero extra fetches. The remainder fall through to
 * batched `usePlaceDetail` (same cache key as the detail page, so
 * opening a row reuses the fetch).
 *
 * Tag fetches are gated on `tag_count > 0` to avoid pinging the
 * indexer for places that the user hasn't tagged yet.
 */
export function useEnrichedSearchResults(
  results: NominatimSearchResult[],
): EnrichedResult[] {
  const qc = useQueryClient();

  // Pull every cached PlaceDetails out of every viewport-places query
  // and index it by `osm_type:osm_id`. Cheap — these are already in
  // memory; no fetch.
  const cachedByOsm = useMemo(() => {
    const map = new Map<string, PlaceDetails>();
    for (const q of qc
      .getQueryCache()
      .findAll({ queryKey: ["mapky", "viewport"] })) {
      const data = q.state.data as PlaceDetails[] | undefined;
      if (!data) continue;
      for (const p of data) map.set(`${p.osm_type}:${p.osm_id}`, p);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results]);

  // Step 2: useQueries for places NOT in the viewport cache. The
  // `enabled` flag short-circuits the cached entries.
  const placeQueries = useQueries({
    queries: results.map((r) => {
      const cached = cachedByOsm.get(`${r.osm_type}:${r.osm_id}`);
      return {
        queryKey: ["mapky", "place", r.osm_type, r.osm_id] as const,
        queryFn: () => fetchPlaceDetail(r.osm_type, r.osm_id),
        enabled: !cached,
        staleTime: 60_000,
        retry: false,
      };
    }),
  });

  // Step 3: tags batch — only when the place has any.
  const tagQueries = useQueries({
    queries: results.map((r, i) => {
      const place =
        cachedByOsm.get(`${r.osm_type}:${r.osm_id}`) ??
        placeQueries[i].data;
      return {
        queryKey: ["mapky", "place", r.osm_type, r.osm_id, "tags"] as const,
        queryFn: () => fetchPlaceTags(r.osm_type, r.osm_id),
        enabled: !!place && place.tag_count > 0,
        staleTime: 60_000,
        retry: false,
      };
    }),
  });

  return useMemo(
    () =>
      results.map((r, i) => ({
        result: r,
        place:
          cachedByOsm.get(`${r.osm_type}:${r.osm_id}`) ??
          placeQueries[i].data ??
          null,
        tags: tagQueries[i].data ?? [],
      })),
    // dataUpdatedAt joins keep the dep stable until any query
    // actually delivers fresh data — same trick PlaceList uses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      results,
      cachedByOsm,
      placeQueries.map((q) => q.dataUpdatedAt).join(","),
      tagQueries.map((q) => q.dataUpdatedAt).join(","),
    ],
  );
}

/**
 * Rated places first, ranked by `avg × log10(reviews+1) × 0.1 + avg`
 * so a single 5★ doesn't beat a 4.8★ with 50 reviews. Unrated rows
 * keep their original Nominatim order at the end.
 */
export function sortByRating(rows: EnrichedResult[]): EnrichedResult[] {
  const score = (e: EnrichedResult): number =>
    e.place && e.place.review_count > 0
      ? e.place.avg_rating *
        (1 + Math.log10(e.place.review_count + 1) * 0.1)
      : 0;
  const rated: EnrichedResult[] = [];
  const unrated: EnrichedResult[] = [];
  for (const r of rows) (score(r) > 0 ? rated : unrated).push(r);
  rated.sort((a, b) => score(b) - score(a));
  return [...rated, ...unrated];
}

/** Star rating (out of 5) for a place, or null if no reviews. */
export function placeStars(place: PlaceDetails | null): number | null {
  if (!place || place.review_count === 0) return null;
  return place.avg_rating / 2;
}

/** Compact `${star}★` string used by the small badges. */
export function placeStarsLabel(place: PlaceDetails | null): string | null {
  const s = placeStars(place);
  return s == null ? null : `${s.toFixed(1)}★`;
}
