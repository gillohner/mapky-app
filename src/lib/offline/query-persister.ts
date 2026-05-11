import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import {
  experimental_createQueryPersister,
  type AsyncStorage,
} from "@tanstack/react-query-persist-client";

/**
 * Per-query IndexedDB persister for the TanStack Query cache.
 *
 * Uses the experimental per-query API (one entry per queryHash) rather
 * than the older "dump the whole client" persister — much cheaper at
 * scale because high-churn queries only rewrite their own entry.
 *
 * Persistence is opt-in: only queries with `meta.persist === true`
 * are mirrored to IDB. That keeps short-lived queries (viewport pans,
 * search-as-you-type) out of storage while still buying us offline
 * detail-page reads.
 *
 * Separate DB from `mapky-offline` because the query cache turns over
 * far more often than the offline data and we don't want long-running
 * write transactions on the same connection.
 */

interface QueryPersistDB extends DBSchema {
  cache: { key: string; value: string };
}

const DB_NAME = "mapky-query-cache";
const DB_VERSION = 1;
/** Bumped to invalidate every persisted query when the on-disk shape changes. */
const BUSTER = "v1";

let dbPromise: Promise<IDBPDatabase<QueryPersistDB>> | null = null;

function getDB(): Promise<IDBPDatabase<QueryPersistDB>> {
  if (dbPromise) return dbPromise;
  dbPromise = openDB<QueryPersistDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("cache")) {
        db.createObjectStore("cache");
      }
    },
  });
  return dbPromise;
}

export const idbStorage: AsyncStorage<string> = {
  async getItem(key) {
    const db = await getDB();
    return (await db.get("cache", key)) ?? null;
  },
  async setItem(key, value) {
    const db = await getDB();
    await db.put("cache", value, key);
  },
  async removeItem(key) {
    const db = await getDB();
    await db.delete("cache", key);
  },
};

export const queryPersister = experimental_createQueryPersister<string>({
  storage: idbStorage,
  buster: BUSTER,
  maxAge: 1000 * 60 * 60 * 24 * 14, // 14 days
  prefix: "mapky-query",
  filters: {
    // Opt-in: only queries explicitly marked `meta.persist = true`
    // are written to IDB. Detail pages set this; viewport queries
    // (which churn on every pan) do not.
    predicate: (query) => query.meta?.persist === true,
  },
});
