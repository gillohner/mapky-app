import { nexusClient } from "./client";
import type {
  PlaceDetails,
  PostDetails,
  PostTagDetails,
  CollectionDetails,
  GeoCaptureDetails,
  RouteDetails,
  TagSearchResult,
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

export async function fetchPostTags(
  authorId: string,
  postId: string,
): Promise<PostTagDetails[]> {
  const { data } = await nexusClient.get<PostTagDetails[]>(
    `/v0/mapky/posts/${authorId}/${postId}/tags`,
  );
  return data;
}

export async function fetchCollection(
  authorId: string,
  collectionId: string,
): Promise<CollectionDetails> {
  const { data } = await nexusClient.get<CollectionDetails>(
    `/v0/mapky/collections/${authorId}/${collectionId}`,
  );
  return data;
}

export async function fetchUserCollections(
  userId: string,
  options?: { skip?: number; limit?: number },
): Promise<CollectionDetails[]> {
  const { data } = await nexusClient.get<CollectionDetails[]>(
    `/v0/mapky/collections/user/${userId}`,
    {
      params: {
        skip: options?.skip ?? 0,
        limit: options?.limit ?? 100,
      },
    },
  );
  return data;
}

export async function fetchCollectionsForPlace(
  osmType: string,
  osmId: number,
): Promise<CollectionDetails[]> {
  const { data } = await nexusClient.get<CollectionDetails[]>(
    `/v0/mapky/collections/place/${osmType}/${osmId}`,
  );
  return data;
}

export async function fetchCollectionTags(
  authorId: string,
  collectionId: string,
): Promise<PostTagDetails[]> {
  const { data } = await nexusClient.get<PostTagDetails[]>(
    `/v0/mapky/collections/${authorId}/${collectionId}/tags`,
  );
  return data;
}

export async function fetchUserPosts(
  userId: string,
  options?: { skip?: number; limit?: number },
): Promise<PostDetails[]> {
  const { data } = await nexusClient.get<PostDetails[]>(
    `/v0/mapky/posts/user/${userId}`,
    {
      params: {
        skip: options?.skip ?? 0,
        limit: options?.limit ?? 100,
      },
    },
  );
  return data;
}

export async function fetchViewportCaptures(
  bounds: ViewportBounds,
  limit = 200,
): Promise<GeoCaptureDetails[]> {
  const { data } = await nexusClient.get<GeoCaptureDetails[]>(
    "/v0/mapky/geo_captures/viewport",
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

export async function fetchGeoCaptureDetail(
  authorId: string,
  captureId: string,
): Promise<GeoCaptureDetails> {
  const { data } = await nexusClient.get<GeoCaptureDetails>(
    `/v0/mapky/geo_captures/${authorId}/${captureId}`,
  );
  return data;
}

export async function fetchGeoCaptureTags(
  authorId: string,
  captureId: string,
): Promise<PostTagDetails[]> {
  const { data } = await nexusClient.get<PostTagDetails[]>(
    `/v0/mapky/geo_captures/${authorId}/${captureId}/tags`,
  );
  return data;
}

export async function fetchSequenceCaptures(
  authorId: string,
  sequenceId: string,
): Promise<GeoCaptureDetails[]> {
  const { data } = await nexusClient.get<GeoCaptureDetails[]>(
    `/v0/mapky/sequences/${authorId}/${sequenceId}/captures`,
  );
  return data;
}

export async function fetchNearbyCaptures(
  lat: number,
  lon: number,
  options?: { radius?: number; excludeSequence?: string; limit?: number },
): Promise<GeoCaptureDetails[]> {
  const { data } = await nexusClient.get<GeoCaptureDetails[]>(
    "/v0/mapky/geo_captures/nearby",
    {
      params: {
        lat,
        lon,
        radius: options?.radius ?? 80,
        exclude_sequence: options?.excludeSequence,
        limit: options?.limit ?? 8,
      },
    },
  );
  return data;
}

export async function fetchUserGeoCaptures(
  userId: string,
  options?: { skip?: number; limit?: number },
): Promise<GeoCaptureDetails[]> {
  const { data } = await nexusClient.get<GeoCaptureDetails[]>(
    `/v0/mapky/geo_captures/user/${userId}`,
    {
      params: {
        skip: options?.skip ?? 0,
        limit: options?.limit ?? 100,
      },
    },
  );
  return data;
}

export async function searchByTag(
  query: string,
  limit = 20,
): Promise<TagSearchResult> {
  const { data } = await nexusClient.get<TagSearchResult>(
    "/v0/mapky/search/tags",
    { params: { q: query, limit } },
  );
  return data;
}

export async function fetchViewportRoutes(
  bounds: ViewportBounds,
  limit = 100,
): Promise<RouteDetails[]> {
  const { data } = await nexusClient.get<RouteDetails[]>(
    "/v0/mapky/routes/viewport",
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

export async function fetchRouteDetails(
  authorId: string,
  routeId: string,
): Promise<RouteDetails> {
  const { data } = await nexusClient.get<RouteDetails>(
    `/v0/mapky/routes/${authorId}/${routeId}`,
  );
  return data;
}

export async function fetchUserRoutes(
  userId: string,
  options?: { skip?: number; limit?: number },
): Promise<RouteDetails[]> {
  const { data } = await nexusClient.get<RouteDetails[]>(
    `/v0/mapky/routes/user/${userId}`,
    {
      params: {
        skip: options?.skip ?? 0,
        limit: options?.limit ?? 100,
      },
    },
  );
  return data;
}
