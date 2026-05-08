export interface PlaceDetails {
  osm_canonical: string;
  osm_type: string;
  osm_id: number;
  lat: number;
  lon: number;
  geocoded: boolean;
  review_count: number;
  avg_rating: number;
  tag_count: number;
  photo_count: number;
  indexed_at: number;
  /** OSM `name` tag, populated for BTCMap-imported places and any
   * place where Nominatim has resolved a name. Optional because
   * legacy entries created before the BTCMap sync may lack it. */
  name?: string | null;
  /** True when the place carries `currency:XBT=yes` /
   * `payment:bitcoin=yes` (cross-referenced from BTCMap). Drives the
   * accent-coloured balloon and the "Bitcoin" filter pill. */
  accepts_bitcoin?: boolean;
  btc_onchain?: boolean;
  btc_lightning?: boolean;
  btc_lightning_contactless?: boolean;
}

/** One row from `/v0/mapky/viewport` cluster mode. */
export interface PlaceCluster {
  lat: number;
  lon: number;
  total: number;
  btc: number;
  reviewed: number;
  tagged: number;
}

/** Discriminated envelope returned by `/v0/mapky/viewport`. The frontend
 * switches between cluster bubbles (low zoom) and individual balloons
 * (high zoom) based on `kind`. */
export type ViewportResponse =
  | { kind: "clusters"; clusters: PlaceCluster[]; cell: number }
  | { kind: "places"; places: PlaceDetails[] };

/** Filter pills layered on the place viewport. All-`false` (the default)
 * means "show every place"; flipping a flag narrows the result. */
export interface PlaceFilters {
  bitcoin: boolean;
  reviewed: boolean;
  tagged: boolean;
}

/** Layer selector for the composite `/v0/mapky/viewport/all` endpoint.
 * Maps to the `include` query param; flags toggle whether each layer's
 * Neo4j query runs server-side. */
export type ViewportLayer = "places" | "collections" | "captures" | "routes";

/** Response envelope from `/v0/mapky/place/{osm_type}/{osm_id}/full`.
 * All six slices are served in one request — replaces the six independent
 * fetches PlacePanel used to mount on every place open. */
export interface PlaceFullResponse {
  detail: PlaceDetails;
  reviews: ReviewDetails[];
  posts: MapkyPostDetails[];
  tags: PostTagDetails[];
  collections: CollectionDetails[];
  routes: RouteDetails[];
}

/** Response envelope from `/v0/mapky/viewport/all`. Each branch is
 * present iff the layer was in `include`; the four `Vec<T>` fields
 * (`collections`, `captures`, `routes`) come back as plain arrays,
 * `places` as the discriminated cluster/places envelope. */
export interface MultiViewportResponse {
  places?: ViewportResponse;
  collections?: CollectionDetails[];
  captures?: GeoCaptureDetails[];
  routes?: RouteDetails[];
}

/** A rating-mandatory review of an OSM place (`:MapkyAppReview` in Neo4j).
 * Reviews are never replies; threaded discussion lives in `MapkyPostDetails`. */
export interface ReviewDetails {
  id: string;
  author_id: string;
  osm_canonical: string;
  content: string | null;
  rating: number;
  attachments: string[];
  indexed_at: number;
}

/** A `PubkyAppPost`-shaped comment stored under the MapKy namespace at
 * `/pub/mapky.app/posts/{id}` and indexed as a dual-labeled `:Post:MapkyAppPost`
 * node. Used as the threaded reply unit on any MapKy resource (review, route,
 * collection, geo-capture, sequence, incident, or another mapky-namespaced
 * post). */
export type MapkyPostKind = "short" | "long" | "image" | "video" | "link" | "file";

export interface MapkyPostDetails {
  id: string;
  author_id: string;
  content: string;
  kind: MapkyPostKind;
  parent_uri: string | null;
  embed_uri: string | null;
  embed_kind: string | null;
  attachments: string[];
  indexed_at: number;
}

export interface PostTagDetails {
  label: string;
  taggers: string[];
  taggers_count: number;
}

