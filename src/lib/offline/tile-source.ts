import { config } from "@/lib/config";

/**
 * Resolve the upstream tile URL template Protomaps' hosted API uses.
 *
 * The hosted endpoint at `api.protomaps.com/tiles/v4.pmtiles` 404s —
 * Protomaps serves tiles individually via a TileJSON manifest, not a
 * single byte-range archive. We fetch the TileJSON once and cache the
 * `tiles[0]` URL template (something like
 * `https://api.protomaps.com/tiles/v4/{z}/{x}/{y}.mvt?key=...`).
 *
 * Both `region-download` and the offline `mapky-tile` MapLibre
 * protocol fall back to this template for cache-miss network reads,
 * so a single resolution feeds the whole offline path.
 */

let templatePromise: Promise<string> | null = null;

function buildTileJsonUrl(): string {
  const base = config.protomaps.url; // e.g. https://api.protomaps.com/tiles/v4.pmtiles
  // Swap a trailing `.pmtiles` suffix for `.json` (the TileJSON). If
  // the configured URL already points at a TileJSON (`.json`) leave
  // it alone. This keeps the env-var contract backwards-compatible
  // even though `config.protomaps.url` was historically named after
  // the (nonexistent) pmtiles archive.
  const swapped = base.replace(/\.pmtiles(\?|$)/, ".json$1");
  const key = config.protomaps.key;
  if (!key) return swapped;
  return swapped.includes("?") ? `${swapped}&key=${key}` : `${swapped}?key=${key}`;
}

export async function getTileTemplate(): Promise<string> {
  if (templatePromise) return templatePromise;
  templatePromise = (async () => {
    const url = buildTileJsonUrl();
    const res = await fetch(url);
    if (!res.ok) {
      templatePromise = null;
      throw new Error(`TileJSON fetch failed: ${res.status}`);
    }
    const json = (await res.json()) as { tiles?: string[] };
    const tpl = json.tiles?.[0];
    if (!tpl) {
      templatePromise = null;
      throw new Error("TileJSON has no tiles[] entry");
    }
    return tpl;
  })();
  return templatePromise;
}

/** Substitute {z}/{x}/{y} into the cached template. */
export function tileUrlFor(
  template: string,
  z: number,
  x: number,
  y: number,
): string {
  return template
    .replace("{z}", String(z))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
}

/**
 * Pull (z, x, y) back out of an arbitrary upstream tile URL. Tolerates
 * variations in extension (`.mvt`, `.pbf`, none) and query strings,
 * so the `transformRequest` hook works regardless of what Protomaps
 * decides to do with its URL shape.
 */
export function parseTileCoordFromUpstream(
  url: string,
): { z: number; x: number; y: number } | null {
  // Drop the query string and any extension before matching.
  const path = url.split("?")[0].replace(/\.(mvt|pbf)$/i, "");
  const m = path.match(/\/(\d+)\/(\d+)\/(\d+)$/);
  if (!m) return null;
  const z = Number(m[1]);
  const x = Number(m[2]);
  const y = Number(m[3]);
  if (!Number.isFinite(z) || !Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return { z, x, y };
}
