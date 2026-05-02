import {
  useQueries,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import {
  fetchViewportPlaces,
  fetchPlaceDetail,
  fetchPlacePosts,
  fetchPlaceTags,
  fetchPostTags,
  fetchCollection,
  fetchUserCollections,
  fetchViewportCollections,
  fetchCollectionsForPlace,
  fetchCollectionTags,
  fetchUserPosts,
  fetchViewportCaptures,
  fetchGeoCaptureDetail,
  fetchGeoCaptureTags,
  fetchSequenceCaptures,
  fetchUserGeoCaptures,
  fetchViewportRoutes,
  fetchRouteDetails,
  fetchUserRoutes,
  fetchRouteTags,
  fetchPlaceRoutes,
  searchByTag,
} from "./mapky";
import { fetchUserProfile } from "./user";
import { ingestUserIntoNexus } from "@/lib/nexus/ingest";
import {
  reverseGeocode,
  searchPlaces,
  searchPlacesBounded,
  lookupOsmElement,
  lookupOsmElements,
} from "./nominatim";
import { readRouteBody } from "@/lib/pubky/storage";
import type {
  NominatimResult,
  NominatimSearchResult,
} from "./nominatim";
import type {
  GeoCaptureDetails,
  RouteFull,
  RouteFullJson,
  ViewportBounds,
} from "@/types/mapky";
import { parseSequenceUri } from "@/lib/map/sequence-uri";

export function useViewportPlaces(bounds: ViewportBounds | null) {
  return useQuery({
    queryKey: ["mapky", "viewport", bounds],
    queryFn: () => fetchViewportPlaces(bounds!),
    enabled: !!bounds,
    staleTime: 30_000,
    // Hold the previous bbox's results on screen while a new fetch is
    // in flight. Without this, every map pan flashes the markers off
    // for the round-trip duration — every cross-bbox query gets a
    // fresh undefined `data` value because the queryKey changed.
    placeholderData: keepPreviousData,
  });
}

/**
 * Don't retry on 404 — for Mapky place endpoints, 404 means "this OSM
 * place hasn't been indexed yet" (no reviews/tags/posts), not "the place
 * is invalid". Retrying 3 times wastes bandwidth and floods the console.
 * Other errors (5xx, network) still get the default retry behavior.
 *
 * Typed as `(n, Error)` so TanStack Query keeps inferring TError as Error
 * rather than widening it to unknown when this is passed as `retry`.
 */
const noRetryOn404 = (failureCount: number, err: Error): boolean => {
  const status = (err as Error & { response?: { status?: number } })?.response
    ?.status;
  if (status === 404) return false;
  return failureCount < 3;
};

export function usePlaceDetail(osmType: string, osmId: number) {
  return useQuery({
    queryKey: ["mapky", "place", osmType, osmId],
    queryFn: () => fetchPlaceDetail(osmType, osmId),
    enabled: !!osmType && !!osmId,
    retry: noRetryOn404,
  });
}

export function usePlacePosts(
  osmType: string,
  osmId: number,
  options?: { reviewsOnly?: boolean },
) {
  return useQuery({
    queryKey: ["mapky", "place", osmType, osmId, "posts", options],
    queryFn: () => fetchPlacePosts(osmType, osmId, options),
    retry: noRetryOn404,
  });
}

export function usePlaceTags(osmType: string, osmId: number) {
  return useQuery({
    queryKey: ["mapky", "place", osmType, osmId, "tags"],
    queryFn: () => fetchPlaceTags(osmType, osmId),
    enabled: !!osmType && !!osmId,
    retry: noRetryOn404,
  });
}

export function usePostTags(authorId: string, postId: string) {
  return useQuery({
    queryKey: ["mapky", "posts", authorId, postId, "tags"],
    queryFn: () => fetchPostTags(authorId, postId),
    enabled: !!authorId && !!postId,
    retry: noRetryOn404,
  });
}

// Track which users we've already asked nexus to ingest in this session
// — `ingestUserIntoNexus` is fire-and-forget but spamming `/v0/ingest`
// for the same id on every retry round is wasteful (and slows the
// homeserver fetch the indexer is trying to do).
const ingestRequested = new Set<string>();

export function useUserProfile(userId: string | null) {
  return useQuery({
    queryKey: ["user", "profile", userId],
    queryFn: () => fetchUserProfile(userId!),
    enabled: !!userId,
    staleTime: 5 * 60_000,
    // 404 means nexus has never seen this user. Two cases:
    //   1. Just-logged-in current user: their `ingestUserIntoNexus`
    //      call from `login.tsx` is in flight and the indexer hasn't
    //      written the User node yet — wait a few hundred ms.
    //   2. Author of a post we're viewing who never logged into this
    //      frontend: nexus has nothing to index unless we ask it to.
    //      Trigger `/v0/ingest/{id}` once per session, then retry.
    // Cap at 3 attempts to bound noise on truly missing users.
    retry: (failureCount, err) => {
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      if (status !== 404 || failureCount >= 3) return false;
      if (userId && !ingestRequested.has(userId)) {
        ingestRequested.add(userId);
        // Fire-and-forget — `ingestUserIntoNexus` already polls until
        // queryable. Our retry will pick up whatever's there next.
        void ingestUserIntoNexus(userId).catch(() => {
          // Drop from the set so a transient ingest failure doesn't
          // permanently lock this user out of being re-tried later.
          ingestRequested.delete(userId);
        });
      }
      return true;
    },
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
  });
}

export function useNominatimReverse(lat: number | null, lon: number | null) {
  return useQuery({
    queryKey: ["nominatim", "reverse", lat, lon],
    queryFn: () => reverseGeocode(lat!, lon!),
    enabled: lat != null && lon != null,
    staleTime: 60 * 60_000,
    gcTime: Infinity,
    // Nominatim is fair-use rate-limited and 404s are common. Don't
    // hammer it on failure — a single attempt plus a quick fallback in
    // the UI is much better UX than a 30-second skeleton.
    retry: noRetryOn404,
  });
}

export function useOsmLookup(
  osmType: string,
  osmId: number,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["nominatim", "lookup", osmType, osmId],
    queryFn: () => lookupOsmElement(osmType, osmId),
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
    // Nominatim is rate-limited (429) and returns 404 for unindexed
    // elements. Either way, retrying spams the console without changing
    // the outcome — the UI has its own fallback (osm_canonical) for the
    // miss, so a single attempt is enough.
    retry: false,
  });
}

