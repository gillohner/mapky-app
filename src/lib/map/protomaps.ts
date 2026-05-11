import maplibregl from "maplibre-gl";
import { getOfflineTile } from "@/lib/offline/offline-tiles";
import {
  getTileTemplate,
  parseTileCoordFromUpstream,
  tileUrlFor,
} from "@/lib/offline/tile-source";

const CUSTOM_SCHEME = "mapky-tile";
let protocolAdded = false;

/**
 * Wire MapLibre into the offline tile cache.
 *
 * Protomaps' hosted API serves tiles as individual `.mvt` URLs from
 * a TileJSON, *not* via the pmtiles archive protocol — so we can't
 * just `addProtocol("pmtiles", ...)`. Instead we register a custom
 * `mapky-tile://` scheme and use MapLibre's `transformRequest` (set
 * on the map by MapView) to rewrite upstream Protomaps tile URLs
 * into our scheme. The protocol handler then:
 *
 *   1. Looks up the (z, x, y) in IDB and returns those bytes if a
 *      region download has stored them.
 *   2. Otherwise reconstructs the real upstream URL from the cached
 *      TileJSON template and forwards the fetch — same on-the-wire
 *      behaviour as the unmodified source, but a single place that
 *      MapLibre's loader can be intercepted offline.
 *
 * The protocol is registered idempotently so re-mounting the map
 * (e.g. on basemap change) is a no-op.
 */
export function registerOfflineTileProtocol() {
  if (protocolAdded) return;
  maplibregl.addProtocol(CUSTOM_SCHEME, async (params, abortController) => {
    const tile = parseSchemeUrl(params.url);
    if (!tile) {
      throw new Error(`Invalid ${CUSTOM_SCHEME} URL: ${params.url}`);
    }
    // 1) Local cache — every region download writes here.
    try {
      const cached = await getOfflineTile(tile.z, tile.x, tile.y);
      if (cached) {
        const buf = new ArrayBuffer(cached.bytes.byteLength);
        new Uint8Array(buf).set(cached.bytes);
        return { data: buf };
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn("[offline-tile] IDB lookup failed", err);
      }
    }
    // 2) Network fall-through. Reuse the cached TileJSON template
    //    so we don't re-derive the URL shape on every tile.
    const template = await getTileTemplate();
    const upstream = tileUrlFor(template, tile.z, tile.x, tile.y);
    const res = await fetch(upstream, { signal: abortController?.signal });
    if (!res.ok) {
      throw new Error(`Tile ${tile.z}/${tile.x}/${tile.y}: ${res.status}`);
    }
    const buf = await res.arrayBuffer();
    return { data: buf };
  });
  protocolAdded = true;
}

/**
 * `transformRequest` hook for `new maplibregl.Map()`. Rewrites any
 * tile fetch whose URL exposes a `/{z}/{x}/{y}` segment into our
 * custom scheme so the protocol handler above can intercept it.
 *
 * Returning `{ url }` unchanged for everything else preserves the
 * default behaviour — TileJSON fetches, glyph PBFs, sprite assets
 * etc. continue to flow normally.
 */
export function offlineTileTransformRequest(
  url: string,
  resourceType?: string,
): { url: string } {
  if (resourceType === "Tile") {
    const coord = parseTileCoordFromUpstream(url);
    if (coord) {
      return {
        url: `${CUSTOM_SCHEME}://${coord.z}/${coord.x}/${coord.y}`,
      };
    }
  }
  return { url };
}

function parseSchemeUrl(
  url: string,
): { z: number; x: number; y: number } | null {
  const prefix = `${CUSTOM_SCHEME}://`;
  if (!url.startsWith(prefix)) return null;
  const parts = url.slice(prefix.length).split("/").filter(Boolean);
  if (parts.length !== 3) return null;
  const z = Number(parts[0]);
  const x = Number(parts[1]);
  const y = Number(parts[2]);
  if (!Number.isFinite(z) || !Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return { z, x, y };
}
