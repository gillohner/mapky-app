import { getDB, type OfflineTile } from "./db";

/**
 * IDB tile cache. Region downloads write here, the custom pmtiles
 * MapLibre protocol reads from here before falling through to the
 * upstream PMTiles archive. Keyed by `[z, x, y]` so overlapping
 * region downloads don't duplicate storage.
 */

export async function putOfflineTile(
  z: number,
  x: number,
  y: number,
  bytes: Uint8Array,
): Promise<void> {
  const db = await getDB();
  await db.put("offline_tiles", {
    z,
    x,
    y,
    bytes,
    sizeBytes: bytes.byteLength,
    storedAt: Date.now(),
  });
}

/** Bulk write — used by `downloadRegion` to amortize tx overhead. */
export async function putOfflineTiles(
  tiles: Array<{ z: number; x: number; y: number; bytes: Uint8Array }>,
): Promise<void> {
  if (tiles.length === 0) return;
  const db = await getDB();
  const tx = db.transaction("offline_tiles", "readwrite");
  const now = Date.now();
  await Promise.all([
    ...tiles.map((t) =>
      tx.store.put({
        z: t.z,
        x: t.x,
        y: t.y,
        bytes: t.bytes,
        sizeBytes: t.bytes.byteLength,
        storedAt: now,
      }),
    ),
    tx.done,
  ]);
}

export async function getOfflineTile(
  z: number,
  x: number,
  y: number,
): Promise<OfflineTile | undefined> {
  const db = await getDB();
  return db.get("offline_tiles", [z, x, y]);
}

export async function countOfflineTiles(): Promise<number> {
  const db = await getDB();
  return db.count("offline_tiles");
}

/**
 * Cumulative size of every stored tile. Cheap-ish — iterates the store
 * once. Used by the settings page to surface a "real" size for the
 * offline-tiles section rather than the per-tile estimate.
 */
export async function totalOfflineTilesBytes(): Promise<number> {
  const db = await getDB();
  const tx = db.transaction("offline_tiles", "readonly");
  let total = 0;
  let cursor = await tx.store.openCursor();
  while (cursor) {
    total += cursor.value.sizeBytes;
    cursor = await cursor.continue();
  }
  return total;
}

export async function clearAllOfflineTiles(): Promise<void> {
  const db = await getDB();
  await db.clear("offline_tiles");
}