/**
 * Batched Nominatim lookup for a viewport-sized list of OSM refs.
 * Runs ONE network request per 50 IDs (Nominatim's per-call cap)
 * instead of fanning out 30+ parallel `/lookup` calls that would
 * trip the public instance's rate limiter and stall the sidebar.
 *
 * Side-effect: every successful row is also written into the
 * per-id TanStack cache under `["nominatim", "lookup", type, id]`,
 * so any `useOsmLookup(type, id, true)` call inside a row component
 * resolves synchronously from the cache instead of firing its own
 * request. Net effect: PlaceList opens with one Nominatim round-trip
 * regardless of how many places are visible.
 *
 * Memoizes the refs array against type/id stringification so passing
 * a fresh array each render doesn't churn the query key.
 */
export function useOsmLookupBatch(
  refs: Array<{ osmType: string; osmId: number }>,
  enabled = true,
) {
  const qc = useQueryClient();
  const stableKey = useMemo(
    () =>
      refs
        .map((r) => `${r.osmType}:${r.osmId}`)
        .sort()
        .join(","),
    [refs],
  );

  const query = useQuery({
    queryKey: ["nominatim", "lookup-batch", stableKey],
    queryFn: () => lookupOsmElements(refs),
    enabled: enabled && refs.length > 0,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });

  // Index results by `osm_type:osm_id` (the result's own values, not
  // the request order) so consumers can look them up by key. The
  // sorted `stableKey` lets two reorderings of the same refs share a
  // cache entry, which means `query.data` is in the order the QUERY
  // was first fetched in — not necessarily the current `refs` order.
  // Indexing by key sidesteps that mismatch entirely.
  const byKey = useMemo(() => {
    const m = new Map<string, NominatimResult>();
    if (!query.data) return m;
    for (const r of query.data) {
      if (r.osm_type && r.osm_id != null) {
        m.set(`${r.osm_type}:${r.osm_id}`, r);
      }
    }
    return m;
  }, [query.data]);

  // Seed the per-id cache so per-row useOsmLookup hits are instant.
  // Uses the result's own osm_type/osm_id (not refs[i]) so a reorder
  // between fetch and seed doesn't cross-write a stale entry.
  useEffect(() => {
    if (!query.data) return;
    for (const r of query.data) {
      if (r.osm_type && r.osm_id != null) {
        qc.setQueryData(["nominatim", "lookup", r.osm_type, r.osm_id], r);
      }
    }
  }, [qc, query.data]);

  return { ...query, byKey };
}

export function useCollection(authorId: string, collectionId: string) {
  return useQuery({
    queryKey: ["mapky", "collection", authorId, collectionId],
    queryFn: () => fetchCollection(authorId, collectionId),
    enabled: !!authorId && !!collectionId,
    retry: noRetryOn404,
  });
}

