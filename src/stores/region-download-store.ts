import { create } from "zustand";
import { toast } from "sonner";
import {
  downloadRegion,
  type DownloadProgress,
  type DownloadRegionInput,
} from "@/lib/offline/region-download";
import { listRegions, putRegion } from "@/lib/offline/regions";

/**
 * In-memory tracker for region downloads. The actual fetch loop runs
 * independently of any UI surface, so closing the AddRegionDialog or
 * navigating away from /settings/offline doesn't cancel the download
 * — only an explicit Cancel does.
 *
 * Lifetime: in-memory only. A page reload aborts in-flight downloads
 * (whatever tiles already landed in IDB stay there; the region row's
 * status will be left as "downloading" until either a manual delete
 * or a re-trigger). Persisting across reload would need a
 * Background Sync entry — out of scope for now.
 */

export interface ActiveDownload {
  id: string;
  name: string;
  status: "running" | "completed" | "errored" | "cancelled";
  progress: DownloadProgress;
  error?: string;
}

interface State {
  active: Record<string, ActiveDownload>;
  controllers: Record<string, AbortController>;
}

interface Actions {
  start: (
    input: DownloadRegionInput,
    onAdded?: () => void,
  ) => Promise<void>;
  cancel: (id: string) => void;
  clear: (id: string) => void;
  /**
   * Look for region rows stuck in `status: "downloading"` (i.e. a
   * previous tab was reloaded mid-download) and re-kick them with
   * the same params. Idempotent and safe to call on every app
   * boot — `start()`'s "already running" guard prevents duplicates
   * if a download is already in flight.
   */
  resumeStuck: () => Promise<number>;
}

export const useRegionDownloadStore = create<State & Actions>((set, get) => ({
  active: {},
  controllers: {},

  start: async (input, onAdded) => {
    // Same-region double-trigger is a no-op: surface a hint and bail
    // so we don't kick off two concurrent fetch loops for the same
    // tile keys.
    if (get().active[input.id]?.status === "running") {
      toast.info("Already downloading this region.");
      return;
    }

    const controller = new AbortController();
    set((s) => ({
      active: {
        ...s.active,
        [input.id]: {
          id: input.id,
          name: input.name,
          status: "running",
          progress: { done: 0, total: 0, errored: 0, bytesStored: 0 },
        },
      },
      controllers: { ...s.controllers, [input.id]: controller },
    }));

    // Stage the region row in IDB before anything else so the
    // settings panel's `refresh()` (which the dialog fires right
    // after this) sees the pending row. Without this, there's a
    // race where the panel reads the regions list *before*
    // downloadRegion writes its initial row, and progress has no
    // row to render on.
    try {
      await putRegion({
        id: input.id,
        name: input.name,
        bbox: [
          input.bbox.west,
          input.bbox.south,
          input.bbox.east,
          input.bbox.north,
        ],
        tier: input.tier,
        pmtilesPath: "",
        sizeBytes: 0,
        downloadedAt: Date.now(),
        lastUpdatedAt: Date.now(),
        status: "downloading",
        maxZoom: input.maxZoom,
      });
      onAdded?.();
    } catch {
      // putRegion failing is recoverable — downloadRegion will write
      // its own row inside the fetch loop.
    }

    try {
      await downloadRegion(input, {
        signal: controller.signal,
        onProgress: (p) => {
          set((s) => {
            const cur = s.active[input.id];
            if (!cur) return s;
            return {
              ...s,
              active: {
                ...s.active,
                [input.id]: { ...cur, progress: p },
              },
            };
          });
        },
      });
      if (controller.signal.aborted) {
        // The cancel() handler already wrote `cancelled` — leave it.
      } else {
        set((s) => {
          const cur = s.active[input.id];
          if (!cur) return s;
          return {
            ...s,
            active: {
              ...s.active,
              [input.id]: { ...cur, status: "completed" },
            },
          };
        });
        toast.success(`Downloaded ${input.name} for offline use`);
        onAdded?.();
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Download failed";
      set((s) => {
        const cur = s.active[input.id];
        if (!cur) return s;
        return {
          ...s,
          active: {
            ...s.active,
            [input.id]: { ...cur, status: "errored", error: message },
          },
        };
      });
      toast.error(message);
    } finally {
      set((s) => {
        const { [input.id]: _gone, ...rest } = s.controllers;
        return { ...s, controllers: rest };
      });
    }
  },

  cancel: (id) => {
    const controller = get().controllers[id];
    if (!controller) return;
    controller.abort();
    set((s) => {
      const cur = s.active[id];
      if (!cur) return s;
      return {
        ...s,
        active: { ...s.active, [id]: { ...cur, status: "cancelled" } },
      };
    });
    toast.info("Cancelled download.");
  },

  clear: (id) => {
    set((s) => {
      const { [id]: _gone, ...rest } = s.active;
      return { ...s, active: rest };
    });
  },

  resumeStuck: async () => {
    const all = await listRegions();
    const stuck = all.filter(
      (r) => r.status === "downloading" && !get().active[r.id],
    );
    if (stuck.length === 0) return 0;
    for (const r of stuck) {
      const [west, south, east, north] = r.bbox;
      // No `await` — we want stuck downloads running in parallel,
      // not serialized.
      void get().start({
        id: r.id,
        name: r.name,
        bbox: { west, south, east, north },
        tier: r.tier,
        minZoom: 0,
        maxZoom: r.maxZoom ?? 14,
        force: true,
      });
    }
    toast.info(
      `Resuming ${stuck.length} interrupted download${stuck.length === 1 ? "" : "s"}…`,
    );
    return stuck.length;
  },
}));
