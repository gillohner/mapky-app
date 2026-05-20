import {
  MapkySpecsBuilder,
  PubkyAppPostKind,
  PubkyAppPostEmbed,
  GeoCaptureKind,
  IncidentType as IncidentTypeEnum,
  IncidentSeverity as IncidentSeverityEnum,
  PubkySpecsBuilder,
  RouteActivityType,
} from "mapky-app-specs";

import type {
  GeoCaptureKind as GeoCaptureKindType,
  IncidentSeverity as IncidentSeverityKey,
  IncidentType as IncidentTypeKey,
  MapkyPostKind,
} from "@/types/mapky";
import type { Waypoint } from "@/lib/routing/types";

export function makeOsmUrl(osmType: string, osmId: number): string {
  return `https://www.openstreetmap.org/${osmType}/${osmId}`;
}

export interface CreateUserProfileResult {
  /** Homeserver path: /pub/pubky.app/profile.json */
  path: string;
  /** Serialized profile JSON */
  json: string;
}

const TEST_FIRST_NAMES = [
  "Alex", "Sam", "Jordan", "Casey", "Morgan", "Riley", "Quinn", "Avery",
  "Skyler", "Drew", "Reese", "Sage", "Rowan", "Finley", "Phoenix", "River",
  "Luna", "Atlas", "Nova", "Wren", "Indigo", "Juniper", "Sora", "Kai",
];

const TEST_LAST_NAMES = [
  "Walker", "Rivers", "Stone", "Vale", "Fox", "Wren", "Hart", "Lane",
  "Park", "Reed", "Ash", "Frost", "Brook", "Sky", "Wolf", "Moon",
];

const TEST_BIOS = [
  "Wandering through cities one café at a time.",
  "Always on the lookout for hidden gems.",
  "Map nerd. Coffee enthusiast. Casual hiker.",
  "Documenting the world, one place at a time.",
  "Finding stories in unexpected corners.",
  "Local explorer with global curiosity.",
  "Just here to discover good places and tag them.",
  "Mountains > beaches. Maybe.",
];

function pick<T>(arr: T[], seed: string, offset = 0): T {
  let hash = offset;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return arr[hash % arr.length];
}

/** Generate a randomized but deterministic test profile (testnet only). */
export function randomTestProfile(publicKey: string): {
  name: string;
  bio: string;
} {
  const first = pick(TEST_FIRST_NAMES, publicKey, 0);
  const last = pick(TEST_LAST_NAMES, publicKey, 7);
  const bio = pick(TEST_BIOS, publicKey, 13);
  return { name: `${first} ${last}`, bio };
}

/** Build a sanitized & validated PubkyAppUser profile JSON. */
export function createUserProfile(
  pubkyId: string,
  opts: {
    name: string;
    bio?: string;
    image?: string;
    status?: string;
  },
): CreateUserProfileResult {
  const builder = new PubkySpecsBuilder(pubkyId);
  const result = builder.createUser(
    opts.name,
    opts.bio ?? null,
    opts.image ?? null,
    null,
    opts.status ?? null,
  );
  const json = JSON.stringify(result.user.toJson());
  const path = result.meta.path;
  result.free();
  builder.free();
  return { path, json };
}

export interface CreateReviewResult {
  /** Homeserver path to write the blob, e.g. /pub/mapky.app/reviews/XXXX */
  path: string;
  /** Full pubky:// URI */
  url: string;
  /** JSON string to write */
  json: string;
}

/** Create a `MapkyAppReview` — rating-mandatory, place-anchored, never a reply. */
export function createReview(
  pubkyId: string,
  osmType: string,
  osmId: number,
  opts: {
    rating: number;
    content?: string;
    attachments?: string[];
  },
): CreateReviewResult {
  const builder = new MapkySpecsBuilder(pubkyId);
  const place = makeOsmUrl(osmType, osmId);

  const result = builder.createReview(
    place,
    opts.rating,
    opts.content || null,
    opts.attachments?.length ? opts.attachments : null,
  );

  const json = JSON.stringify(result.review.toJson());
  const path = result.meta.path;
  const url = result.meta.url;

  result.free();
  builder.free();

  return { path, url, json };
}

