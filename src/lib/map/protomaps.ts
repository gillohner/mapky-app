import { Protocol } from "pmtiles";
import maplibregl from "maplibre-gl";
import { getOfflineTile } from "@/lib/offline/offline-tiles";

let protocolAdded = false;

/**
 * Register the MapLibre `pmtiles://` protocol with an offline-aware
 * wrapper. The Protomaps TileJSON serves tiles through this protocol
 * (the TileJSON's `tiles` array points to a `pmtiles://...` URL), so
 * MapLibre calls our handler once per tile.
 *
 * The wrapper:
 *   1. Parses the requested (z, x, y) out of the URL.
 *   2. If we have that tile cached in IDB (a region download wrote
 *      it), returns the bytes immediately — works offline, faster
 *      online.
 *   3. Otherwise falls through to the standard pmtiles handler,
 *      which does the byte-range fetch from the upstream archive.
 *
 * Idempotent — registering twice is a no-op.
 */
export function addProtomapsProtocol() {
  if (protocolAdded) return;
  const upstream = new Protocol();
  maplibregl.addProtocol("pmtiles", async (params, abortController) => {
    const tile = parseTileCoord(params.url);
    if (tile) {
      try {
        const cached = await getOfflineTile(tile.z, tile.x, tile.y);
        if (cached) {
          // MapLibre's protocol contract: return ArrayBufferLike for
          // the tile body. Copy through a fresh ArrayBuffer so the
          // typed-array view of an IDB-backed buffer doesn't leak
          // its backing store back into the caller.
          const buf = new ArrayBuffer(cached.bytes.byteLength);
          new Uint8Array(buf).set(cached.bytes);
          return { data: buf };
        }
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn("[pmtiles] offline tile lookup failed", err);
        }
      }
    }
    return upstream.tile(params, abortController);
  });
  protocolAdded = true;
}

/**
 * MapLibre invokes the pmtiles protocol with URLs shaped like
 *   `pmtiles://https://.../v4.pmtiles?key=ABC/14/8512/5808`
 * (plus an optional `.mvt` suffix on some backends). Pull the trailing
 * `/z/x/y` segment out. Returns null if the URL doesn't end with three
 * integers — defensive against future changes in pmtiles JS.
 */
function parseTileCoord(
  url: string,
): { z: number; x: number; y: number } | null {
  // Strip optional extension on the last segment.
  const cleaned = url.replace(/\.(mvt|pbf)$/i, "");
  const parts = cleaned.split("/");
  if (parts.length < 3) return null;
  const y = Number(parts[parts.length - 1]);
  const x = Number(parts[parts.length - 2]);
  const z = Number(parts[parts.length - 3]);
  if (!Number.isFinite(z) || !Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return { z, x, y };
}
