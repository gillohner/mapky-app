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
  /** Highest zoom level requested at download time. Used by the
   *  auto-resume path so a reload mid-download knows where to pick
   *  back up. Optional for back-compat with rows written before this
   *  field existed. */
  maxZoom?: number;
}

export type OwnResourceType =
  | "post"
  | "review"
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

/**
 * Persisted PMTiles tile bytes — what `region-download` writes after
 * fetching each tile via the pmtiles JS client, and what our custom
 * MapLibre protocol returns when MapLibre asks for that tile while
 * offline. Bytes are the decompressed MVT payload (whatever pmtiles
 * JS returned from `getZxy`), so MapLibre consumes them as-is.
 *
 * Keyed by `[z, x, y]` — region overlap stores one copy of each
 * tile, not N. Deleting a region drops the region row but leaves
 * its tiles in place (they're still useful for any overlapping
 * region or for ad-hoc panning).
 */
export interface OfflineTile {
  z: number;
  x: number;
  y: number;
  bytes: Uint8Array;
  sizeBytes: number;
  storedAt: number;
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
  offline_tiles: {
    key: [number, number, number];
    value: OfflineTile;
    indexes: { "by-z": number };
  };
}

export type MapkyDB = IDBPDatabase<MapkyOfflineDB>;

const DB_NAME = "mapky-offline";
/**
 * Schema versions:
 *   1 — regions, own_resources, outbox, routes_cache
 *   2 — adds offline_tiles
 *   3 — re-bump to recover IDBs that landed on v2 without the
 *       offline_tiles store (an upgrade racing with a still-open
 *       tab can skip the store creation). The upgrade callback is
 *       idempotent — every `createObjectStore` is guarded by an
 *       `objectStoreNames.contains` check, so already-correct
 *       databases see no change.
 */
const DB_VERSION = 3;
const REQUIRED_STORES = [
  "regions",
  "own_resources",
  "outbox",
  "routes_cache",
  "offline_tiles",
] as const;

let dbPromise: Promise<MapkyDB> | null = null;

function openMapkyDB(version: number): Promise<MapkyDB> {
  return openDB<MapkyOfflineDB>(DB_NAME, version, {
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
      if (!db.objectStoreNames.contains("offline_tiles")) {
        const store = db.createObjectStore("offline_tiles", {
          keyPath: ["z", "x", "y"],
        });
        store.createIndex("by-z", "z");
      }
    },
    blocked() {
      console.warn("[offline-db] upgrade blocked by another tab");
    },
    blocking() {
      // Older tab is open during an upgrade — close so the new one
      // wins. Drop our cached promise so the next getDB() opens a
      // fresh connection at the new version.
      dbPromise?.then((db) => db.close());
      dbPromise = null;
    },
  });
}

export function getDB(): Promise<MapkyDB> {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    let db = await openMapkyDB(DB_VERSION);
    // Defensive recovery: if the on-disk schema is missing any
    // required store (e.g. a previous upgrade was interrupted by a
    // still-open tab and silently skipped a `createObjectStore`),
    // close and re-open at the next version so the upgrade callback
    // runs again with all guards intact.
    const missing = REQUIRED_STORES.filter(
      (name) => !db.objectStoreNames.contains(name),
    );
    if (missing.length > 0) {
      console.warn(
        `[offline-db] stores missing after upgrade: ${missing.join(", ")} — re-upgrading at v${DB_VERSION + 1}`,
      );
      db.close();
      db = await openMapkyDB(DB_VERSION + 1);
    }
    return db;
  })();
  return dbPromise;
}