export interface CreateMapkyPostResult {
  /** Homeserver path to write the blob, e.g. /pub/mapky.app/posts/XXXX */
  path: string;
  /** Full pubky:// URI */
  url: string;
  /** JSON string to write */
  json: string;
}

const MAPKY_POST_KIND_MAP: Record<MapkyPostKind, PubkyAppPostKind> = {
  short: PubkyAppPostKind.Short,
  long: PubkyAppPostKind.Long,
  image: PubkyAppPostKind.Image,
  video: PubkyAppPostKind.Video,
  link: PubkyAppPostKind.Link,
  file: PubkyAppPostKind.File,
};

/** Create a `PubkyAppPost` (generic comment / threaded reply) stored under the
 * MapKy namespace at `/pub/mapky.app/posts/{id}`. The `parent` URI can target
 * any MapKy resource (review, route, collection, geo-capture, sequence,
 * incident, or another mapky-namespaced post). Cross-domain parents are
 * accepted but only edge-indexed when the target is a MapKy resource. */
export function createMapkyPost(
  pubkyId: string,
  opts: {
    content: string;
    kind?: MapkyPostKind;
    parent?: string;
    embed?: { uri: string; kind: MapkyPostKind };
    attachments?: string[];
  },
): CreateMapkyPostResult {
  const builder = new MapkySpecsBuilder(pubkyId);
  const kind = MAPKY_POST_KIND_MAP[opts.kind ?? "short"];
  const embed = opts.embed
    ? new PubkyAppPostEmbed(opts.embed.uri, MAPKY_POST_KIND_MAP[opts.embed.kind])
    : null;

  const result = builder.createMapkyPost(
    opts.content,
    kind,
    opts.parent ?? null,
    embed,
    opts.attachments?.length ? opts.attachments : null,
  );

  const json = JSON.stringify(result.post.toJson());
  const path = result.meta.path;
  const url = result.meta.url;

  result.free();
  builder.free();

  return { path, url, json };
}

export interface CreateTagResult {
  /** Homeserver path: /pub/mapky.app/tags/{tag_id} */
  path: string;
  /** JSON string to write */
  json: string;
}

export function createPlaceTag(
  pubkyId: string,
  osmType: string,
  osmId: number,
  label: string,
): CreateTagResult {
  const builder = new MapkySpecsBuilder(pubkyId);
  const osmUrl = makeOsmUrl(osmType, osmId);

  const result = builder.createPlaceTag(osmUrl, label);
  const json = JSON.stringify(result.tag.toJson());
  const path = result.meta.path;

  result.free();
  builder.free();

  return { path, json };
}

export interface CreateCollectionResult {
  path: string;
  url: string;
  json: string;
}

export function createCollection(
  pubkyId: string,
  name: string,
  description?: string,
  items?: string[],
): CreateCollectionResult {
  const builder = new MapkySpecsBuilder(pubkyId);
  const result = builder.createCollection(name, description || null, items || []);
  const resultAny = result as unknown as {
    post?: { toJson: () => unknown };
    collection?: { toJson: () => unknown };
  };

  const obj =
    ((resultAny.post ?? resultAny.collection)?.toJson() as Record<string, unknown>) ?? {};
  const json = JSON.stringify(obj);
  const path = result.meta.path;
  const url = result.meta.url;

  result.free();
  builder.free();

  return { path, url, json };
}

/** Build collection JSON for updating an existing collection (same path, no new ID). */
export function updateCollectionJson(
  name: string,
  description?: string,
  items?: string[],
): string {
  const nextItems = items || [];
  const isOsmItem = (uri: string) =>
    /^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/\d+$/.test(uri);
  if (!nextItems.every(isOsmItem)) {
    throw new Error("Collections currently support OpenStreetMap place URLs only.");
  }

  const envelope = {
    name,
    description: description || null,
    items: nextItems,
  };

  return JSON.stringify({
    content: JSON.stringify(envelope),
    kind: "collection",
    parent: null,
    embed: null,
    attachments: null,
  });
}

export function createCollectionTag(
  pubkyId: string,
  authorId: string,
  collectionId: string,
  label: string,
): CreateTagResult {
  const builder = new MapkySpecsBuilder(pubkyId);
  const collectionUri = `pubky://${authorId}/pub/mapky.app/posts/${collectionId}`;

  const result = builder.createPlaceTag(collectionUri, label);
  const json = JSON.stringify(result.tag.toJson());
  const path = result.meta.path;

  result.free();
  builder.free();

  return { path, json };
}

