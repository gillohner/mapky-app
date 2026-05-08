import {
  useQueries,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import {
  fetchViewport,
  fetchViewportAll,
  fetchPlaceDetail,
  fetchPlaceDetailFull,
  fetchPlaceReviews,
  fetchPlacePosts,
  fetchPlaceTags,
  fetchPostTags,
  fetchReviewTags,
  fetchResourceReplies,
  fetchCollection,
  fetchUserCollections,
  fetchViewportCollections,
  fetchCollectionsForPlace,
  fetchCollectionTags,
  fetchUserPosts,
  fetchUserReviews,
  fetchViewportCaptures,
  fetchBtcViewport,
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
  type MapkyResourceType,
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
  MultiViewportResponse,
  PlaceFilters,
  PlaceFullResponse,
  RouteFull,
  RouteFullJson,
  ViewportBounds,
  ViewportResponse,
  ViewportLayer,
} from "@/types/mapky";
import { parseSequenceUri } from "@/lib/map/sequence-uri";

/**
 * Pad a viewport bbox by a fraction of its size, then snap the result
 * to a coarse grid so small pans land in the same query bucket.
 *
 * Padding gives us pre-fetched margin around the viewport (small pans
 * become cache hits via TanStack's query key matching). Snapping
 * trades some over-fetch for fewer unique bboxes — without it, every
 * 1-pixel pan would still produce a fresh queryKey and bypass the
 * 30 s `staleTime` window.
 *
 * Defaults: 30 % padding, snap to ~0.01° (~1 km at the equator,
 * smaller at higher latitudes — fine for typical zoom levels).
 */
function snapBoundsForCache(
  bounds: ViewportBounds | null,
  pad = 0.3,
  snapStep = 0.01,
): ViewportBounds | null {
  if (!bounds) return null;
  const latSpan = bounds.maxLat - bounds.minLat;
  const lonSpan = bounds.maxLon - bounds.minLon;
  if (!Number.isFinite(latSpan) || !Number.isFinite(lonSpan)) return bounds;
  const latPad = latSpan * pad;
  const lonPad = lonSpan * pad;
  const snap = (v: number, dir: 1 | -1) =>
    dir === -1
      ? Math.floor(v / snapStep) * snapStep
      : Math.ceil(v / snapStep) * snapStep;
  return {
    minLat: snap(bounds.minLat - latPad, -1),
    minLon: snap(bounds.minLon - lonPad, -1),
    maxLat: snap(bounds.maxLat + latPad, 1),
    maxLon: snap(bounds.maxLon + lonPad, 1),
  };
}

/** Layers always requested by `useMapViewport`. Sorted alphabetically so
 * the resulting `include` string is identical regardless of how the
 * source array is shaped — identical query string ⇒ identical Redis key
 * server-side and identical TanStack queryKey client-side. */
const MAP_VIEWPORT_LAYERS: readonly ViewportLayer[] = [
  "captures",
  "collections",
  "places",
  "routes",
] as const;

/**
 * Composite map-viewport hook for always-mounted map layers. Hits the
 * plugin's `/v0/mapky/viewport/all` endpoint with all four slices
 * (places + collections + captures + routes) in one request — server
 * runs them in parallel via `tokio::try_join!` so the wall-clock cost
 * is max(t_layers), not sum(t_layers).
 *
 * Use this in components that mount on the map and react to pan/zoom.
 * All such consumers share a single queryKey for the same
 * (bounds, zoom, filters) tuple, so TanStack dedups them into one
 * network round-trip per pan no matter how many layers subscribe.
 *
 * Sidebar lists (PlaceList, CollectionList, …) stay on the per-layer
 * hooks below — they have different lifecycles (only mounted when the
 * user opens the sidebar) and different zoom semantics (PlaceList
 * pins zoom to the cluster threshold to always get individual places).
 */
export function useMapViewport(
  bounds: ViewportBounds | null,
  zoom: number,
  filters: PlaceFilters,
) {
  const padded = useMemo(() => snapBoundsForCache(bounds), [bounds]);
  const snappedZoom = Math.round(zoom);
  return useQuery<MultiViewportResponse>({
    queryKey: [
      "mapky",
      "viewport-all",
      padded,
      snappedZoom,
      filters,
    ] as const,
    queryFn: () =>
      fetchViewportAll(padded!, snappedZoom, filters, MAP_VIEWPORT_LAYERS),
    enabled: !!padded,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

/**
 * Zoom-aware viewport hook. Returns either cluster bubbles or
 * individual places via a discriminated envelope; the rendering
 * layer switches on `data.kind`.
 *
 * Snaps zoom to a coarse step (every 2 levels) so a smooth zoom
 * animation doesn't fire one query per zoom delta. The cluster cell
 * size is bucketed in the same direction server-side, so identical
 * zoom snaps map to identical responses.
 */
export function useViewportPlaces(
  bounds: ViewportBounds | null,
  zoom: number,
  filters: PlaceFilters,
) {
  const padded = useMemo(() => snapBoundsForCache(bounds), [bounds]);
  // Snap zoom to the nearest integer — keeps the queryKey stable
  // across small wheel-tick zoom steps within ±0.5, but never drops
  // below the user's visible zoom (which would silently push us into
  // cluster mode at zooms that should already show individual
  // places). Math.round(11.99) → 12, Math.round(11.49) → 11.
  const snappedZoom = Math.round(zoom);
  return useQuery({
    queryKey: ["mapky", "viewport", padded, snappedZoom, filters] as const,
    queryFn: () =>
      fetchViewport(padded!, snappedZoom, filters) as Promise<ViewportResponse>,
    enabled: !!padded,
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

/**
 * Shared queryKey for the composite place-detail (`/place/.../full`).
 * Every `usePlaceFull*` slice hook below produces this exact key for the
 * same `(osmType, osmId)` so TanStack dedups them into a single network
 * request when PlacePanel mounts six sub-components at once.
 *
 * `staleTime: 60s` mitigates the back-navigation refetch noted in
 * BACKLOG.md — a place that was open a moment ago doesn't need a fresh
 * round-trip just because the user tapped Back and then the same row
 * again.
 */
function placeFullKey(osmType: string, osmId: number) {
  return ["mapky", "place-full", osmType, osmId] as const;
}

const PLACE_FULL_STALE_MS = 60_000;

function usePlaceFullSlice<T>(
  osmType: string,
  osmId: number,
  select: (data: PlaceFullResponse) => T,
) {
  return useQuery({
    queryKey: placeFullKey(osmType, osmId),
    queryFn: () => fetchPlaceDetailFull(osmType, osmId),
    enabled: !!osmType && !!osmId,
    staleTime: PLACE_FULL_STALE_MS,
    retry: noRetryOn404,
    select,
  });
}

/** Composite-backed slice hooks — drop-in replacements for the per-endpoint
 * hooks below, intended for PlacePanel sub-components. They share a query
 * key, so all five fire one network request total per place open. */
export function usePlaceFullDetail(osmType: string, osmId: number) {
  return usePlaceFullSlice(osmType, osmId, (d) => d.detail);
}
export function usePlaceFullReviews(osmType: string, osmId: number) {
  return usePlaceFullSlice(osmType, osmId, (d) => d.reviews);
}
export function usePlaceFullPosts(osmType: string, osmId: number) {
  return usePlaceFullSlice(osmType, osmId, (d) => d.posts);
}
export function usePlaceFullTags(osmType: string, osmId: number) {
  return usePlaceFullSlice(osmType, osmId, (d) => d.tags);
}
export function usePlaceFullCollections(osmType: string, osmId: number) {
  return usePlaceFullSlice(osmType, osmId, (d) => d.collections);
}
export function usePlaceFullRoutes(osmType: string, osmId: number) {
  return usePlaceFullSlice(osmType, osmId, (d) => d.routes);
}

export function usePlaceReviews(osmType: string, osmId: number) {
  return useQuery({
    queryKey: ["mapky", "place", osmType, osmId, "reviews"],
    queryFn: () => fetchPlaceReviews(osmType, osmId),
    enabled: !!osmType && !!osmId,
    retry: noRetryOn404,
  });
}

export function usePlacePosts(osmType: string, osmId: number) {
  return useQuery({
    queryKey: ["mapky", "place", osmType, osmId, "posts"],
    queryFn: () => fetchPlacePosts(osmType, osmId),
    enabled: !!osmType && !!osmId,
    retry: noRetryOn404,
  });
}

/** Replies (`:MapkyAppPost`) anchored to any MapKy resource. Mount this on
 * route, collection, geo-capture, sequence, incident, review, or post detail
 * views to render the reply thread. */
export function useResourceReplies(
  resourceType: MapkyResourceType,
  authorId: string | null,
  resourceId: string | null,
) {
  return useQuery({
    queryKey: ["mapky", resourceType, authorId, resourceId, "replies"],
    queryFn: () =>
      fetchResourceReplies(resourceType, authorId!, resourceId!),
    enabled: !!authorId && !!resourceId,
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

export function useReviewTags(authorId: string, reviewId: string) {
  return useQuery({
    queryKey: ["mapky", "reviews", authorId, reviewId, "tags"],
    queryFn: () => fetchReviewTags(authorId, reviewId),
    enabled: !!authorId && !!reviewId,
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
  const padded = useMemo(() => snapBoundsForCache(bounds), [bounds]);
  return useQuery({
    queryKey: ["mapky", "collections", "viewport", padded],
    queryFn: () => fetchViewportCollections(padded!),
    enabled: !!padded,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function useUserPosts(userId: string | null) {
  return useQuery({
    queryKey: ["mapky", "posts", "user", userId],
    queryFn: () => fetchUserPosts(userId!),
    enabled: !!userId,
  });
}

export function useUserReviews(userId: string | null) {
  return useQuery({
    queryKey: ["mapky", "reviews", "user", userId],
    queryFn: () => fetchUserReviews(userId!),
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

/** Bitcoin POI overlay — independent of the place layer. Fed by
 *  `/v0/mapky/btc/viewport`, queried only when the BTC overlay is on
 *  (caller passes `null` bounds when off to short-circuit). */
export function useBtcViewport(bounds: ViewportBounds | null) {
  const padded = useMemo(() => snapBoundsForCache(bounds), [bounds]);
  return useQuery({
    queryKey: ["mapky", "btc", "viewport", padded] as const,
    queryFn: () => fetchBtcViewport(padded!),
    enabled: !!padded,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useViewportCaptures(bounds: ViewportBounds | null) {
  const padded = useMemo(() => snapBoundsForCache(bounds), [bounds]);
  return useQuery({
    queryKey: ["mapky", "geo_captures", "viewport", padded],
    queryFn: () => fetchViewportCaptures(padded!),
    enabled: !!padded,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
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
  const padded = useMemo(() => snapBoundsForCache(bounds), [bounds]);
  return useQuery({
    queryKey: ["mapky", "routes", "viewport", padded],
    queryFn: () => fetchViewportRoutes(padded!),
    enabled: !!padded,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
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

// ── Prefetch helpers (hover-to-prefetch) ────────────────────────────────

/**
 * Prefetch a place's detail + its routes when the user hovers a card.
 * Uses TanStack's `prefetchQuery` so the data lands in cache and the
 * subsequent navigation skips the spinner.
 *
 * Returns handlers safe to wire up via `onMouseEnter`/`onFocus` — both
 * fire `prefetchQuery` only if the entry isn't already fresh.
 *
 * Example:
 * ```tsx
 * const prefetch = usePrefetchPlace(osmType, osmId);
 * <li {...prefetch}>...</li>
 * ```
 */
export function usePrefetchPlace(osmType: string, osmId: number) {
  const qc = useQueryClient();
  const prime = () => {
    if (!osmType || !osmId) return;
    qc.prefetchQuery({
      queryKey: ["mapky", "place", osmType, osmId],
      queryFn: () => fetchPlaceDetail(osmType, osmId),
      staleTime: 60_000,
    });
  };
  return { onMouseEnter: prime, onFocus: prime };
}

/**
 * Prefetch a route's metadata + body on hover. Both round-trips are
 * primed in parallel so opening the detail panel renders instantly.
 */
export function usePrefetchRoute(authorId: string, routeId: string) {
  const qc = useQueryClient();
  const prime = () => {
    if (!authorId || !routeId) return;
    qc.prefetchQuery({
      queryKey: ["mapky", "route", authorId, routeId],
      queryFn: () => fetchRouteDetails(authorId, routeId),
      staleTime: 60_000,
    });
    qc.prefetchQuery({
      queryKey: ["mapky", "route-body", authorId, routeId],
      queryFn: () => readRouteBody<RouteFullJson>(authorId, routeId),
      staleTime: 5 * 60_000,
    });
  };
  return { onMouseEnter: prime, onFocus: prime };
}
