import { create } from "zustand";

export interface PendingPoiClick {
  lng: number;
  lat: number;
  name: string;
  kind: string;
  /** Direct OSM reference — skips Nominatim */
  osmType?: string;
  osmId?: number;
  /** Tile source-layer the click hit (for feature-state highlighting) */
  sourceLayer?: string;
}

export interface SelectedFeature {
  osmType: string;
  osmId: number;
  /** Encoded Protomaps feature id for setFeatureState */
  featureId: number;
  /** Source layers where feature-state was applied */
  sourceLayers: string[];
  /** Fallback coords for fly-to when opening from search */
  lng: number;
  lat: number;
}

interface UiStore {
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  toggleMenu: () => void;

  placesLayerVisible: boolean;
  setPlacesLayerVisible: (visible: boolean) => void;
  togglePlacesLayer: () => void;

  pendingPoiClick: PendingPoiClick | null;
  setPendingPoiClick: (click: PendingPoiClick) => void;
  clearPendingPoiClick: () => void;

  selectedFeature: SelectedFeature | null;
  setSelectedFeature: (feature: SelectedFeature | null) => void;

  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  menuOpen: false,
  setMenuOpen: (open) => set({ menuOpen: open }),
  toggleMenu: () => set((s) => ({ menuOpen: !s.menuOpen })),

  placesLayerVisible: true,
  setPlacesLayerVisible: (visible) => set({ placesLayerVisible: visible }),
  togglePlacesLayer: () =>
    set((s) => ({ placesLayerVisible: !s.placesLayerVisible })),

  pendingPoiClick: null,
  setPendingPoiClick: (click) => set({ pendingPoiClick: click }),
  clearPendingPoiClick: () => set({ pendingPoiClick: null }),

  selectedFeature: null,
  setSelectedFeature: (feature) => set({ selectedFeature: feature }),

  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));
