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
}

export const useMapStore = create<MapStore>()(
  persist(
    (set) => ({
      map: null,
      setMap: (map) => set({ map }),

      center: [8.55, 47.37], // Zurich default
      zoom: 13,
      setView: (center, zoom) => set({ center, zoom }),

      theme: window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light",
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: "mapky-map",
      partialize: (state) => ({
        center: state.center,
        zoom: state.zoom,
        theme: state.theme,
      }),
    },
  ),
);
