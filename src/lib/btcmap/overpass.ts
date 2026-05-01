import { config } from "@/lib/config";
import type { ViewportBounds } from "@/types/mapky";

/**
 * BTCMap-style Bitcoin acceptance lookup against OSM via Overpass.
 *
 * Overpass is the same data as Nominatim (live OSM), so adding a
 * Bitcoin layer this way keeps OSM as our single source of truth and
 * avoids a third-party dependency on btcmap.org's API. The tag schema
 * follows the BTCMap Supertagger guide:
 *
 *   currency:XBT=yes                    — Bitcoin accepted (any kind)
 *   payment:onchain=yes                 — on-chain payments
 *   payment:lightning=yes               — Lightning payments
 *   payment:lightning_contactless=yes   — NFC Lightning
 *   payment:bitcoin=yes                 — legacy: implies XBT + onchain
 */

/**
 * Public Overpass interpreter by default (rate-limited per IP). Set
 * `VITE_OVERPASS_URL` to point at your own mirror for production.
 */
const OVERPASS_URL = config.overpass.url;

export interface BitcoinPoi {
  osmType: "node" | "way" | "relation";
  osmId: number;
  lat: number;
  lon: number;
  /** Place name from `name` tag, if present. */
  name: string | null;
  onchain: boolean;
  lightning: boolean;
  lightningContactless: boolean;
}

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements?: OverpassElement[];
}

/**
 * Fetch Bitcoin-accepting POIs in a bbox from Overpass. Throws on
 * network errors. Aborts cleanly via the passed signal.
 */
export async function fetchBitcoinPois(
  bbox: ViewportBounds,
  signal?: AbortSignal,
): Promise<BitcoinPoi[]> {
  // Two queries OR'd: the modern `currency:XBT=yes` plus the legacy
  // `payment:bitcoin=yes` (still very common in older entries). De-dupe
  // by osm_type:osm_id below.
  const bb = `${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon}`;
  const query = `[out:json][timeout:25];
(
  nwr["currency:XBT"="yes"](${bb});
  nwr["payment:bitcoin"="yes"](${bb});
);
out center tags;`;

  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
    signal,
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}`);

  const json = (await res.json()) as OverpassResponse;
  const seen = new Set<string>();
  const out: BitcoinPoi[] = [];

  for (const el of json.elements ?? []) {
    const lat = el.type === "node" ? el.lat : el.center?.lat;
    const lon = el.type === "node" ? el.lon : el.center?.lon;
    if (lat == null || lon == null) continue;

    const key = `${el.type}:${el.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const tags = el.tags ?? {};
    const legacy = tags["payment:bitcoin"] === "yes";

    out.push({
      osmType: el.type,
      osmId: el.id,
      lat,
      lon,
      name: tags.name ?? null,
      onchain: tags["payment:onchain"] === "yes" || legacy,
      lightning: tags["payment:lightning"] === "yes",
      lightningContactless: tags["payment:lightning_contactless"] === "yes",
    });
  }

  return out;
}

/**
 * Read the BTCMap-style payment-type flags off a raw OSM tag map (e.g.
 * what Nominatim returns via `extratags=1`). Returns null when the
 * location doesn't accept Bitcoin at all so the place card can hide
 * the badge row entirely.
 */
export interface BitcoinAcceptanceFlags {
  /** True when any of the Bitcoin tags are present. */
  any: boolean;
  onchain: boolean;
  lightning: boolean;
  lightningContactless: boolean;
}

export function readBitcoinAcceptance(
  tags: Record<string, string> | undefined,
): BitcoinAcceptanceFlags | null {
  if (!tags) return null;
  const xbt = tags["currency:XBT"] === "yes";
  const legacy = tags["payment:bitcoin"] === "yes";
  if (!xbt && !legacy) return null;

  return {
    any: true,
    onchain: tags["payment:onchain"] === "yes" || legacy,
    lightning: tags["payment:lightning"] === "yes",
    lightningContactless: tags["payment:lightning_contactless"] === "yes",
  };
}
