import { create } from "zustand";
import {
  getStorageEstimate,
  isPersisted,
  type StorageEstimate,
} from "@/lib/offline/quota";
import { countCachedRoutes } from "@/lib/offline/routes-cache";
import { listAll as listOutboxAll } from "@/lib/offline/outbox";
import { listRegions } from "@/lib/offline/regions";
import {
  countOfflineTiles,
  totalOfflineTilesBytes,
} from "@/lib/offline/offline-tiles";
import { countOwnByUserType } from "@/lib/offline/own-resources";
import type { OutboxEntry, Region } from "@/lib/offline/db";

/**
 * Snapshot cache for /settings/offline. The panel iterates every
 * tile in IDB to compute totals — fine to do once, expensive every
 * time the user re-enters the route. Hoisting state here means
 * navigating away and back paints the last-known values instantly,
 * with a background refresh updating in place.
 *
 * `refresh()` is safe to call repeatedly: an in-flight refresh
 * short-circuits subsequent calls instead of fanning out N parallel
 * IDB scans.
 */

interface OwnCounts {
  post: number;
  review: number;
  collection: number;
  incident: number;
  geoCapture: number;
  sequence: number;
  route: number;
}

interface Snapshot {
  loadedAt: number | null;
  storage: StorageEstimate | null;
  persistent: boolean;
  regions: Region[];
  outboxEntries: OutboxEntry[];
  routesCount: number;
  tilesCount: number;
  tilesBytes: number;
  ownCounts: OwnCounts | null;
}

interface State extends Snapshot {
  refreshing: boolean;
  refresh: (publicKey: string | null) => Promise<void>;
  /** Cheap selective updaters used by user actions (e.g. clearing a
   *  cache) so the UI reflects the change without a full re-scan. */
  patch: (partial: Partial<Snapshot>) => void;
}

const empty: Snapshot = {
  loadedAt: null,
  storage: null,
  persistent: false,
  regions: [],
  outboxEntries: [],
  routesCount: 0,
  tilesCount: 0,
  tilesBytes: 0,
  ownCounts: null,
};

let inFlight: Promise<void> | null = null;

export const useOfflineStatsStore = create<State>((set) => ({
  ...empty,
  refreshing: false,

  refresh: async (publicKey) => {
    if (inFlight) return inFlight;
    set({ refreshing: true });
    inFlight = (async () => {
      try {
        const [est, persist, routes, entries, regs, tCount, tBytes] =
          await Promise.all([
            getStorageEstimate(),
            isPersisted(),
            countCachedRoutes(),
            listOutboxAll(),
            listRegions(),
            countOfflineTiles(),
            totalOfflineTilesBytes(),
          ]);
        const ownCounts = publicKey
          ? await countOwnByUserType(publicKey)
          : null;
        set({
          loadedAt: Date.now(),
          storage: est,
          persistent: persist,
          regions: regs,
          outboxEntries: entries,
          routesCount: routes,
          tilesCount: tCount,
          tilesBytes: tBytes,
          ownCounts,
        });
      } finally {
        set({ refreshing: false });
        inFlight = null;
      }
    })();
    return inFlight;
  },

  patch: (partial) => set((s) => ({ ...s, ...partial })),
}));

export type { OwnCounts as OfflineOwnCounts };
