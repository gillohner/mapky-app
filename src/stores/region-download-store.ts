import { create } from "zustand";
import { toast } from "sonner";
import {
  downloadRegion,
  type DownloadProgress,
  type DownloadRegionInput,
} from "@/lib/offline/region-download";

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
}));
