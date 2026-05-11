import {
  countTiles,
  estimateTilesBytes,
  tilesInBbox,
  type Bbox,
} from "./tiles";
import { putRegion, setRegionStatus } from "./regions";
import { putOfflineTiles } from "./offline-tiles";
import { getTileTemplate, tileUrlFor } from "./tile-source";
import type { Region, RegionTier } from "./db";

/**
 * Maximum tiles per region download. At ~18 KB per tile this caps a
 * single download around ~1.8 GB — enough for a small country at
 * street-level detail (Switzerland z=14 ≈ 50 k tiles ≈ 900 MB) or a
 * mid-size country at neighbourhood detail. Beyond this the SW
 * pre-warm approach gets too chatty against the upstream PMTiles
 * server; multi-GB extracts are the territory of the (future)
 * server-side `pmtiles extract` endpoint.
 */
const MAX_TILES = 100_000;

/** Hard ceiling beyond which the UI shouldn't even offer the zoom
 *  level. `z=15` of a country crosses into 100k+ tiles territory
 *  with the current approach. */
export const HARD_MAX_ZOOM = 14;

/** Soft threshold over which the UI shows a "this is a lot" warning
 *  even if the request still fits inside MAX_TILES. */
export const LARGE_DOWNLOAD_TILES = 25_000;

/** Bounded concurrency for the tile fetch loop. PMTiles JS already
 *  pools the underlying file directory, so the bottleneck is the
 *  upstream API. Eight in flight gets close to peak throughput while
 *  staying inside polite limits. */
const FETCH_CONCURRENCY = 8;

export interface DownloadRegionInput {
  /** Stable id (typically `${osm_type}:${osm_id}` from Nominatim). */
  id: string;
  /** Human-readable label shown in the regions list. */
  name: string;
  bbox: Bbox;
  tier: RegionTier;
  minZoom?: number;
  maxZoom?: number;
  /**
   * Bypass the soft MAX_TILES safety cap. The dialog lets the user
   * opt in to this after seeing the "Too large" warning — it's their
   * storage, their patience with the upstream, their call. Note that
   * the upstream's own rate limits still apply and will surface as
   * per-tile errors in the progress callback.
   */
  force?: boolean;
}

export interface DownloadProgress {
  done: number;
  total: number;
  errored: number;
  /** Real bytes written to IDB so far — for live size feedback. */
  bytesStored: number;
}

export interface DownloadResult {
  total: number;
  written: number;
  errored: number;
  abortedAt?: number;
  /** Real bytes written to IDB. */
  bytesStored: number;
}

export function planRegion(
  bbox: Bbox,
  minZoom: number,
  maxZoom: number,
): { tileCount: number; estimatedBytes: number; tooLarge: boolean } {
  const tileCount = countTiles(bbox, minZoom, maxZoom);
  return {
    tileCount,
    estimatedBytes: estimateTilesBytes(tileCount),
    tooLarge: tileCount > MAX_TILES,
  };
}

/**
 * Pre-warm the PMTiles range cache for a region by iterating every
 * tile in the bbox at zooms `minZoom`–`maxZoom` and asking the
 * PMTiles JS client to read each one. Each read issues a `Range:`
 * request against the upstream `.pmtiles` URL; the Workbox
 * `pmtiles-runtime` cache stores the response and serves it back
 * when MapLibre next asks for the same byte range.
 *
 * No new file lands in OPFS — the SW cache is the storage. The
 * upside: this works today without any backend changes. The
 * downside: clearing a single region cleanly is impossible (the
 * cache is LRU-evicted globally), and we hit the upstream more
 * than a server-side `pmtiles extract` would.
 */
