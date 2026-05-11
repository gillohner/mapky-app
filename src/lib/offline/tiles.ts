/**
 * XYZ tile helpers — converting between geographic coordinates and
 * web-mercator tile indices, and enumerating tiles inside a bbox.
 *
 * Spec: https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames
 */

export type Tile = [z: number, x: number, y: number];

export interface Bbox {
  /** Western longitude. */
  west: number;
  /** Southern latitude. */
  south: number;
  /** Eastern longitude. */
  east: number;
  /** Northern latitude. */
  north: number;
}

/** Clamp the output to `[0, 2^z - 1]` so an east-of-180 longitude or
 *  north-of-85.05 latitude doesn't yield an out-of-range tile id. */
function clampTile(v: number, z: number): number {
  const max = 2 ** z - 1;
  if (v < 0) return 0;
  if (v > max) return max;
  return v;
}

export function lonToTileX(lon: number, z: number): number {
  return clampTile(Math.floor(((lon + 180) / 360) * 2 ** z), z);
}

export function latToTileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return clampTile(
    Math.floor(
      ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
        2 ** z,
    ),
    z,
  );
}

/**
 * Enumerate every (z, x, y) tile that intersects the bbox at the given
 * zoom. The bbox is clamped to [-180,180] × [-85.05,85.05] (Web
 * Mercator's valid range) so callers passing nominatim's "boundingbox"
 * don't blow up at the poles.
 */
export function tilesInBbox(bbox: Bbox, z: number): Tile[] {
  const west = Math.max(-180, bbox.west);
  const east = Math.min(180, bbox.east);
  const south = Math.max(-85.05112878, bbox.south);
  const north = Math.min(85.05112878, bbox.north);

  const xMin = lonToTileX(west, z);
  const xMax = lonToTileX(east, z);
  // Note: latitude increases northward but tile y increases southward,
  // so the *northern* edge maps to the smaller y.
  const yMin = latToTileY(north, z);
  const yMax = latToTileY(south, z);

  const tiles: Tile[] = [];
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) {
      tiles.push([z, x, y]);
    }
  }
  return tiles;
}

/**
 * Count tiles across a zoom range — used by the size estimator before
 * we kick off a download so the user can decide whether the region
 * fits in their browser's storage budget.
 */
export function countTiles(
  bbox: Bbox,
  minZoom: number,
  maxZoom: number,
): number {
  let total = 0;
  for (let z = minZoom; z <= maxZoom; z++) {
    total += tilesInBbox(bbox, z).length;
  }
  return total;
}

/**
 * Coarse byte-size estimate. Protomaps vector tiles average around
 * 20 KB at urban density and far less in sparse areas. Multiplying by
 * a single constant under-estimates dense cities and over-estimates
 * countryside, but it's accurate enough for a download warning.
 */
export function estimateTilesBytes(tileCount: number): number {
  const AVG_TILE_BYTES = 18 * 1024;
  return tileCount * AVG_TILE_BYTES;
}
