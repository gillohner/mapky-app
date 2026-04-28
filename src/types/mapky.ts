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
}

export interface PostDetails {
  id: string;
  author_id: string;
  osm_canonical: string;
  content: string | null;
  rating: number | null;
  kind: "review" | "post";
  parent_uri: string | null;
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

export interface TagSearchResult {
  places: PlaceDetails[];
  collections: CollectionDetails[];
  posts: PostDetails[];
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