export interface ViewportBounds {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

export interface ResourceDetails {
  id: string;
  uri: string;
  scheme: string;
  indexed_at: number;
}

export interface ResourceTagsResponse {
  resource: ResourceDetails;
  tags: PostTagDetails[];
}

export interface CollectionDetails {
  id: string;
  author_id: string;
  name: string;
  description: string | null;
  items: string[];
  image_uri: string | null;
  color: string | null;
  indexed_at: number;
}

export interface IncidentDetails {
  id: string;
  author_id: string;
  incident_type: string;
  severity: string;
  lat: number;
  lon: number;
  heading: number | null;
  description: string | null;
  attachments: string[];
  expires_at: number | null;
  indexed_at: number;
}

export interface SequenceDetails {
  id: string;
  author_id: string;
  name: string | null;
  description: string | null;
  kind: GeoCaptureKind;
  captured_at_start: number;
  captured_at_end: number;
  capture_count: number;
  min_lat: number | null;
  min_lon: number | null;
  max_lat: number | null;
  max_lon: number | null;
  device: string | null;
  indexed_at: number;
}

export interface TagSearchResult {
  places: PlaceDetails[];
  collections: CollectionDetails[];
  reviews: ReviewDetails[];
  posts: MapkyPostDetails[];
  routes: RouteDetails[];
  geo_captures: GeoCaptureDetails[];
  sequences: SequenceDetails[];
  incidents: IncidentDetails[];
}

export type GeoCaptureKind =
  | "photo"
  | "panorama"
  | "video"
  | "video360"
  | "model3d"
  | "point_cloud"
  | "audio"
  | "other";

export interface GeoCaptureDetails {
  id: string; // compound: "author_id:capture_id"
  author_id: string;
  file_uri: string;
  kind: GeoCaptureKind;
  lat: number;
  lon: number;
  ele: number | null;
  heading: number | null;
  pitch: number | null;
  fov: number | null;
  caption: string | null;
  sequence_uri: string | null;
  sequence_index: number | null;
  captured_at: number | null;
  indexed_at: number;
  tags?: PostTagDetails[];
}

export interface NexusUserDetails {
  id: string;
  name: string;
  bio: string | null;
  status: string | null;
  image: string | null;
  links: Array<{ title: string; url: string }> | null;
  indexed_at: number;
}

export type RouteActivity =
  | "hiking"
  | "cycling"
  | "running"
  | "walking"
  | "driving"
  | "skiing"
  | "other";

/** Indexer metadata for a route. Returned by `/v0/mapky/routes/...`. */
export interface RouteDetails {
  id: string; // compound: "author_id:route_id"
  author_id: string;
  name: string;
  description: string | null;
  activity: RouteActivity;
  distance_m: number | null;
  elevation_gain_m: number | null;
  elevation_loss_m: number | null;
  estimated_duration_s: number | null;
  image_uri: string | null;
  min_lat: number;
  min_lon: number;
  max_lat: number;
  max_lon: number;
  start_lat: number;
  start_lon: number;
  waypoint_count: number;
  indexed_at: number;
}

export interface RouteWaypointJson {
  lat: number;
  lon: number;
  ele?: number | null;
  name?: string | null;
}

export interface RouteGeometryJson {
  polyline: string;
  engine: string;
  costing?: string | null;
  computed_at: number;
}

export interface RouteStepJson {
  instruction: string;
  distance_m: number;
  waypoint_index: number;
}

/**
 * Full route JSON as stored on the homeserver under
 * `/pub/mapky.app/routes/{id}`. Mirrors `MapkyAppRoute` in mapky-app-specs.
 */
export interface RouteFullJson {
  name: string;
  description?: string | null;
  activity: RouteActivity;
  waypoints: RouteWaypointJson[];
  osm_ways?: string[] | null;
  control_points?: RouteWaypointJson[] | null;
  steps?: RouteStepJson[] | null;
  distance_m?: number | null;
  elevation_gain_m?: number | null;
  elevation_loss_m?: number | null;
  estimated_duration_s?: number | null;
  image_uri?: string | null;
  geometry?: RouteGeometryJson | null;
}

/** Combined detail for the viewer: indexer metadata + full body. */
export interface RouteFull extends RouteDetails {
  body: RouteFullJson;
}