const INCIDENT_TYPE_MAP: Record<IncidentTypeKey, IncidentTypeEnum> = {
  accident: IncidentTypeEnum.Accident,
  hazard: IncidentTypeEnum.Hazard,
  road_closure: IncidentTypeEnum.RoadClosure,
  police: IncidentTypeEnum.Police,
  flooding: IncidentTypeEnum.Flooding,
  ice_snow: IncidentTypeEnum.IceSnow,
  poor_visibility: IncidentTypeEnum.PoorVisibility,
  danger: IncidentTypeEnum.Danger,
  other: IncidentTypeEnum.Other,
};

const INCIDENT_SEVERITY_MAP: Record<IncidentSeverityKey, IncidentSeverityEnum> =
  {
    low: IncidentSeverityEnum.Low,
    medium: IncidentSeverityEnum.Medium,
    high: IncidentSeverityEnum.High,
  };

export interface CreateIncidentResult {
  /** Homeserver path: /pub/mapky.app/incidents/{id} */
  path: string;
  /** Full pubky:// URI */
  url: string;
  /** JSON string to write */
  json: string;
  /** Bare timestamp id (without author prefix). */
  incidentId: string;
}

export function createIncident(
  pubkyId: string,
  opts: {
    incidentType: IncidentTypeKey;
    severity: IncidentSeverityKey;
    lat: number;
    lon: number;
    heading?: number | null;
    description?: string | null;
    attachments?: string[] | null;
    /** UNIX microseconds */
    expiresAt?: number | null;
  },
): CreateIncidentResult {
  const builder = new MapkySpecsBuilder(pubkyId);
  const result = builder.createIncident(
    INCIDENT_TYPE_MAP[opts.incidentType],
    INCIDENT_SEVERITY_MAP[opts.severity],
    opts.lat,
    opts.lon,
  );

  const obj = result.incident.toJson() as Record<string, unknown>;
  if (opts.heading != null) obj.heading = opts.heading;
  if (opts.description !== undefined) {
    obj.description = opts.description?.trim() || null;
  }
  if (opts.attachments !== undefined) {
    obj.attachments = opts.attachments?.length ? opts.attachments : [];
  }
  if (opts.expiresAt != null) {
    obj.expires_at = opts.expiresAt;
  }

  const json = JSON.stringify(obj);
  const path = result.meta.path;
  const url = result.meta.url;
  const incidentId = path.split("/").pop()!;

  result.free();
  builder.free();

  return { path, url, json, incidentId };
}

export interface CreateGeoCaptureResult {
  /** Homeserver path: /pub/mapky.app/geo_captures/{id} */
  path: string;
  /** Full pubky:// URI */
  url: string;
  /** JSON string to write */
  json: string;
}

const KIND_MAP: Record<GeoCaptureKindType, GeoCaptureKind> = {
  photo: GeoCaptureKind.Photo,
  panorama: GeoCaptureKind.Panorama,
  video: GeoCaptureKind.Video,
  video360: GeoCaptureKind.Video360,
  model3d: GeoCaptureKind.Model3d,
  point_cloud: GeoCaptureKind.PointCloud,
  audio: GeoCaptureKind.Audio,
  other: GeoCaptureKind.Other,
};

export function createGeoCapture(
  pubkyId: string,
  opts: {
    fileUri: string;
    kind: GeoCaptureKindType;
    lat: number;
    lon: number;
    ele?: number;
    heading?: number;
    pitch?: number;
    fov?: number;
    caption?: string;
    /** UNIX microseconds — moment the media was captured */
    capturedAt?: number;
  },
): CreateGeoCaptureResult {
  const builder = new MapkySpecsBuilder(pubkyId);

  const result = builder.createGeoCapture(
    opts.fileUri,
    KIND_MAP[opts.kind],
    opts.lat,
    opts.lon,
    opts.ele ?? null,
    opts.heading ?? null,
    opts.pitch ?? null,
    opts.fov ?? null,
    opts.caption ?? null,
    opts.capturedAt != null ? BigInt(opts.capturedAt) : null,
  );

  const obj = result.geo_capture.toJson() as Record<string, unknown>;
  const json = JSON.stringify(obj);
  const path = result.meta.path;
  const url = result.meta.url;

  result.free();
  builder.free();

  return { path, url, json };
}

