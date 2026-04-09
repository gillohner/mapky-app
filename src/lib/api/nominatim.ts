import {
  getCached,
  setCache,
  makeReverseKey,
  makeSearchKey,
} from "./nominatim-cache";

/** In dev, Nominatim is proxied through Vite to avoid CORS issues. */
const NOMINATIM_BASE = import.meta.env.DEV
  ? "/nominatim"
  : "https://nominatim.openstreetmap.org";

export interface NominatimResult {
  osm_type: string | null;
  osm_id: number | null;
  name: string | null;
  display_name: string;
  type: string | null;
  category: string | null;
  address: Record<string, string>;
  lat: number | null;
  lon: number | null;
}

export async function reverseGeocode(
  lat: number,
  lon: number,
): Promise<NominatimResult> {
  const cacheKey = makeReverseKey(lat, lon);
  const cached = getCached<NominatimResult>(cacheKey);
  if (cached) return cached;

  const url = new URL(`${NOMINATIM_BASE}/reverse`, window.location.origin);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("format", "json");
  url.searchParams.set("zoom", "18");

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Nominatim error: ${res.status}`);

  const data = await res.json();
  const result: NominatimResult = {
    osm_type: data.osm_type || null,
    osm_id: data.osm_id ? Number(data.osm_id) : null,
    name: data.name || null,
    display_name: data.display_name,
    type: data.type || null,
    category: data.category || data.class || null,
    address: data.address ?? {},
    lat: data.lat ? Number(data.lat) : null,
    lon: data.lon ? Number(data.lon) : null,
  };

  setCache(cacheKey, result);
  return result;
}

/**
 * Search by name near coordinates. Used when clicking a named map feature
 * to find the exact OSM element instead of reverse-geocoding to the nearest address.
 * Uses a small bounding box around the click point to scope results.
 */
export async function searchNearby(
  name: string,
  lat: number,
  lon: number,
): Promise<NominatimResult | null> {
  const cacheKey = `nearby:${name.toLowerCase()}:${lat.toFixed(4)},${lon.toFixed(4)}`;
  const cached = getCached<NominatimResult | null>(cacheKey);
  if (cached !== null) return cached;

  // Small bounding box ~200m around click point
  const delta = 0.002;
  const viewbox = `${lon - delta},${lat + delta},${lon + delta},${lat - delta}`;

  const url = new URL(`${NOMINATIM_BASE}/search`, window.location.origin);
  url.searchParams.set("q", name);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("viewbox", viewbox);
  url.searchParams.set("bounded", "1");
  url.searchParams.set("dedupe", "1");

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Nominatim error: ${res.status}`);

  const data = await res.json();
  if (!data.length) {
    // Cache the miss to avoid repeated lookups
    setCache(cacheKey, null);
    return null;
  }

  const r = data[0];
  const result: NominatimResult = {
    osm_type: r.osm_type || null,
    osm_id: r.osm_id ? Number(r.osm_id) : null,
    name: r.name || r.display_name?.split(",")[0] || null,
    display_name: r.display_name || "",
    type: r.type || null,
    category: r.category || r.class || null,
    address: r.address ?? {},
    lat: r.lat ? Number(r.lat) : null,
    lon: r.lon ? Number(r.lon) : null,
  };

  setCache(cacheKey, result);
  return result;
}

export interface NominatimSearchResult {
  osm_type: string;
  osm_id: number;
  name: string;
  display_name: string;
  type: string;
  category: string;
  lat: number;
  lon: number;
}

export async function searchPlaces(
  query: string,
): Promise<NominatimSearchResult[]> {
  const cacheKey = makeSearchKey(query);
  const cached = getCached<NominatimSearchResult[]>(cacheKey);
  if (cached) return cached;

  const url = new URL(`${NOMINATIM_BASE}/search`, window.location.origin);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "8");
  url.searchParams.set("dedupe", "1");
  url.searchParams.set("addressdetails", "0");

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Nominatim error: ${res.status}`);

  const data = await res.json();
  const results: NominatimSearchResult[] = data.map(
    (r: Record<string, unknown>) =>
      ({
        osm_type: String(r.osm_type),
        osm_id: Number(r.osm_id),
        name: String(r.name || String(r.display_name).split(",")[0]),
        display_name: String(r.display_name),
        type: String(r.type || ""),
        category: String(r.category || r.class || ""),
        lat: Number(r.lat),
        lon: Number(r.lon),
      }) satisfies NominatimSearchResult,
  );

  setCache(cacheKey, results);
  return results;
}

const TYPE_PREFIX: Record<string, string> = {
  node: "N",
  way: "W",
  relation: "R",
};

/**
 * Lookup a specific OSM element by type+id.
 * Returns structured name, address, and type information.
 */
export async function lookupOsmElement(
  osmType: string,
  osmId: number,
): Promise<NominatimResult> {
  const cacheKey = `lookup:${osmType}:${osmId}`;
  const cached = getCached<NominatimResult>(cacheKey);
  if (cached) return cached;

  const prefix = TYPE_PREFIX[osmType];
  if (!prefix) throw new Error(`Unknown osm_type: ${osmType}`);

  const url = new URL(`${NOMINATIM_BASE}/lookup`, window.location.origin);
  url.searchParams.set("osm_ids", `${prefix}${osmId}`);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Nominatim error: ${res.status}`);

  const data = await res.json();
  if (!data.length) {
    const empty: NominatimResult = {
      osm_type: osmType,
      osm_id: osmId,
      name: null,
      display_name: "",
      type: null,
      category: null,
      address: {},
      lat: null,
      lon: null,
    };
    setCache(cacheKey, empty);
    return empty;
  }

  const r = data[0];
  const result: NominatimResult = {
    osm_type: r.osm_type || osmType,
    osm_id: r.osm_id ? Number(r.osm_id) : osmId,
    name: r.name || null,
    display_name: r.display_name || "",
    type: r.type || null,
    category: r.category || r.class || null,
    address: r.address ?? {},
    lat: r.lat ? Number(r.lat) : null,
    lon: r.lon ? Number(r.lon) : null,
  };

  setCache(cacheKey, result);
  return result;
}
