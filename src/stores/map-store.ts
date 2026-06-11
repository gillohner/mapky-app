import { create } from "zustand";
import { persist } from "zustand/middleware";
import type maplibregl from "maplibre-gl";

interface MapStore {
  map: maplibregl.Map | null;
  setMap: (map: maplibregl.Map | null) => void;

  center: [number, number];
  zoom: number;
  setView: (center: [number, number], zoom: number) => void;

  theme: "light" | "dark";
  setTheme: (theme: "light" | "dark") => void;

  basemap: "default" | "terrain" | "cycling" | "satellite";
  setBasemap: (basemap: "default" | "terrain" | "cycling" | "satellite") => void;

  /** Show vector labels on top of satellite imagery (hybrid mode). */
  satelliteLabels: boolean;
  setSatelliteLabels: (on: boolean) => void;
  toggleSatelliteLabels: () => void;
}

export const DEFAULT_MAP_CENTER: [number, number] = [0, 20];
export const DEFAULT_MAP_ZOOM = 0;

export const useMapStore = create<MapStore>()(
  persist(
    (set) => ({
      map: null,
      setMap: (map) => set({ map }),

      center: DEFAULT_MAP_CENTER,
      zoom: DEFAULT_MAP_ZOOM,
      setView: (center, zoom) => set({ center, zoom }),

      theme: window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light",
      setTheme: (theme) => set({ theme }),

      basemap: "default",
      setBasemap: (basemap) => set({ basemap }),

      satelliteLabels: true,
      setSatelliteLabels: (on) => set({ satelliteLabels: on }),
      toggleSatelliteLabels: () =>
        set((s) => ({ satelliteLabels: !s.satelliteLabels })),
    }),
    {
      name: "mapky-map",
      partialize: (state) => ({
        center: state.center,
        zoom: state.zoom,
        theme: state.theme,
        basemap: state.basemap,
        satelliteLabels: state.satelliteLabels,
      }),
    },
  ),
);

if (typeof window !== "undefined" && import.meta.env.DEV) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__map = useMapStore;
}