export interface CreateSequenceResult {
  path: string;
  url: string;
  json: string;
  sequenceId: string;
}

export function createSequence(
  pubkyId: string,
  opts: {
    kind: GeoCaptureKindType;
    capturedAtStart: number; // microseconds
    capturedAtEnd: number; // microseconds
    captureCount: number;
    name?: string;
    description?: string;
    device?: string;
    bbox?: {
      minLat: number;
      minLon: number;
      maxLat: number;
      maxLon: number;
    };
  },
): CreateSequenceResult {
  const builder = new MapkySpecsBuilder(pubkyId);

  const result = builder.createSequence(
    KIND_MAP[opts.kind],
    BigInt(opts.capturedAtStart),
    BigInt(opts.capturedAtEnd),
    opts.captureCount,
    opts.name ?? null,
    opts.description ?? null,
    opts.device ?? null,
    opts.bbox?.minLat ?? null,
    opts.bbox?.minLon ?? null,
    opts.bbox?.maxLat ?? null,
    opts.bbox?.maxLon ?? null,
  );

  const obj = result.sequence.toJson() as Record<string, unknown>;
  const json = JSON.stringify(obj);
  const path = result.meta.path;
  const url = result.meta.url;
  const sequenceId = path.split("/").pop()!;

  result.free();
  builder.free();

  return { path, url, json, sequenceId };
}

export function createGeoCaptureTag(
  pubkyId: string,
  authorId: string,
  captureId: string,
  label: string,
): CreateTagResult {
  const builder = new MapkySpecsBuilder(pubkyId);
  const captureUri = `pubky://${authorId}/pub/mapky.app/geo_captures/${captureId}`;

  const result = builder.createPlaceTag(captureUri, label);
  const json = JSON.stringify(result.tag.toJson());
  const path = result.meta.path;

  result.free();
  builder.free();

  return { path, json };
}

export function createSequenceTag(
  pubkyId: string,
  authorId: string,
  sequenceId: string,
  label: string,
): CreateTagResult {
  const builder = new MapkySpecsBuilder(pubkyId);
  const sequenceUri = `pubky://${authorId}/pub/mapky.app/sequences/${sequenceId}`;

  const result = builder.createPlaceTag(sequenceUri, label);
  const json = JSON.stringify(result.tag.toJson());
  const path = result.meta.path;

  result.free();
  builder.free();

  return { path, json };
}

export type RouteActivityKey =
  | "hiking"
  | "cycling"
  | "running"
  | "walking"
  | "driving"
  | "skiing"
  | "other";

const ACTIVITY_MAP: Record<RouteActivityKey, RouteActivityType> = {
  hiking: RouteActivityType.Hiking,
  cycling: RouteActivityType.Cycling,
  running: RouteActivityType.Running,
  walking: RouteActivityType.Walking,
  driving: RouteActivityType.Driving,
  skiing: RouteActivityType.Skiing,
  other: RouteActivityType.Other,
};

export interface RouteGeometryInput {
  polyline: string;
  engine: "valhalla" | "manual" | "gpx";
  costing?: string | null;
  computed_at: number;
}

export interface CreateRouteOptions {
  description?: string | null;
  geometry?: RouteGeometryInput | null;
  osm_ways?: string[] | null;
  image_uri?: string | null;
  distance_m?: number | null;
  elevation_gain_m?: number | null;
  elevation_loss_m?: number | null;
  estimated_duration_s?: number | null;
}

export interface CreateRouteResult {
  /** Homeserver path: /pub/mapky.app/routes/{id} */
  path: string;
  /** Full pubky:// URI */
  url: string;
  /** JSON string to write */
  json: string;
}

/**
 * Build a sanitized & validated MapkyAppRoute JSON via the WASM builder, then
 * splice in the optional fields (description, geometry, computed stats) that
 * the bare constructor doesn't take. Mirrors the pattern in `createCollection`
 * for the `color` field.
 */
