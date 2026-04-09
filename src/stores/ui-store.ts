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

export interface CollectionOverlayEntry {
  authorId: string;
  collectionId: string;
  color: string;
}

const OVERLAY_COLORS = [
  "#3b82f6", "#a855f7", "#f97316", "#ec4899",
  "#06b6d4", "#eab308", "#ef4444",
];

let colorIndex = 0;
function nextColor(): string {
  const c = OVERLAY_COLORS[colorIndex % OVERLAY_COLORS.length];
  colorIndex++;
  return c;
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

  activeCollectionOverlays: Map<string, CollectionOverlayEntry>;
  addCollectionOverlay: (authorId: string, collectionId: string) => void;
  removeCollectionOverlay: (collectionId: string) => void;
  toggleCollectionOverlay: (authorId: string, collectionId: string) => void;
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

  activeCollectionOverlays: new Map(),
  addCollectionOverlay: (authorId, collectionId) =>
    set((s) => {
      if (s.activeCollectionOverlays.has(collectionId)) return s;
      const next = new Map(s.activeCollectionOverlays);
      next.set(collectionId, { authorId, collectionId, color: nextColor() });
      return { activeCollectionOverlays: next };
    }),
  removeCollectionOverlay: (collectionId) =>
    set((s) => {
      if (!s.activeCollectionOverlays.has(collectionId)) return s;
      const next = new Map(s.activeCollectionOverlays);
      next.delete(collectionId);
      return { activeCollectionOverlays: next };
    }),
  toggleCollectionOverlay: (authorId, collectionId) =>
    set((s) => {
      const next = new Map(s.activeCollectionOverlays);
      if (next.has(collectionId)) {
        next.delete(collectionId);
      } else {
        next.set(collectionId, { authorId, collectionId, color: nextColor() });
      }
      return { activeCollectionOverlays: next };
    }),
}));
