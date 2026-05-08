import { nexusClient } from "./client";
import type {
  PlaceDetails,
  ReviewDetails,
  MapkyPostDetails,
  PostTagDetails,
  CollectionDetails,
  GeoCaptureDetails,
  RouteDetails,
  TagSearchResult,
  ViewportBounds,
  ViewportResponse,
  PlaceFilters,
  ViewportLayer,
  MultiViewportResponse,
  PlaceFullResponse,
} from "@/types/mapky";

/** Resource segments that can host a `:MapkyAppPost` reply thread. */
export type MapkyResourceType =
  | "reviews"
  | "routes"
  | "collections"
  | "geo_captures"
  | "sequences"
  | "incidents"
  | "posts";

/** Zoom at or above which the server returns individual places.
 *  Below this, we get cluster bubbles. Mirror the constant in
 *  `mapky-nexus-plugin/src/api/mod.rs::CLUSTER_ZOOM_THRESHOLD`. */
export const CLUSTER_ZOOM_THRESHOLD = 11;

/**
 * Fetch the viewport in a zoom-aware way: cluster summaries below
 * `CLUSTER_ZOOM_THRESHOLD`, individual `PlaceDetails` at or above.
 * The discriminator on the envelope (`kind`) drives which renderer
 * the layer picks — same query key, one network round-trip per pan.
 *
 * The default `limit=500` is generous enough to render every BTC POI
 * in a dense metro at the threshold zoom (Lisbon/Berlin both fit
 * comfortably) without trimming. MapLibre handles ~1k HTML markers
 * smoothly so the headroom is real, not theoretical.
 */
export async function fetchViewport(
  bounds: ViewportBounds,
  zoom: number,
  filters: PlaceFilters,
  limit = 500,
): Promise<ViewportResponse> {
  const { data } = await nexusClient.get<ViewportResponse>(
    "/v0/mapky/viewport",
    {
      params: {
        min_lat: bounds.minLat,
        min_lon: bounds.minLon,
        max_lat: bounds.maxLat,
        max_lon: bounds.maxLon,
        zoom: Math.max(0, Math.min(22, Math.floor(zoom))),
        limit,
        // Send only flags that are on so the cache key stays compact
        // when no filters are active (the default case).
        ...(filters.bitcoin ? { bitcoin: true } : null),
        ...(filters.reviewed ? { reviewed: true } : null),
        ...(filters.tagged ? { tagged: true } : null),
      },
    },
  );
  return data;
}

/**
 * Composite map-viewport fetch: one request, up to four layers in parallel
 * server-side. Backed by the plugin's `/v0/mapky/viewport/all` endpoint.
 *
 * `include` selects which layers to compute. Layers not in `include` are
 * omitted from the response (`undefined`). The place filters are only
 * meaningful when `places` is included; harmless to pass through otherwise
 * (the server ignores them when the place layer isn't in `include`).
 *
 * Used by `useViewportAll` and the per-slice hooks (`useViewportPlaces`,
 * `useViewportCollections`, `useViewportCaptures`, `useViewportRoutes`)
 * which share a query key and split the response via TanStack `select`,
 * so all consumers of the same bbox/zoom/filters/include set share one
 * round-trip.
 */
