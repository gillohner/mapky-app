import { openDB, type DBSchema, type IDBPDatabase } from "idb";

/**
 * The single IndexedDB database used for all of Mapky's offline state.
 * Object stores are partitioned by concern:
 *
 *   - `regions` — downloaded offline regions (metadata + OPFS pointer)
 *   - `own_resources` — eager-mirrored user-owned MapKy data
 *   - `outbox` — pending writes to replay when back online
 *   - `routes_cache` — persisted Valhalla snapped routes
 *
 * Stored separately from the TanStack Query persister DB so the
 * hot-path query cache doesn't fight for the same connection.
 */

export type RegionTier = "basic" | "standard" | "full";

export type RegionStatus =
  | "pending"
  | "downloading"
  | "ready"
  | "stale"
  | "error";

export interface Region {
  id: string;
  name: string;
  /** [minLon, minLat, maxLon, maxLat] */
  bbox: [number, number, number, number];
  tier: RegionTier;
  /** OPFS path of the region's pmtiles file (empty until ready). */
  pmtilesPath: string;
  sizeBytes: number;
  downloadedAt: number;
  lastUpdatedAt: number;
  mapkyDataAt?: number;
  btcMapDataAt?: number;
  status: RegionStatus;
  error?: string;
}

export type OwnResourceType =
  | "post"
  | "review"
  | "collection"
  | "incident"
  | "geoCapture"
  | "sequence"
  | "route";

export interface OwnResource<T = unknown> {
  userId: string;
  type: OwnResourceType;
  id: string;
  /** Decoded JSON body of the resource. */
  body: T;
  /** Canonical homeserver path, e.g. `/pub/mapky.app/posts/<id>`. */
  path: string;
  updatedAt: number;
  syncedAt: number;
}

export type OutboxOp = "put" | "delete" | "putBlob";
export type OutboxStatus = "pending" | "syncing" | "failed" | "done";

export interface OutboxEntry {
  id?: number;
  op: OutboxOp;
  /** Homeserver path the op targets, e.g. `/pub/mapky.app/posts/<id>`. */
  path: string;
  /** JSON body (for `put`) or raw bytes (for `putBlob`). Omitted for `delete`. */
  payload?: unknown | Uint8Array;
  contentType?: string;
  userId: string;
  createdAt: number;
  attempts: number;
  lastAttemptAt?: number;
  lastError?: string;
  status: OutboxStatus;
}

export interface RouteCacheEntry {
  /** Hash of (waypoints, activity, preferences) — see hashRouteRequest. */
  key: string;
  request: unknown;
  response: unknown;
  createdAt: number;
  accessedAt: number;
}

interface MapkyOfflineDB extends DBSchema {
  regions: {
    key: string;
    value: Region;
    indexes: { "by-status": RegionStatus; "by-downloadedAt": number };
  };
  own_resources: {
    key: [string, OwnResourceType, string];
    value: OwnResource;
    indexes: { "by-userId": string; "by-userId-type": [string, OwnResourceType] };
  };
  outbox: {
    key: number;
    value: OutboxEntry;
    indexes: { "by-status": OutboxStatus; "by-userId": string };
  };
  routes_cache: {
    key: string;
    value: RouteCacheEntry;
    indexes: { "by-accessedAt": number };
  };
}

export type MapkyDB = IDBPDatabase<MapkyOfflineDB>;

const DB_NAME = "mapky-offline";
const DB_VERSION = 1;

let dbPromise: Promise<MapkyDB> | null = null;

export function getDB(): Promise<MapkyDB> {
  if (dbPromise) return dbPromise;
  dbPromise = openDB<MapkyOfflineDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("regions")) {
        const store = db.createObjectStore("regions", { keyPath: "id" });
        store.createIndex("by-status", "status");
        store.createIndex("by-downloadedAt", "downloadedAt");
      }
      if (!db.objectStoreNames.contains("own_resources")) {
        const store = db.createObjectStore("own_resources", {
          keyPath: ["userId", "type", "id"],
        });
        store.createIndex("by-userId", "userId");
        store.createIndex("by-userId-type", ["userId", "type"]);
      }
      if (!db.objectStoreNames.contains("outbox")) {
        const store = db.createObjectStore("outbox", {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("by-status", "status");
        store.createIndex("by-userId", "userId");
      }
      if (!db.objectStoreNames.contains("routes_cache")) {
        const store = db.createObjectStore("routes_cache", { keyPath: "key" });
        store.createIndex("by-accessedAt", "accessedAt");
      }
    },
    blocked() {
      console.warn("[offline-db] upgrade blocked by another tab");
    },
    blocking() {
      // Older tab is open during an upgrade — close so the new one wins.
      dbPromise?.then((db) => db.close());
      dbPromise = null;
    },
  });
  return dbPromise;
}
