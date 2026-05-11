import { PMTiles } from "pmtiles";
import {
  countTiles,
  estimateTilesBytes,
  tilesInBbox,
  type Bbox,
} from "./tiles";
import { putRegion, setRegionStatus } from "./regions";
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
  /** PMTiles URL — usually `config.protomaps.url`. */
  pmtilesUrl: string;
  minZoom?: number;
  maxZoom?: number;
}

export interface DownloadProgress {
  done: number;
  total: number;
  errored: number;
}

export interface DownloadResult {
  total: number;
  written: number;
  errored: number;
  abortedAt?: number;
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
  if (tooLarge) {
    throw new Error(
      `Region too large (${tileCount} tiles) — narrow the bbox or lower max zoom.`,
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

  const pm = new PMTiles(input.pmtilesUrl);
  // Read the header so we don't try to fetch tiles past the archive's
  // own max zoom — Protomaps caps at z=15.
  let archiveMaxZoom = maxZoom;
  try {
    const header = await pm.getHeader();
    archiveMaxZoom = Math.min(maxZoom, header.maxZoom);
  } catch {
    // Header fetch failures still let us try the tiles — getZxy will
    // either succeed or throw individually.
  }

  const queue: Array<[number, number, number]> = [];
  for (let z = minZoom; z <= archiveMaxZoom; z++) {
    queue.push(...tilesInBbox(input.bbox, z));
  }
  const total = queue.length;

  let done = 0;
  let errored = 0;
  const workers = Array.from({ length: FETCH_CONCURRENCY }, async () => {
    while (queue.length > 0) {
      if (callbacks.signal?.aborted) return;
      const next = queue.shift();
      if (!next) return;
      const [z, x, y] = next;
      try {
        await pm.getZxy(z, x, y, callbacks.signal);
      } catch {
        // Out-of-coverage or transient HTTP — count and move on.
        errored += 1;
      }
      done += 1;
      callbacks.onProgress?.({ done, total, errored });
    }
  });

  try {
    await Promise.all(workers);
  } catch (err) {
    await setRegionStatus(input.id, "error", String(err));
    throw err;
  }

  if (callbacks.signal?.aborted) {
    await setRegionStatus(input.id, "error", "Cancelled");
    return { total, written: done - errored, errored, abortedAt: done };
  }

  region.status = "ready";
  region.lastUpdatedAt = Date.now();
  region.sizeBytes = estimateTilesBytes(done - errored);
  await putRegion(region);

  return { total, written: done - errored, errored };
}