export async function fetchViewportAll(
  bounds: ViewportBounds,
  zoom: number,
  filters: PlaceFilters,
  include: readonly ViewportLayer[],
  limit = 500,
): Promise<MultiViewportResponse> {
  const { data } = await nexusClient.get<MultiViewportResponse>(
    "/v0/mapky/viewport/all",
    {
      params: {
        min_lat: bounds.minLat,
        min_lon: bounds.minLon,
        max_lat: bounds.maxLat,
        max_lon: bounds.maxLon,
        zoom: Math.max(0, Math.min(22, Math.floor(zoom))),
        limit,
        include: include.join(","),
        ...(filters.bitcoin ? { bitcoin: true } : null),
        ...(filters.reviewed ? { reviewed: true } : null),
        ...(filters.tagged ? { tagged: true } : null),
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

/**
 * Composite place-detail fetch: one request, six slices.
 *
 * Backed by `/v0/mapky/place/{osm_type}/{osm_id}/full`. Server-side runs
 * detail synchronously (need lat/lon for routes-near + 404 short-circuit)
 * then fans out reviews + posts + tags + collections + routes via
 * `tokio::try_join!`. Wall-clock is `t_detail + max(t_others)`.
 *
 * The frontend's PlacePanel sub-components (`PlaceTags`, `PlaceReviews`,
 * `PlaceComments`, `PlaceCollections`, `PlaceRoutes`) all read slices off
 * this single composite via `usePlaceFull*` selectors — so opening a
 * place fires ONE request instead of six.
 */
export async function fetchPlaceDetailFull(
  osmType: string,
  osmId: number,
): Promise<PlaceFullResponse> {
  const { data } = await nexusClient.get<PlaceFullResponse>(
    `/v0/mapky/place/${osmType}/${osmId}/full`,
  );
  return data;
}

/** Reviews (rating-mandatory) for a place, most recent first. */
export async function fetchPlaceReviews(
  osmType: string,
  osmId: number,
  options?: { skip?: number; limit?: number },
): Promise<ReviewDetails[]> {
  const { data } = await nexusClient.get<ReviewDetails[]>(
    `/v0/mapky/place/${osmType}/${osmId}/reviews`,
    {
      params: {
        skip: options?.skip ?? 0,
        limit: options?.limit ?? 100,
      },
    },
  );
  return data;
}

/** `:MapkyAppPost` (cross-namespace comments) anchored to a place via reply
 * chain — i.e. posts whose parent is a `:MapkyAppReview` for this place. */
export async function fetchPlacePosts(
  osmType: string,
  osmId: number,
  options?: { skip?: number; limit?: number },
): Promise<MapkyPostDetails[]> {
  const { data } = await nexusClient.get<MapkyPostDetails[]>(
    `/v0/mapky/place/${osmType}/${osmId}/posts`,
    {
      params: {
        skip: options?.skip ?? 0,
        limit: options?.limit ?? 100,
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

/** Tags on a `:MapkyAppReview`. */
export async function fetchReviewTags(
  authorId: string,
  reviewId: string,
): Promise<PostTagDetails[]> {
  const { data } = await nexusClient.get<PostTagDetails[]>(
    `/v0/mapky/reviews/${authorId}/${reviewId}/tags`,
  );
  return data;
}

/** `:MapkyAppPost` replies to any MapKy resource. The endpoint dispatches on
 * the path segment to the matching Neo4j label. */
export async function fetchResourceReplies(
  resourceType: MapkyResourceType,
  authorId: string,
  resourceId: string,
  options?: { skip?: number; limit?: number },
): Promise<MapkyPostDetails[]> {
  const { data } = await nexusClient.get<MapkyPostDetails[]>(
    `/v0/mapky/${resourceType}/${authorId}/${resourceId}/posts`,
    {
      params: {
        skip: options?.skip ?? 0,
        limit: options?.limit ?? 100,
      },
    },
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

/** Public collections that contain at least one Place inside the bbox. */
export async function fetchViewportCollections(
  bounds: ViewportBounds,
  limit = 100,
): Promise<CollectionDetails[]> {
  const { data } = await nexusClient.get<CollectionDetails[]>(
    "/v0/mapky/collections/viewport",
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

/** A user's `:MapkyAppPost` (cross-namespace comments). */
export async function fetchUserPosts(
  userId: string,
  options?: { skip?: number; limit?: number },
): Promise<MapkyPostDetails[]> {
  const { data } = await nexusClient.get<MapkyPostDetails[]>(
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

/** A user's `:MapkyAppReview` rows. */
export async function fetchUserReviews(
  userId: string,
  options?: { skip?: number; limit?: number },
): Promise<ReviewDetails[]> {
  const { data } = await nexusClient.get<ReviewDetails[]>(
    `/v0/mapky/reviews/user/${userId}`,
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

export async function fetchRouteTags(
  authorId: string,
  routeId: string,
): Promise<PostTagDetails[]> {
  const { data } = await nexusClient.get<PostTagDetails[]>(
    `/v0/mapky/routes/${authorId}/${routeId}/tags`,
  );
  return data;
}

export async function fetchPlaceRoutes(
  osmType: string,
  osmId: number,
  options?: { limit?: number },
): Promise<RouteDetails[]> {
  const { data } = await nexusClient.get<RouteDetails[]>(
    `/v0/mapky/place/${osmType}/${osmId}/routes`,
    { params: { limit: options?.limit ?? 50 } },
  );
  return data;
}
