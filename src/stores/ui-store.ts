import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { GeoCaptureDetails, PlaceFilters } from "@/types/mapky";

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

/**
 * Stable color per (authorId, collectionId) — same hash trick the
 * routes layer uses for `routeColor`. Previously the overlay store
 * incremented a module-level counter, so a collection's overlay
 * color depended on the order it was opened during the session and
 * shifted on reload. Hashing keeps the color tied to the collection
 * identity instead.
 */
function colorForCollection(authorId: string, collectionId: string): string {
  const key = `${authorId}:${collectionId}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return OVERLAY_COLORS[Math.abs(h) % OVERLAY_COLORS.length];
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

export type DimmableLayer = "places" | "captures";

interface UiStore {
  /**
   * User toggles for the always-on Mapky data layers. These act when
   * no sidebar is focused (no `useAutoFocusLayer` setting hidden /
   * dimmed flags). Focus-hide always wins, so flipping these off
   * inside a list view is a no-op until the user closes it.
   */
  placesLayerVisible: boolean;
  setPlacesLayerVisible: (visible: boolean) => void;
  togglePlacesLayer: () => void;

  capturesLayerVisible: boolean;
  setCapturesLayerVisible: (visible: boolean) => void;
  toggleCapturesLayer: () => void;

  /** OpenRailwayMap raster overlay — rail lines, metro, signals. */
  metroOverlayVisible: boolean;
  setMetroOverlayVisible: (visible: boolean) => void;
  toggleMetroOverlay: () => void;

  /**
   * Filter pills for the Places layer. Each one when `true` narrows
   * the result set; all-`false` (the default) means "show every
   * place". Sent as query params to `/v0/mapky/viewport` so the
   * server applies the filter in the same Cypher pass — no client-
   * side post-filtering, no second query.
   */
  placesFilters: PlaceFilters;
  setPlacesFilter: (key: keyof PlaceFilters, on: boolean) => void;
  togglePlacesFilter: (key: keyof PlaceFilters) => void;

  /** Extrude buildings using the height field from Protomaps tiles. */
  buildings3DVisible: boolean;
  setBuildings3DVisible: (visible: boolean) => void;
  toggleBuildings3D: () => void;

  /**
   * Layers that should render at reduced opacity. Driven by
   * `useAutoFocusLayer` on detail pages — runtime only, never persisted.
   */
  dimmedLayers: Set<DimmableLayer>;
  setDimmed: (layer: DimmableLayer, on: boolean) => void;
  clearDimmed: () => void;

  /**
   * Layers that should be fully hidden. Stronger than `dimmedLayers`:
   * a layer in this set returns opacity 0. Used when the user is in a
   * focused mode (search active, list filter active, detail panel
   * open) and wants the map to drop the surrounding noise entirely.
   * Hidden takes precedence over dimmed.
   */
  hiddenLayers: Set<DimmableLayer>;
  setHidden: (layer: DimmableLayer, on: boolean) => void;
  clearHidden: () => void;

  /**
   * Per-list filter projection onto the map. When set, the matching
   * map layer only renders features whose key is present in the set.
   * `null` means "no filter — show every feature".
   *
   * Driven by the discover sidebars: PlaceList / CaptureList / etc.
   * push the keys of their currently-visible (post-filter) items so
   * the green dots / camera icons / collection overlays match what
   * the user sees in the sidebar.
   *
   * Place keys are `${osm_type}:${osm_id}`; capture keys are the
   * compound `${author}:${id}` used by the indexer; collection keys
   * are also the compound id. Each layer uses its own field to avoid
   * coupling.
   */
  visiblePlaceKeys: Set<string> | null;
  setVisiblePlaceKeys: (s: Set<string> | null) => void;

  visibleCaptureIds: Set<string> | null;
  setVisibleCaptureIds: (s: Set<string> | null) => void;

  visibleCollectionIds: Set<string> | null;
  setVisibleCollectionIds: (s: Set<string> | null) => void;

  /**
   * Captures that should always render on the map regardless of the
   * current viewport bbox. Set by CaptureDetailPanel to the active
   * sequence's siblings, so zooming in on a single capture doesn't
   * lose the connecting coverage line. Cleared on unmount.
   */
  pinnedCaptures: GeoCaptureDetails[] | null;
  setPinnedCaptures: (c: GeoCaptureDetails[] | null) => void;

  layerSheetOpen: boolean;
  setLayerSheetOpen: (open: boolean) => void;
  toggleLayerSheet: () => void;

  pendingPoiClick: PendingPoiClick | null;
  setPendingPoiClick: (click: PendingPoiClick) => void;
  clearPendingPoiClick: () => void;

  selectedFeature: SelectedFeature | null;
  setSelectedFeature: (feature: SelectedFeature | null) => void;

  /**
   * Derived from `sidebarRefs.size > 0`. True whenever any sidebar
   * component is mounted; SearchBar / LayerSheetTrigger read it to
   * slide past the sidebar's gutter.
   *
   * Counter-style instead of last-writer-wins because route
   * transitions (e.g. /directions → /route/...) briefly mount BOTH
   * sidebars, and a plain boolean toggle would race during cleanup
   * and leave the SearchBar painted over the new sidebar's header.
   */
  sidebarOpen: boolean;
  /** Internal set tracking each mounted sidebar component by id. */
  sidebarRefs: Set<string>;
  registerSidebar: (id: string) => void;
  unregisterSidebar: (id: string) => void;

  /**
   * Mobile-only nav drawer (the slide-in panel triggered by the
   * hamburger button). Always defaults closed; not persisted across
   * reloads — surfacing the menu on first paint would be jarring.
   */
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
  toggleMobileNav: () => void;

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
      placesLayerVisible: true,
      setPlacesLayerVisible: (visible) => set({ placesLayerVisible: visible }),
      togglePlacesLayer: () =>
        set((s) => ({ placesLayerVisible: !s.placesLayerVisible })),

      capturesLayerVisible: true,
      setCapturesLayerVisible: (visible) =>
        set({ capturesLayerVisible: visible }),
      toggleCapturesLayer: () =>
        set((s) => ({ capturesLayerVisible: !s.capturesLayerVisible })),

      metroOverlayVisible: false,
      setMetroOverlayVisible: (visible) => set({ metroOverlayVisible: visible }),
      toggleMetroOverlay: () =>
        set((s) => ({ metroOverlayVisible: !s.metroOverlayVisible })),

      placesFilters: { bitcoin: false, reviewed: false, tagged: false },
      setPlacesFilter: (key, on) =>
        set((s) => ({
          placesFilters: { ...s.placesFilters, [key]: on },
        })),
      togglePlacesFilter: (key) =>
        set((s) => ({
          placesFilters: { ...s.placesFilters, [key]: !s.placesFilters[key] },
        })),

      buildings3DVisible: false,
      setBuildings3DVisible: (visible) =>
        set({ buildings3DVisible: visible }),
      toggleBuildings3D: () =>
        set((s) => ({ buildings3DVisible: !s.buildings3DVisible })),

      hiddenLayers: new Set<DimmableLayer>(),
      setHidden: (layer, on) =>
        set((s) => {
          const next = new Set(s.hiddenLayers);
          if (on) next.add(layer);
          else next.delete(layer);
          return { hiddenLayers: next };
        }),
      clearHidden: () => set({ hiddenLayers: new Set() }),

      visiblePlaceKeys: null,
      setVisiblePlaceKeys: (s) => set({ visiblePlaceKeys: s }),

      visibleCaptureIds: null,
      setVisibleCaptureIds: (s) => set({ visibleCaptureIds: s }),

      visibleCollectionIds: null,
      setVisibleCollectionIds: (s) => set({ visibleCollectionIds: s }),

      pinnedCaptures: null,
      setPinnedCaptures: (c) => set({ pinnedCaptures: c }),

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
      sidebarRefs: new Set<string>(),
      registerSidebar: (id) =>
        set((s) => {
          if (s.sidebarRefs.has(id)) return s;
          const next = new Set(s.sidebarRefs);
          next.add(id);
          return { sidebarRefs: next, sidebarOpen: next.size > 0 };
        }),
      unregisterSidebar: (id) =>
        set((s) => {
          if (!s.sidebarRefs.has(id)) return s;
          const next = new Set(s.sidebarRefs);
          next.delete(id);
          return { sidebarRefs: next, sidebarOpen: next.size > 0 };
        }),

      mobileNavOpen: false,
      setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
      toggleMobileNav: () => set((s) => ({ mobileNavOpen: !s.mobileNavOpen })),

      activeCollectionOverlays: new Map(),
      addCollectionOverlay: (authorId, collectionId, color) =>
        set((s) => {
          const existing = s.activeCollectionOverlays.get(collectionId);
          // Caller-provided color (set by the user on the collection)
          // wins; otherwise fall back to a stable hash of the
          // collection identity so the same collection gets the same
          // color across reloads / open order.
          const resolvedColor =
            color ||
            existing?.color ||
            colorForCollection(authorId, collectionId);
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
            next.set(collectionId, {
              authorId,
              collectionId,
              color: color || colorForCollection(authorId, collectionId),
            });
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
      // v7: drop bitcoinOverlayVisible (replaced by placesFilters.bitcoin),
      //     add placesFilters. The standalone BTC overlay collapsed into
      //     a narrowing filter on the Places layer once BTCMap data was
      //     ingested into Neo4j as :Place nodes.
      version: 7,
      // Persist user-controlled toggles only. Theme/basemap lives in
      // map-store; dimmedLayers / hiddenLayers / sheet open-state /
      // sidebar / streetview / POI-click context are all ephemeral
      // runtime state.
      partialize: (state) => ({
        placesLayerVisible: state.placesLayerVisible,
        capturesLayerVisible: state.capturesLayerVisible,
        metroOverlayVisible: state.metroOverlayVisible,
        placesFilters: state.placesFilters,
        buildings3DVisible: state.buildings3DVisible,
      }),
    },
  ),
);
