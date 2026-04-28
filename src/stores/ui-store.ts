import { create } from "zustand";
import { persist } from "zustand/middleware";

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
  /** Back-navigation context from search results */
  fromSearch?: { query: string; mode: string };
  /** Back-navigation context from collection overlay */
  fromCollection?: { authorId: string; collectionId: string };
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
  /** Place name for the balloon-pin label when there's no area highlight */
  name?: string;
}

export type DimmableLayer = "places" | "captures" | "routes";

interface UiStore {
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  toggleMenu: () => void;

  placesLayerVisible: boolean;
  setPlacesLayerVisible: (visible: boolean) => void;
  togglePlacesLayer: () => void;

  capturesLayerVisible: boolean;
  setCapturesLayerVisible: (visible: boolean) => void;
  toggleCapturesLayer: () => void;

  routesLayerVisible: boolean;
  setRoutesLayerVisible: (visible: boolean) => void;
  toggleRoutesLayer: () => void;

  /** OpenRailwayMap raster overlay — rail lines, metro, signals. */
  metroOverlayVisible: boolean;
  setMetroOverlayVisible: (visible: boolean) => void;
  toggleMetroOverlay: () => void;

  /** CyclOSM cycling overlay — bike infrastructure, lanes, paths. */
  cyclingOverlayVisible: boolean;
  setCyclingOverlayVisible: (visible: boolean) => void;
  toggleCyclingOverlay: () => void;

  /** AWS Terrarium hillshade — terrain relief from elevation tiles. */
  terrainOverlayVisible: boolean;
  setTerrainOverlayVisible: (visible: boolean) => void;
  toggleTerrainOverlay: () => void;

  /**
   * Layers that should render at reduced opacity. Driven by
   * `useAutoFocusLayer` on detail pages — runtime only, never persisted.
   */
  dimmedLayers: Set<DimmableLayer>;
  setDimmed: (layer: DimmableLayer, on: boolean) => void;
  clearDimmed: () => void;

  layerSheetOpen: boolean;
  setLayerSheetOpen: (open: boolean) => void;
  toggleLayerSheet: () => void;

  pendingPoiClick: PendingPoiClick | null;
  setPendingPoiClick: (click: PendingPoiClick) => void;
  clearPendingPoiClick: () => void;

  selectedFeature: SelectedFeature | null;
  setSelectedFeature: (feature: SelectedFeature | null) => void;

  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  activeCollectionOverlays: Map<string, CollectionOverlayEntry>;
  addCollectionOverlay: (authorId: string, collectionId: string, color?: string) => void;
  removeCollectionOverlay: (collectionId: string) => void;
  toggleCollectionOverlay: (authorId: string, collectionId: string, color?: string) => void;
  clearAllCollectionOverlays: () => void;

  streetViewActive: boolean;
  setStreetViewActive: (active: boolean) => void;
  /** When true, sphere is fullscreen + map is corner. When false, map is fullscreen + sphere is corner. */
  streetViewExpanded: boolean;
  toggleStreetViewExpanded: () => void;
  streetViewCenter: [number, number] | null;
  setStreetViewCenter: (center: [number, number] | null) => void;
}

