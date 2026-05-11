import {
  getCached,
  setCache,
  makeReverseKey,
  makeSearchKey,
} from "./nominatim-cache";
import { nexusClient } from "./client";

/**
 * All Nominatim traffic now flows through pubky-nexus's cached proxy
 * (`/v0/mapky/osm/{lookup,search,reverse}`). The plugin holds a Redis
 * cache (30 d for hits, 6 h for misses) and serializes upstream calls
 * through a 1 req/s gate, so multiple users sharing a query only cost
 * one upstream request total.
 *
 * The frontend keeps its localStorage 2nd-tier cache (`./nominatim-cache`)
 * for offline PWA use and to skip the network entirely on warm reloads.
 */

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

  // Plugin returns 404 when Nominatim has nothing — surface as an
  // empty NominatimResult so callers don't have to handle Axios errors
  // for the "no place here" case (matches the prior behavior).
  const result = await fetchPluginNominatim<NominatimResult>(
    "/v0/mapky/osm/reverse",
    { lat, lon, zoom: 18 },
  );
  if (!result) {
    const empty: NominatimResult = {
      osm_type: null,
      osm_id: null,
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

  const data = await fetchPluginSearch({
    q: name,
    viewbox,
    bounded: true,
    limit: 1,
    dedupe: true,
    addressdetails: true,
  });
  if (!data.length) {
    setCache(cacheKey, null);
    return null;
  }

  const r = data[0];
  const result: NominatimResult = {
    osm_type: r.osm_type ?? null,
    osm_id: r.osm_id ?? null,
    name: r.name || r.display_name?.split(",")[0] || null,
    display_name: r.display_name || "",
    type: r.type ?? null,
    category: r.category ?? null,
    address: r.address ?? {},
    lat: r.lat ?? null,
    lon: r.lon ?? null,
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
  /**
   * `[south, north, west, east]` in decimal degrees. Set when the
   * underlying OSM element has an administrative boundary (countries,
   * states, cities, neighbourhoods). Absent for single-node POIs.
   */
  boundingbox?: [number, number, number, number];
}

export async function searchPlaces(
  query: string,
): Promise<NominatimSearchResult[]> {
  const cacheKey = makeSearchKey(query);
  const cached = getCached<NominatimSearchResult[]>(cacheKey);
  if (cached) return cached;

  // Route through the plugin's cached /osm/search proxy. Adopt the
  // limit master raised from 8 → 20 (richer search hit list).
  const data = await fetchPluginSearch({
    q: query,
    limit: 20,
    dedupe: true,
    addressdetails: false,
  });
  const results = parseSearchResults(data);
  setCache(cacheKey, results);
  return results;
}

function parseSearchResults(data: PluginNominatimRow[]): NominatimSearchResult[] {
  return data
    .map((r) => {
      const lat = r.lat ?? Number.NaN;
      const lon = r.lon ?? Number.NaN;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      const bb =
        Array.isArray(r.boundingbox) && r.boundingbox.length === 4
          ? ([
              r.boundingbox[0],
              r.boundingbox[1],
              r.boundingbox[2],
              r.boundingbox[3],
            ] as [number, number, number, number])
          : undefined;
      return {
        osm_type: r.osm_type ?? "",
        osm_id: r.osm_id ?? 0,
        name: r.name || r.display_name?.split(",")[0] || "",
        display_name: r.display_name || "",
        type: r.type ?? "",
        category: r.category ?? "",
        lat,
        lon,
        ...(bb && { boundingbox: bb }),
      } satisfies NominatimSearchResult;
    })
    .filter((r): r is NominatimSearchResult => r !== null);
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

  const data = await fetchPluginSearch({
    q: query,
    viewbox: vb,
    bounded: true,
    limit,
    dedupe: true,
    addressdetails: false,
  });
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

  // Routes through the plugin's cached endpoint instead of public
  // Nominatim — addressdetails + extratags are always returned by
  // the plugin, no query params needed beyond `osm_ids`.
  const { data } = await nexusClient.get<PluginNominatimRow[]>(
    "/v0/mapky/osm/lookup",
    { params: { osm_ids: `${prefix}${osmId}` } },
  );
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
    osm_type: r.osm_type ?? osmType,
    osm_id: r.osm_id ?? osmId,
    name: r.name ?? null,
    display_name: r.display_name ?? "",
    type: r.type ?? null,
    category: r.category ?? null,
    address: r.address ?? {},
    lat: r.lat ?? null,
    lon: r.lon ?? null,
    extratags: r.extratags,
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

  // Plugin endpoint accepts up to 50 osm_ids per call (matches
  // Nominatim's upstream cap). Each chunk is one Redis-cached call
  // → at most 1 upstream Nominatim hit shared across all our users
  // for the full 30 d TTL window.
  for (let start = 0; start < todoIdxs.length; start += 50) {
    const chunk = todoIdxs.slice(start, start + 50);
    const idsParam = chunk
      .map((i) => {
        const prefix = TYPE_PREFIX[refs[i].osmType];
        if (!prefix) throw new Error(`Unknown osm_type: ${refs[i].osmType}`);
        return `${prefix}${refs[i].osmId}`;
      })
      .join(",");

    const { data } = await nexusClient.get<PluginNominatimRow[]>(
      "/v0/mapky/osm/lookup",
      { params: { osm_ids: idsParam } },
    );

    // Index the response by osm_type:osm_id so we can map each input
    // ref back to its result regardless of Nominatim's response order.
    const byKey = new Map<string, PluginNominatimRow>();
    for (const r of data) {
      if (r.osm_type != null && r.osm_id != null) {
        byKey.set(`${r.osm_type}:${r.osm_id}`, r);
      }
    }

    for (const idx of chunk) {
      const { osmType, osmId } = refs[idx];
      const r = byKey.get(`${osmType}:${osmId}`);
      const result: NominatimResult = r
        ? {
            osm_type: r.osm_type ?? osmType,
            osm_id: r.osm_id ?? osmId,
            name: r.name ?? null,
            display_name: r.display_name ?? "",
            type: r.type ?? null,
            category: r.category ?? null,
            address: r.address ?? {},
            lat: r.lat ?? null,
            lon: r.lon ?? null,
            extratags: r.extratags,
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

// ── Plugin client helpers ──────────────────────────────────────────────

/** Wire shape served by `/v0/mapky/osm/{lookup,search,reverse}`. */
interface PluginNominatimRow {
  osm_type: string | null;
  osm_id: number | null;
  name: string | null;
  display_name: string;
  type: string | null;
  category: string | null;
  address?: Record<string, string>;
  lat: number | null;
  lon: number | null;
  extratags?: Record<string, string>;
  /** `[south, north, west, east]` decimal degrees. Plumbed through
   *  from Nominatim's admin-boundary results. */
  boundingbox?: [number, number, number, number] | null;
}

interface PluginSearchParams {
  q: string;
  viewbox?: string;
  bounded?: boolean;
  limit?: number;
  dedupe?: boolean;
  addressdetails?: boolean;
}

/**
 * Fetch a single record from a plugin endpoint that returns a single
 * `NominatimLookup` (or 404). Returns `null` on 404 so callers can
 * cache the miss; throws on other errors.
 */
async function fetchPluginNominatim<T>(
  path: string,
  params: Record<string, unknown>,
): Promise<T | null> {
  try {
    const { data } = await nexusClient.get<T>(path, { params });
    return data;
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "response" in err &&
      (err as { response?: { status?: number } }).response?.status === 404
    ) {
      return null;
    }
    throw err;
  }
}

/** Fetch a `/v0/mapky/osm/search` result list. */
async function fetchPluginSearch(
  params: PluginSearchParams,
): Promise<PluginNominatimRow[]> {
  const { data } = await nexusClient.get<PluginNominatimRow[]>(
    "/v0/mapky/osm/search",
    { params },
  );
  return data;
}
