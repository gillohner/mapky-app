import { nexusClient } from "./client";
import type {
  PlaceDetails,
  PostDetails,
  PostTagDetails,
  ViewportBounds,
} from "@/types/mapky";

export async function fetchViewportPlaces(
  bounds: ViewportBounds,
  limit = 100,
): Promise<PlaceDetails[]> {
  const { data } = await nexusClient.get<PlaceDetails[]>(
    "/v0/mapky/viewport",
    {
      params: {
        min_lat: bounds.minLat,
        min_lon: bounds.minLon,
        max_lat: bounds.maxLat,
        max_lon: bounds.maxLon,
        limit,
      },
    },
  );
  return data;
}

export async function fetchPlaceDetail(
  osmType: string,
  osmId: number,
): Promise<PlaceDetails> {
  const { data } = await nexusClient.get<PlaceDetails>(
    `/v0/mapky/place/${osmType}/${osmId}`,
  );
  return data;
}

export async function fetchPlacePosts(
  osmType: string,
  osmId: number,
  options?: { skip?: number; limit?: number; reviewsOnly?: boolean },
): Promise<PostDetails[]> {
  const { data } = await nexusClient.get<PostDetails[]>(
    `/v0/mapky/place/${osmType}/${osmId}/posts`,
    {
      params: {
        skip: options?.skip ?? 0,
        limit: options?.limit ?? 100,
        reviews_only: options?.reviewsOnly ?? false,
      },
    },
  );
  return data;
}

export async function fetchPlaceTags(
  osmType: string,
  osmId: number,
): Promise<PostTagDetails[]> {
  const { data } = await nexusClient.get<PostTagDetails[]>(
    `/v0/mapky/place/${osmType}/${osmId}/tags`,
  );
  return data;
}
