import { getDB, type RouteCacheEntry } from "./db";

/**
 * Build a stable hash for a routing request so identical inputs map
 * to the same cache key regardless of object key order. Uses a JSON
 * canonicalization + SubtleCrypto SHA-256 → hex slice. Long enough to
 * avoid collisions in practice, short enough to be readable in devtools.
 */
export async function hashRouteRequest(input: {
  waypoints: Array<{ lat: number; lon: number }>;
  activity: string;
  preferences?: unknown;
}): Promise<string> {
  const canonical = JSON.stringify({
    a: input.activity,
    p: input.preferences ?? null,
    w: input.waypoints.map((w) => [
      Math.round(w.lat * 1e6) / 1e6,
      Math.round(w.lon * 1e6) / 1e6,
    ]),
  });
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 24);
}

const MAX_ENTRIES = 200;

export async function getCachedRoute(
  key: string,
): Promise<RouteCacheEntry | undefined> {
  const db = await getDB();
  const entry = await db.get("routes_cache", key);
  if (!entry) return undefined;
  entry.accessedAt = Date.now();
  await db.put("routes_cache", entry);
  return entry;
}

export async function putCachedRoute(
  entry: Omit<RouteCacheEntry, "createdAt" | "accessedAt"> & {
    createdAt?: number;
    accessedAt?: number;
  },
): Promise<void> {
  const db = await getDB();
  const now = Date.now();
  await db.put("routes_cache", {
    ...entry,
    createdAt: entry.createdAt ?? now,
    accessedAt: entry.accessedAt ?? now,
  });
  await evictIfNeeded();
}

async function evictIfNeeded(): Promise<void> {
  const db = await getDB();
  const count = await db.count("routes_cache");
  if (count <= MAX_ENTRIES) return;
  // Evict the least-recently-accessed entries until we're back under cap.
  const tx = db.transaction("routes_cache", "readwrite");
  const idx = tx.store.index("by-accessedAt");
  let cursor = await idx.openCursor();
  let toEvict = count - MAX_ENTRIES;
  while (cursor && toEvict > 0) {
    await cursor.delete();
    toEvict -= 1;
    cursor = await cursor.continue();
  }
  await tx.done;
}