export async function downloadRegion(
  input: DownloadRegionInput,
  callbacks: {
    onProgress?: (p: DownloadProgress) => void;
    signal?: AbortSignal;
  } = {},
): Promise<DownloadResult> {
  const minZoom = input.minZoom ?? 0;
  const maxZoom = input.maxZoom ?? 14;
  const { tileCount, estimatedBytes, tooLarge } = planRegion(
    input.bbox,
    minZoom,
    maxZoom,
  );
  if (tooLarge && !input.force) {
    throw new Error(
      `Region too large (${tileCount} tiles) — narrow the bbox, lower max zoom, or set force: true to override the soft cap.`,
    );
  }

  // Stage the region row up-front so the settings page can show the
  // pending row immediately. The `pmtilesPath` stays empty because
  // we're storing in the SW cache, not OPFS (yet).
  const region: Region = {
    id: input.id,
    name: input.name,
    bbox: [input.bbox.west, input.bbox.south, input.bbox.east, input.bbox.north],
    tier: input.tier,
    pmtilesPath: "",
    sizeBytes: estimatedBytes,
    downloadedAt: Date.now(),
    lastUpdatedAt: Date.now(),
    status: "downloading",
  };
  await putRegion(region);

  // Resolve the upstream tile URL template (`https://.../{z}/{x}/{y}.mvt?key=...`).
  // Protomaps' hosted API doesn't serve a single .pmtiles file —
  // tiles are individual MVT URLs declared in the TileJSON. Cached
  // process-wide so subsequent region downloads reuse the resolution.
  let tileTemplate: string;
  try {
    tileTemplate = await getTileTemplate();
  } catch (err) {
    await setRegionStatus(input.id, "error", String(err));
    throw err;
  }

  const queue: Array<[number, number, number]> = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    queue.push(...tilesInBbox(input.bbox, z));
  }
  const total = queue.length;

  // Coalesced bytes-to-write buffer. Each worker pushes successful
  // tile reads; a flusher task drains it in batches so we get the
  // amortized cost of one IDB tx per ~256 tiles rather than one per
  // tile. Critical for big regions — single-tile transactions chew
  // through wall-clock time.
  const BATCH_SIZE = 256;
  type Pending = { z: number; x: number; y: number; bytes: Uint8Array };
  const pendingWrites: Pending[] = [];
  let bytesStored = 0;
  let writeError: unknown = null;

  const flushPending = async (force: boolean) => {
    if (writeError) return;
    if (!force && pendingWrites.length < BATCH_SIZE) return;
    const batch = pendingWrites.splice(0, pendingWrites.length);
    if (batch.length === 0) return;
    try {
      await putOfflineTiles(batch);
      for (const t of batch) bytesStored += t.bytes.byteLength;
    } catch (err) {
      writeError = err;
    }
  };

  let done = 0;
  let errored = 0;
  const workers = Array.from({ length: FETCH_CONCURRENCY }, async () => {
    while (queue.length > 0) {
      if (callbacks.signal?.aborted) return;
      const next = queue.shift();
      if (!next) return;
      const [z, x, y] = next;
      try {
        const url = tileUrlFor(tileTemplate, z, x, y);
        const res = await fetch(url, { signal: callbacks.signal });
        if (res.ok) {
          const buf = await res.arrayBuffer();
          if (buf.byteLength > 0) {
            const bytes = new Uint8Array(buf.byteLength);
            bytes.set(new Uint8Array(buf));
            pendingWrites.push({ z, x, y, bytes });
            if (pendingWrites.length >= BATCH_SIZE) {
              await flushPending(false);
            }
          }
        } else if (res.status !== 404) {
          // 404 = out-of-coverage tile (normal). Anything else is
          // worth counting as an error so the user sees something
          // went wrong.
          errored += 1;
        }
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        errored += 1;
      }
      done += 1;
      callbacks.onProgress?.({
        done,
        total,
        errored,
        bytesStored,
      });
    }
  });

  try {
    await Promise.all(workers);
  } catch (err) {
    await setRegionStatus(input.id, "error", String(err));
    throw err;
  }

  // Drain the last partial batch.
  await flushPending(true);
  if (writeError) {
    await setRegionStatus(input.id, "error", String(writeError));
    throw writeError;
  }

  if (callbacks.signal?.aborted) {
    await setRegionStatus(input.id, "error", "Cancelled");
    return {
      total,
      written: done - errored,
      errored,
      abortedAt: done,
      bytesStored,
    };
  }

  region.status = "ready";
  region.lastUpdatedAt = Date.now();
  // Use the real number of bytes we actually stored, not the per-tile
  // estimate — so the settings page reflects on-disk reality.
  region.sizeBytes = bytesStored;
  await putRegion(region);

  return { total, written: done - errored, errored, bytesStored };
}
