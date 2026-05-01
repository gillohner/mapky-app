import {
  getCached,
  setCache,
  makeReverseKey,
  makeSearchKey,
} from "./nominatim-cache";
import { config } from "@/lib/config";

/**
 * Base URL for Nominatim. Dev default proxies through Vite (`/nominatim`)
 * for CORS; prod default is the public OSM instance. Override either
 * via `VITE_NOMINATIM_URL` (e.g. a self-hosted Nominatim mirror).
 */
const NOMINATIM_BASE = config.nominatim.url;

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
  /**
   * Raw OSM tags beyond the structured fields, populated when the
   * lookup is called with `extratags=1`. Used by `BitcoinAcceptance`
   * to read `currency:XBT` / `payment:*` without a second API call.
   */
  extratags?: Record<string, string>;
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

function parseSearchResults(data: Record<string, unknown>[]): NominatimSearchResult[] {
  return data.map(
    (r) =>
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
}

/**
 * Search places strictly within a viewport bounding box (bounded=1).
 * Results sorted by distance from viewport center.
 * Used for the "In this area" section — re-fires on map move.
 */
export async function searchPlacesBounded(
  query: string,
  viewbox: { west: number; north: number; east: number; south: number },
  limit = 40,
): Promise<NominatimSearchResult[]> {
  const vb = `${viewbox.west.toFixed(4)},${viewbox.north.toFixed(4)},${viewbox.east.toFixed(4)},${viewbox.south.toFixed(4)}`;
  const cacheKey = `search-bd:${query.toLowerCase().trim()}:${viewbox.west.toFixed(2)},${viewbox.north.toFixed(2)},${viewbox.east.toFixed(2)},${viewbox.south.toFixed(2)}`;
  const cached = getCached<NominatimSearchResult[]>(cacheKey);
  if (cached) return cached;

  const url = new URL(`${NOMINATIM_BASE}/search`, window.location.origin);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("dedupe", "1");
  url.searchParams.set("addressdetails", "0");
  url.searchParams.set("viewbox", vb);
  url.searchParams.set("bounded", "1");

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Nominatim error: ${res.status}`);

  const data = await res.json();
  const results = parseSearchResults(data);

  // Sort by distance from viewport center
  const centerLat = (viewbox.north + viewbox.south) / 2;
  const centerLon = (viewbox.west + viewbox.east) / 2;
  const dist = (r: NominatimSearchResult) =>
    (r.lat - centerLat) ** 2 + (r.lon - centerLon) ** 2;
  results.sort((a, b) => dist(a) - dist(b));

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
  // Extra tags include the BTCMap payment:* / currency:XBT signals
  // that the place card reads to render the Bitcoin acceptance row.
  url.searchParams.set("extratags", "1");

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
    extratags: r.extratags ?? undefined,
  };

  setCache(cacheKey, result);
  return result;
}

/**
 * Batched OSM lookup. Nominatim's `/lookup` accepts up to 50 osm_ids
 * comma-separated in a single request — one round-trip per 50 places
 * instead of one per place. Public Nominatim throttles per-IP, so a
 * 30-row place list that used to fire 30 individual lookups (most
 * getting 429s) now resolves in a single ~1s call.
 *
 * Results are pulled from the in-memory cache when available and only
 * the missing IDs go on the wire. The successful response also seeds
 * the per-id cache, so any later `lookupOsmElement(...)` call hits the
 * same cache instead of re-fetching.
 *
 * Returns a result for every input ref in the same order. Missing
 * elements (Nominatim returned no data) get an empty NominatimResult
 * so consumers don't have to worry about index drift.
 */
export async function lookupOsmElements(
  refs: Array<{ osmType: string; osmId: number }>,
): Promise<NominatimResult[]> {
  if (refs.length === 0) return [];

  const out: (NominatimResult | undefined)[] = new Array(refs.length);
  const todoIdxs: number[] = [];

  // Cache pass first — anything we already know skips the wire.
  for (let i = 0; i < refs.length; i++) {
    const { osmType, osmId } = refs[i];
    const cached = getCached<NominatimResult>(`lookup:${osmType}:${osmId}`);
    if (cached) out[i] = cached;
    else todoIdxs.push(i);
  }
  if (todoIdxs.length === 0) return out as NominatimResult[];

  // Nominatim caps `/lookup` at 50 ids per request; chunk and fan out.
  // Each chunk is a single throttle hit instead of 50.
  for (let start = 0; start < todoIdxs.length; start += 50) {
    const chunk = todoIdxs.slice(start, start + 50);
    const idsParam = chunk
      .map((i) => {
        const prefix = TYPE_PREFIX[refs[i].osmType];
        if (!prefix) throw new Error(`Unknown osm_type: ${refs[i].osmType}`);
        return `${prefix}${refs[i].osmId}`;
      })
      .join(",");

    const url = new URL(`${NOMINATIM_BASE}/lookup`, window.location.origin);
    url.searchParams.set("osm_ids", idsParam);
    url.searchParams.set("format", "json");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("extratags", "1");

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Nominatim error: ${res.status}`);
    const data: Array<Record<string, unknown>> = await res.json();

    // Index the response by osm_type:osm_id so we can map each input
    // ref back to its result regardless of Nominatim's response order.
    const byKey = new Map<string, Record<string, unknown>>();
    for (const r of data) {
      const k = `${String(r.osm_type)}:${Number(r.osm_id)}`;
      byKey.set(k, r);
    }

    for (const idx of chunk) {
      const { osmType, osmId } = refs[idx];
      const r = byKey.get(`${osmType}:${osmId}`);
      const result: NominatimResult = r
        ? {
            osm_type: (r.osm_type as string) || osmType,
            osm_id: r.osm_id ? Number(r.osm_id) : osmId,
            name: (r.name as string) || null,
            display_name: (r.display_name as string) || "",
            type: (r.type as string) || null,
            category:
              (r.category as string) || (r.class as string) || null,
            address: (r.address as Record<string, string>) ?? {},
            lat: r.lat ? Number(r.lat) : null,
            lon: r.lon ? Number(r.lon) : null,
            extratags:
              (r.extratags as Record<string, string>) ?? undefined,
          }
        : {
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
      setCache(`lookup:${osmType}:${osmId}`, result);
      out[idx] = result;
    }
  }

  return out as NominatimResult[];
}
