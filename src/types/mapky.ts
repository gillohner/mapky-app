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

export interface NexusUserDetails {
  id: string;
  name: string;
  bio: string | null;
  status: string | null;
  image: string | null;
  links: Array<{ title: string; url: string }> | null;
  indexed_at: number;
}