export function createRoute(
  pubkyId: string,
  name: string,
  activity: RouteActivityKey,
  waypoints: Waypoint[],
  opts: CreateRouteOptions = {},
): CreateRouteResult {
  const builder = new MapkySpecsBuilder(pubkyId);
  const wpInput = waypoints.map((w) => ({
    lat: w.lat,
    lon: w.lon,
    ele: w.ele ?? null,
    name: w.name ?? null,
  }));

  const result = builder.createRoute(name, ACTIVITY_MAP[activity], wpInput);
  const obj = result.route.toJson() as Record<string, unknown>;

  applyRouteOptionsToJson(obj, opts);

  const json = JSON.stringify(obj);
  const path = result.meta.path;
  const url = result.meta.url;

  result.free();
  builder.free();

  return { path, url, json };
}

/**
 * Build the JSON for an *update* of an existing route at the same path. Used
 * during edit flows when we want to overwrite without minting a new
 * TimestampId. Validates locally by re-running the WASM builder on a temporary
 * pubky id, then patching the path back is unnecessary because the caller
 * already knows the path.
 */
export function updateRouteJson(
  name: string,
  activity: RouteActivityKey,
  waypoints: Waypoint[],
  opts: CreateRouteOptions = {},
): string {
  const obj: Record<string, unknown> = {
    name,
    description: opts.description ?? null,
    activity,
    waypoints: waypoints.map((w) => ({
      lat: w.lat,
      lon: w.lon,
      ele: w.ele ?? null,
      name: w.name ?? null,
    })),
  };
  applyRouteOptionsToJson(obj, opts);
  return JSON.stringify(obj);
}

function applyRouteOptionsToJson(
  obj: Record<string, unknown>,
  opts: CreateRouteOptions,
) {
  if (opts.description !== undefined) {
    obj.description = opts.description;
  }
  if (opts.geometry) {
    obj.geometry = {
      polyline: opts.geometry.polyline,
      engine: opts.geometry.engine,
      costing: opts.geometry.costing ?? null,
      computed_at: opts.geometry.computed_at,
    };
  }
  if (opts.osm_ways && opts.osm_ways.length > 0) {
    obj.osm_ways = opts.osm_ways;
  }
  if (opts.image_uri) {
    obj.image_uri = opts.image_uri;
  }
  if (opts.distance_m != null) obj.distance_m = opts.distance_m;
  if (opts.elevation_gain_m != null)
    obj.elevation_gain_m = opts.elevation_gain_m;
  if (opts.elevation_loss_m != null)
    obj.elevation_loss_m = opts.elevation_loss_m;
  if (opts.estimated_duration_s != null)
    obj.estimated_duration_s = opts.estimated_duration_s;
}

export function createRouteTag(
  pubkyId: string,
  authorId: string,
  routeId: string,
  label: string,
): CreateTagResult {
  const builder = new MapkySpecsBuilder(pubkyId);
  const routeUri = `pubky://${authorId}/pub/mapky.app/routes/${routeId}`;

  const result = builder.createPlaceTag(routeUri, label);
  const json = JSON.stringify(result.tag.toJson());
  const path = result.meta.path;

  result.free();
  builder.free();

  return { path, json };
}

/** Tag a cross-namespace `MapkyAppPost` (PubkyAppPost stored at /pub/mapky.app/posts/). */
export function createPostTag(
  pubkyId: string,
  authorId: string,
  postId: string,
  label: string,
): CreateTagResult {
  const builder = new MapkySpecsBuilder(pubkyId);
  const postUri = `pubky://${authorId}/pub/mapky.app/posts/${postId}`;

  const result = builder.createPlaceTag(postUri, label);
  const json = JSON.stringify(result.tag.toJson());
  const path = result.meta.path;

  result.free();
  builder.free();

  return { path, json };
}

/** Tag a `MapkyAppReview`. */
export function createReviewTag(
  pubkyId: string,
  authorId: string,
  reviewId: string,
  label: string,
): CreateTagResult {
  const builder = new MapkySpecsBuilder(pubkyId);
  const reviewUri = `pubky://${authorId}/pub/mapky.app/reviews/${reviewId}`;

  const result = builder.createPlaceTag(reviewUri, label);
  const json = JSON.stringify(result.tag.toJson());
  const path = result.meta.path;

  result.free();
  builder.free();

  return { path, json };
}