export function useUserCollections(userId: string | null) {
  return useQuery({
    queryKey: ["mapky", "collections", "user", userId],
    queryFn: () => fetchUserCollections(userId!),
    enabled: !!userId,
  });
}

export function useViewportCollections(bounds: ViewportBounds | null) {
  return useQuery({
    queryKey: ["mapky", "collections", "viewport", bounds],
    queryFn: () => fetchViewportCollections(bounds!),
    enabled: !!bounds,
    staleTime: 30_000,
  });
}

export function useUserPosts(userId: string | null) {
  return useQuery({
    queryKey: ["mapky", "posts", "user", userId],
    queryFn: () => fetchUserPosts(userId!),
    enabled: !!userId,
  });
}

export function useCollectionTags(authorId: string, collectionId: string) {
  return useQuery({
    queryKey: ["mapky", "collection", authorId, collectionId, "tags"],
    queryFn: () => fetchCollectionTags(authorId, collectionId),
    enabled: !!authorId && !!collectionId,
    retry: noRetryOn404,
  });
}

export function useCollectionsForPlace(osmType: string, osmId: number) {
  return useQuery({
    queryKey: ["mapky", "collections", "place", osmType, osmId],
    queryFn: () => fetchCollectionsForPlace(osmType, osmId),
    enabled: !!osmType && !!osmId,
    retry: noRetryOn404,
  });
}

export function useViewportCaptures(bounds: ViewportBounds | null) {
  return useQuery({
    queryKey: ["mapky", "geo_captures", "viewport", bounds],
    queryFn: () => fetchViewportCaptures(bounds!),
    enabled: !!bounds,
    staleTime: 30_000,
  });
}

export function useGeoCaptureDetail(authorId: string, captureId: string) {
  return useQuery({
    queryKey: ["mapky", "geo_capture", authorId, captureId],
    queryFn: () => fetchGeoCaptureDetail(authorId, captureId),
    enabled: !!authorId && !!captureId,
    retry: noRetryOn404,
  });
}

export function useGeoCaptureTags(authorId: string, captureId: string) {
  return useQuery({
    queryKey: ["mapky", "geo_capture", authorId, captureId, "tags"],
    queryFn: () => fetchGeoCaptureTags(authorId, captureId),
    enabled: !!authorId && !!captureId,
    retry: noRetryOn404,
  });
}

export function useSequenceCaptures(
  authorId: string | null,
  sequenceId: string | null,
) {
  return useQuery({
    queryKey: ["mapky", "sequence", authorId, sequenceId, "captures"],
    queryFn: () => fetchSequenceCaptures(authorId!, sequenceId!),
    enabled: !!authorId && !!sequenceId,
  });
}

/**
 * For every sequence URI surfaced in the viewport, fetch ALL of that
 * sequence's captures and return the merged set. Lets the capture
 * layers draw the full polyline + every dot a sequence touches even
 * when most of its members sit outside the current bbox.
 *
 * Each per-sequence fetch is a TanStack query keyed on the same
 * `["mapky", "sequence", author, id, "captures"]` tuple
 * `useSequenceCaptures` uses, so opening a capture detail panel after
 * passing through the viewport is a free cache hit (and vice-versa).
 *
 * Returns: `{ extras }` — the captures from the fetched sequences
 * MINUS whatever is already in `viewport`, ready to be unioned.
 */
