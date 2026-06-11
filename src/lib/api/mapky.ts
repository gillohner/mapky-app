import { nexusClient } from "./client";
import type {
  PlaceDetails,
  ReviewDetails,
  MapkyPostDetails,
  PostTagDetails,
  GeoCaptureDetails,
  RouteDetails,
  TagSearchResult,
  ViewportBounds,
  ViewportResponse,
  PlaceFilters,
  ViewportLayer,
  MultiViewportResponse,
  PlaceFullResponse,
  BtcViewportResponse,
  BitcoinPoi,
  SequenceDetails,
  SequenceViewportItem,
  SequenceFullResponse,
  IncidentDetails,
} from "@/types/mapky";

/** Build the `activity` + `min_rating` query params for the place
 *  viewport endpoints. Sorted activity tokens keep the cache key stable
 *  regardless of selection order; both fields are omitted when empty so
 *  the no-filter case sends the smallest possible URL. */
function placeFilterParams(filters: PlaceFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (filters.activities.length > 0) {
    out.activity = [...filters.activities].sort().join(",");
  }
  if (filters.minRating !== undefined && filters.minRating > 0) {
    out.min_rating = filters.minRating.toString();
  }
  return out;
}

/** Resource segments that can host a `:MapkyAppPost` reply thread. */
export type MapkyResourceType =
  | "reviews"
  | "routes"
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
        ...placeFilterParams(filters),
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
 * `useViewportCaptures`, `useViewportRoutes`)
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
        ...placeFilterParams(filters),
      },
    },
  );
  return data;
}

/**
 * Batch-fetch captures across many sequences in one round-trip.
 * Replaces the per-sequence fan-out for viewport-driven coverage:
 * one POST regardless of how many sequences are surfaced. Each
 * capture in the response carries its own `sequence_uri` so the
 * caller can re-group locally if needed.
 */
export async function fetchSequencesCapturesByIds(
  refs: ReadonlyArray<{ authorId: string; sequenceId: string }>,
  limit = 1000,
): Promise<GeoCaptureDetails[]> {
  if (refs.length === 0) return [];
  const uris = refs.map(
    (r) => `pubky://${r.authorId}/pub/mapky.app/sequences/${r.sequenceId}`,
  );
  const { data } = await nexusClient.post<GeoCaptureDetails[]>(
    "/v0/mapky/sequences/captures/by_ids",
    { uris, limit },
  );
  return data;
}

/**
 * Fetch the BTC overlay's viewport — same zoom-aware envelope as
 * `/v0/mapky/viewport`. Below the cluster threshold the response
 * carries `kind: "clusters"` (orange-themed cluster bubbles); at or
 * above, individual `kind: "places"` POIs.
 *
 * Back-compat shim: older nexusd builds (pre-BTC-clustering) return
 * a flat `BitcoinPoi[]` for this endpoint regardless of zoom. Wrap
 * those into the new `{kind:"places"}` envelope so the BtcOverlayLayer
 * keeps rendering individual POIs while the user rolls forward to
 * the new plugin.
 */
export async function fetchBtcViewport(
  bounds: ViewportBounds,
  zoom: number,
  limit = 500,
): Promise<BtcViewportResponse> {
  const { data } = await nexusClient.get<BtcViewportResponse | unknown[]>(
    "/v0/mapky/btc/viewport",
    {
      params: {
        min_lat: bounds.minLat,
        min_lon: bounds.minLon,
        max_lat: bounds.maxLat,
        max_lon: bounds.maxLon,
        zoom: Math.max(0, Math.min(22, Math.floor(zoom))),
        limit,
      },
    },
  );
  if (Array.isArray(data)) {
    // Legacy nexusd: flat array of BitcoinPoi. Treat as the new
    // envelope's `places` branch so the rest of the pipeline keeps
    // working without conditional logic at the call site.
    return { kind: "places", places: data as BitcoinPoi[] };
  }
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
 * then fans out reviews + posts + tags + routes via
 * `tokio::try_join!`. Wall-clock is `t_detail + max(t_others)`.
 *
 * The frontend's PlacePanel sub-components (`PlaceTags`, `PlaceReviews`,
 * `PlaceComments`, `PlaceRoutes`) all read slices off
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

interface ResourceTagsResponse {
  tags: Array<{
    label: string;
    taggers: string[];
    taggers_count: number;
  }>;
}

export async function fetchOsmResourceTags(
  osmType: string,
  osmId: number,
): Promise<PostTagDetails[]> {
  try {
    const uri = `https://www.openstreetmap.org/${osmType}/${osmId}`;
    const { data } = await nexusClient.get<ResourceTagsResponse>(
      "/v0/resource/by-uri",
      { params: { uri } },
    );
    return data.tags.map((tag) => ({
      label: tag.label,
      taggers: tag.taggers,
      taggers_count: tag.taggers_count,
    }));
  } catch (err) {
    const status = (err as { response?: { status?: number } }).response?.status;
    if (status === 404) return [];
    throw err;
  }
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

export async function fetchViewportIncidents(
  bounds: ViewportBounds,
  limit = 200,
): Promise<IncidentDetails[]> {
  const { data } = await nexusClient.get<IncidentDetails[]>(
    "/v0/mapky/incidents/viewport",
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

export async function fetchIncidentDetail(
  authorId: string,
  incidentId: string,
): Promise<IncidentDetails> {
  const { data } = await nexusClient.get<IncidentDetails>(
    `/v0/mapky/incidents/${authorId}/${incidentId}`,
  );
  return data;
}

export async function fetchUserIncidents(
  userId: string,
  options?: { skip?: number; limit?: number },
): Promise<IncidentDetails[]> {
  const { data } = await nexusClient.get<IncidentDetails[]>(
    `/v0/mapky/incidents/user/${userId}`,
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

/** A user's sequences, most-recent first. Backed by
 *  `/v0/mapky/sequences/user/{user_id}`. */
export async function fetchUserSequences(
  userId: string,
  limit = 100,
): Promise<SequenceDetails[]> {
  const { data } = await nexusClient.get<SequenceDetails[]>(
    `/v0/mapky/sequences/user/${userId}`,
    { params: { limit } },
  );
  return data;
}

/** Sequences whose stored bbox overlaps the viewport. Spatial
 *  discovery surface for the map's sequence markers layer. */
export async function fetchViewportSequences(
  bounds: ViewportBounds,
  limit = 200,
): Promise<SequenceViewportItem[]> {
  const { data } = await nexusClient.get<SequenceViewportItem[]>(
    "/v0/mapky/sequences/viewport",
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

/** Composite sequence-detail fetch — detail + captures + tags in one
 *  round-trip. Backed by `/sequences/{author}/{id}/full`. */
export async function fetchSequenceDetailFull(
  authorId: string,
  sequenceId: string,
  capturesLimit = 100,
): Promise<SequenceFullResponse> {
  const { data } = await nexusClient.get<SequenceFullResponse>(
    `/v0/mapky/sequences/${authorId}/${sequenceId}/full`,
    { params: { captures_limit: capturesLimit } },
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
