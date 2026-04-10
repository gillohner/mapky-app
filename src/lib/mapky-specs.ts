import {
  MapkySpecsBuilder,
  MapkyAppPostKind,
  PubkySpecsBuilder,
} from "mapky-app-specs";

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

export interface CreatePostResult {
  /** Homeserver path to write the blob, e.g. /pub/mapky.app/posts/XXXX */
  path: string;
  /** Full pubky:// URI */
  url: string;
  /** JSON string to write */
  json: string;
}

export function createPost(
  pubkyId: string,
  osmType: string,
  osmId: number,
  opts: {
    kind: "review" | "post";
    content?: string;
    rating?: number;
    attachments?: string[];
    parent?: string;
  },
): CreatePostResult {
  const builder = new MapkySpecsBuilder(pubkyId);
  const place = makeOsmUrl(osmType, osmId);
  const kind =
    opts.kind === "review" ? MapkyAppPostKind.Review : MapkyAppPostKind.Post;

  const result = builder.createPost(
    kind,
    place,
    opts.content || null,
    opts.rating ?? null,
    opts.attachments?.length ? opts.attachments : null,
    opts.parent ?? null,
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
  imageUri?: string,
  color?: string,
): CreateCollectionResult {
  const builder = new MapkySpecsBuilder(pubkyId);
  const result = builder.createCollection(
    name,
    description || null,
    items || [],
    imageUri || null,
  );

  // Inject color into the JSON (WASM builder doesn't know about it yet)
  const obj = result.collection.toJson() as Record<string, unknown>;
  if (color) obj.color = color;
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
  imageUri?: string,
  color?: string,
): string {
  return JSON.stringify({
    name,
    description: description || null,
    items: items || [],
    image_uri: imageUri || null,
    color: color || null,
  });
}

export function createCollectionTag(
  pubkyId: string,
  authorId: string,
  collectionId: string,
  label: string,
): CreateTagResult {
  const builder = new MapkySpecsBuilder(pubkyId);
  const collectionUri = `pubky://${authorId}/pub/mapky.app/collections/${collectionId}`;

  const result = builder.createPlaceTag(collectionUri, label);
  const json = JSON.stringify(result.tag.toJson());
  const path = result.meta.path;

  result.free();
  builder.free();

  return { path, json };
}

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