export function useSequenceMembersFanOut(
  viewport: GeoCaptureDetails[] | undefined,
): { extras: GeoCaptureDetails[] } {
  const seqRefs = useMemo(() => {
    if (!viewport) return [];
    const seen = new Set<string>();
    const out: Array<{ authorId: string; sequenceId: string }> = [];
    for (const c of viewport) {
      const ref = parseSequenceUri(c.sequence_uri ?? null);
      if (!ref) continue;
      const k = `${ref.authorId}:${ref.sequenceId}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(ref);
    }
    return out;
  }, [viewport]);

  const queries = useQueries({
    queries: seqRefs.map((ref) => ({
      queryKey: [
        "mapky",
        "sequence",
        ref.authorId,
        ref.sequenceId,
        "captures",
      ] as const,
      queryFn: () => fetchSequenceCaptures(ref.authorId, ref.sequenceId),
      // Sequence membership is stable enough that a 5-min stale window
      // covers a typical browse session without going stale on long
      // walks through the same author's captures.
      staleTime: 5 * 60_000,
      retry: false,
    })),
  });

  const extras = useMemo(() => {
    const seen = new Set<string>();
    for (const c of viewport ?? []) seen.add(c.id);
    const out: GeoCaptureDetails[] = [];
    for (const q of queries) {
      const data = q.data;
      if (!data) continue;
      for (const c of data) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        out.push(c);
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport, queries.map((q) => q.dataUpdatedAt).join(",")]);

  return { extras };
}

export function useUserGeoCaptures(userId: string | null) {
  return useQuery({
    queryKey: ["mapky", "geo_captures", "user", userId],
    queryFn: () => fetchUserGeoCaptures(userId!),
    enabled: !!userId,
  });
}

export function useViewportRoutes(bounds: ViewportBounds | null) {
  return useQuery({
    queryKey: ["mapky", "routes", "viewport", bounds],
    queryFn: () => fetchViewportRoutes(bounds!),
    enabled: !!bounds,
    staleTime: 30_000,
  });
}

export function useUserRoutes(userId: string | null) {
  return useQuery({
    queryKey: ["mapky", "routes", "user", userId],
    queryFn: () => fetchUserRoutes(userId!),
    enabled: !!userId,
  });
}

export function useRouteDetails(authorId: string, routeId: string) {
  return useQuery({
    queryKey: ["mapky", "route", authorId, routeId],
    queryFn: () => fetchRouteDetails(authorId, routeId),
    enabled: !!authorId && !!routeId,
    retry: noRetryOn404,
  });
}

export function useRouteTags(authorId: string, routeId: string) {
  return useQuery({
    queryKey: ["mapky", "route", authorId, routeId, "tags"],
    queryFn: () => fetchRouteTags(authorId, routeId),
    enabled: !!authorId && !!routeId,
    retry: noRetryOn404,
  });
}

export function usePlaceRoutes(osmType: string, osmId: number) {
  return useQuery({
    queryKey: ["mapky", "place", osmType, osmId, "routes"],
    queryFn: () => fetchPlaceRoutes(osmType, osmId),
    enabled: !!osmType && !!osmId,
    retry: noRetryOn404,
    staleTime: 60_000,
  });
}

/**
 * Fetch a route's full body (waypoints + geometry + steps) from the
 * homeserver. Indexer only returns metadata, so the viewer/edit flows
 * need this for the snapped polyline.
 */
export function useRouteBody(authorId: string, routeId: string) {
  return useQuery({
    queryKey: ["mapky", "route-body", authorId, routeId],
    queryFn: () => readRouteBody<RouteFullJson>(authorId, routeId),
    enabled: !!authorId && !!routeId,
    staleTime: 5 * 60_000,
  });
}

/**
 * Combined hook: indexer metadata + homeserver body. Returned when the UI
 * needs both (the detail viewer, the edit flow). Reports loading until both
 * sides resolve.
 */
export function useRoute(
  authorId: string,
  routeId: string,
): {
  data: RouteFull | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const meta = useRouteDetails(authorId, routeId);
  const body = useRouteBody(authorId, routeId);
  const isLoading = meta.isLoading || body.isLoading;
  const error = (meta.error ?? body.error ?? null) as Error | null;
  const data: RouteFull | undefined =
    meta.data && body.data ? { ...meta.data, body: body.data } : undefined;
  return { data, isLoading, error };
}

export function useTagSearch(query: string) {
  return useQuery({
    queryKey: ["mapky", "search", "tags", query],
    queryFn: () => searchByTag(query),
    enabled: query.length >= 2,
    staleTime: 5 * 60_000,
  });
}

export function useNominatimSearch(query: string) {
  return useQuery({
    queryKey: ["nominatim", "search", query],
    queryFn: () => searchPlaces(query),
    enabled: query.length >= 2,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });
}

/**
 * Bounded viewport search — re-fires when the viewbox changes (map move).
 * Only fetches results within the viewport (bounded=1). Single Nominatim request.
 */
export function useBoundedNominatimSearch(
  query: string,
  viewbox: { west: number; north: number; east: number; south: number } | null,
) {
  const vbKey = viewbox
    ? `${viewbox.west.toFixed(2)},${viewbox.north.toFixed(2)},${viewbox.east.toFixed(2)},${viewbox.south.toFixed(2)}`
    : null;
  return useQuery({
    queryKey: ["nominatim", "search-bounded", query, vbKey],
    queryFn: () => searchPlacesBounded(query, viewbox!),
    enabled: query.length >= 2 && viewbox !== null,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    placeholderData: keepPreviousData,
  });
}

type Viewbox = { west: number; north: number; east: number; south: number };

/**
 * Bounded search — wraps useBoundedNominatimSearch with a stable return type.
 */
export function useBoundedSearch(
  query: string,
  viewbox: Viewbox | null,
): { data: NominatimSearchResult[]; isLoading: boolean } {
  const nominatim = useBoundedNominatimSearch(query, viewbox);
  return { data: nominatim.data ?? [], isLoading: nominatim.isLoading };
}
