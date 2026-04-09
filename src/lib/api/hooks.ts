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
  searchByTag,
} from "./mapky";
import { fetchUserProfile } from "./user";
import { reverseGeocode, searchPlaces, searchPlacesBounded, lookupOsmElement } from "./nominatim";
import type { NominatimSearchResult } from "./nominatim";
import type { ViewportBounds } from "@/types/mapky";

export function useViewportPlaces(bounds: ViewportBounds | null) {
  return useQuery({
    queryKey: ["mapky", "viewport", bounds],
    queryFn: () => fetchViewportPlaces(bounds!),
    enabled: !!bounds,
    staleTime: 30_000,
  });
}

export function usePlaceDetail(osmType: string, osmId: number) {
  return useQuery({
    queryKey: ["mapky", "place", osmType, osmId],
    queryFn: () => fetchPlaceDetail(osmType, osmId),
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
  });
}

export function usePlaceTags(osmType: string, osmId: number) {
  return useQuery({
    queryKey: ["mapky", "place", osmType, osmId, "tags"],
    queryFn: () => fetchPlaceTags(osmType, osmId),
    enabled: !!osmType && !!osmId,
  });
}

export function usePostTags(authorId: string, postId: string) {
  return useQuery({
    queryKey: ["mapky", "posts", authorId, postId, "tags"],
    queryFn: () => fetchPostTags(authorId, postId),
    enabled: !!authorId && !!postId,
  });
}

export function useUserProfile(userId: string | null) {
  return useQuery({
    queryKey: ["user", "profile", userId],
    queryFn: () => fetchUserProfile(userId!),
    enabled: !!userId,
    staleTime: 5 * 60_000,
  });
}

export function useNominatimReverse(lat: number | null, lon: number | null) {
  return useQuery({
    queryKey: ["nominatim", "reverse", lat, lon],
    queryFn: () => reverseGeocode(lat!, lon!),
    enabled: lat != null && lon != null,
    staleTime: 60 * 60_000,
    gcTime: Infinity,
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
  });
}

export function useCollection(authorId: string, collectionId: string) {
  return useQuery({
    queryKey: ["mapky", "collection", authorId, collectionId],
    queryFn: () => fetchCollection(authorId, collectionId),
    enabled: !!authorId && !!collectionId,
  });
}

export function useUserCollections(userId: string | null) {
  return useQuery({
    queryKey: ["mapky", "collections", "user", userId],
    queryFn: () => fetchUserCollections(userId!),
    enabled: !!userId,
  });
}

export function useCollectionTags(authorId: string, collectionId: string) {
  return useQuery({
    queryKey: ["mapky", "collection", authorId, collectionId, "tags"],
    queryFn: () => fetchCollectionTags(authorId, collectionId),
    enabled: !!authorId && !!collectionId,
  });
}

export function useCollectionsForPlace(osmType: string, osmId: number) {
  return useQuery({
    queryKey: ["mapky", "collections", "place", osmType, osmId],
    queryFn: () => fetchCollectionsForPlace(osmType, osmId),
    enabled: !!osmType && !!osmId,
  });
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
