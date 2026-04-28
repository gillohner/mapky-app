import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  fetchViewportPlaces,
  fetchPlaceDetail,
  fetchPlacePosts,
  fetchPlaceTags,
  fetchPostTags,
  fetchCollection,
  fetchUserCollections,
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
import { reverseGeocode, searchPlaces, searchPlacesBounded, lookupOsmElement } from "./nominatim";
import { readRouteBody } from "@/lib/pubky/storage";
import type { NominatimSearchResult } from "./nominatim";
import type { RouteFull, RouteFullJson, ViewportBounds } from "@/types/mapky";

export function useViewportPlaces(bounds: ViewportBounds | null) {
  return useQuery({
    queryKey: ["mapky", "viewport", bounds],
    queryFn: () => fetchViewportPlaces(bounds!),
    enabled: !!bounds,
    staleTime: 30_000,
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

export function useUserProfile(userId: string | null) {
  return useQuery({
    queryKey: ["user", "profile", userId],
    queryFn: () => fetchUserProfile(userId!),
    enabled: !!userId,
    staleTime: 5 * 60_000,
    // Retry transient 404s — right after signup, ingestion can lag the
    // first useUserProfile fire by a few hundred ms. Cap at 3 attempts
    // with quick backoff to bound the noise without hiding real bugs.
    retry: (failureCount, err) => {
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      if (status === 404 && failureCount < 3) return true;
      return false;
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
    retry: noRetryOn404,
  });
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