export const useUiStore = create<UiStore>()(
  persist(
    (set) => ({
      menuOpen: false,
      setMenuOpen: (open) => set({ menuOpen: open }),
      toggleMenu: () => set((s) => ({ menuOpen: !s.menuOpen })),

      placesLayerVisible: true,
      setPlacesLayerVisible: (visible) => set({ placesLayerVisible: visible }),
      togglePlacesLayer: () =>
        set((s) => ({ placesLayerVisible: !s.placesLayerVisible })),

      capturesLayerVisible: true,
      setCapturesLayerVisible: (visible) => set({ capturesLayerVisible: visible }),
      toggleCapturesLayer: () =>
        set((s) => ({ capturesLayerVisible: !s.capturesLayerVisible })),

      routesLayerVisible: false,
      setRoutesLayerVisible: (visible) => set({ routesLayerVisible: visible }),
      toggleRoutesLayer: () =>
        set((s) => ({ routesLayerVisible: !s.routesLayerVisible })),

      metroOverlayVisible: false,
      setMetroOverlayVisible: (visible) => set({ metroOverlayVisible: visible }),
      toggleMetroOverlay: () =>
        set((s) => ({ metroOverlayVisible: !s.metroOverlayVisible })),

      cyclingOverlayVisible: false,
      setCyclingOverlayVisible: (visible) =>
        set({ cyclingOverlayVisible: visible }),
      toggleCyclingOverlay: () =>
        set((s) => ({ cyclingOverlayVisible: !s.cyclingOverlayVisible })),

      terrainOverlayVisible: false,
      setTerrainOverlayVisible: (visible) =>
        set({ terrainOverlayVisible: visible }),
      toggleTerrainOverlay: () =>
        set((s) => ({ terrainOverlayVisible: !s.terrainOverlayVisible })),

      dimmedLayers: new Set<DimmableLayer>(),
      setDimmed: (layer, on) =>
        set((s) => {
          const next = new Set(s.dimmedLayers);
          if (on) next.add(layer);
          else next.delete(layer);
          return { dimmedLayers: next };
        }),
      clearDimmed: () => set({ dimmedLayers: new Set() }),

      layerSheetOpen: false,
      setLayerSheetOpen: (open) => set({ layerSheetOpen: open }),
      toggleLayerSheet: () => set((s) => ({ layerSheetOpen: !s.layerSheetOpen })),

      pendingPoiClick: null,
      setPendingPoiClick: (click) => set({ pendingPoiClick: click }),
      clearPendingPoiClick: () => set({ pendingPoiClick: null }),

      selectedFeature: null,
      setSelectedFeature: (feature) => set({ selectedFeature: feature }),

      sidebarOpen: false,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      activeCollectionOverlays: new Map(),
      addCollectionOverlay: (authorId, collectionId, color) =>
        set((s) => {
          const existing = s.activeCollectionOverlays.get(collectionId);
          // Reuse existing color if no new color provided
          const resolvedColor = color || existing?.color || nextColor();
          if (existing && existing.color === resolvedColor) return s;
          const next = new Map(s.activeCollectionOverlays);
          next.set(collectionId, { authorId, collectionId, color: resolvedColor });
          return { activeCollectionOverlays: next };
        }),
      removeCollectionOverlay: (collectionId) =>
        set((s) => {
          if (!s.activeCollectionOverlays.has(collectionId)) return s;
          const next = new Map(s.activeCollectionOverlays);
          next.delete(collectionId);
          return { activeCollectionOverlays: next };
        }),
      toggleCollectionOverlay: (authorId, collectionId, color) =>
        set((s) => {
          const next = new Map(s.activeCollectionOverlays);
          if (next.has(collectionId)) {
            next.delete(collectionId);
          } else {
            next.set(collectionId, { authorId, collectionId, color: color || nextColor() });
          }
          return { activeCollectionOverlays: next };
        }),
      clearAllCollectionOverlays: () => set({ activeCollectionOverlays: new Map() }),

      streetViewActive: false,
      setStreetViewActive: (active) => set({ streetViewActive: active, streetViewExpanded: active }),
      streetViewExpanded: true,
      toggleStreetViewExpanded: () => set((s) => ({ streetViewExpanded: !s.streetViewExpanded })),
      streetViewCenter: null,
      setStreetViewCenter: (center) => set({ streetViewCenter: center }),
    }),
    {
      name: "mapky-layers",
      version: 1,
      // Persist only what's safe to restore: the user's layer-visibility
      // choices. Theme/basemap lives in map-store; dimmedLayers, sheet
      // open-state, sidebar/menu/streetview/POI-click context are all
      // ephemeral runtime state.
      partialize: (state) => ({
        placesLayerVisible: state.placesLayerVisible,
        capturesLayerVisible: state.capturesLayerVisible,
        routesLayerVisible: state.routesLayerVisible,
        metroOverlayVisible: state.metroOverlayVisible,
        cyclingOverlayVisible: state.cyclingOverlayVisible,
        terrainOverlayVisible: state.terrainOverlayVisible,
      }),
    },
  ),
);
