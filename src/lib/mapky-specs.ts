import {
  MapkySpecsBuilder,
  MapkyAppPostKind,
} from "mapky-app-specs";

export function makeOsmUrl(osmType: string, osmId: number): string {
  return `https://www.openstreetmap.org/${osmType}/${osmId}`;
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
    null, // parent
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
