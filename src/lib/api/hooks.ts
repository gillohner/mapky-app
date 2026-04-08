import { useQuery } from "@tanstack/react-query";
import {
  fetchViewportPlaces,
  fetchPlaceDetail,
  fetchPlacePosts,
  fetchPlaceTags,
} from "./mapky";
import { fetchUserProfile } from "./user";
import { reverseGeocode, searchPlaces, lookupOsmElement } from "./nominatim";
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

export function useNominatimSearch(query: string) {
  return useQuery({
    queryKey: ["nominatim", "search", query],
    queryFn: () => searchPlaces(query),
    enabled: query.length >= 2,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });
}
