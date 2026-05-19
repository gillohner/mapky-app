import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  GeoCaptureDetails,
  PlaceActivity,
  PlaceFilters,
} from "@/types/mapky";

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

export type DimmableLayer = "places" | "captures" | "incidents";

export type LayerSheetTab = "mapky" | "basemap" | "overlays";

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

  incidentsLayerVisible: boolean;
  setIncidentsLayerVisible: (visible: boolean) => void;
  toggleIncidentsLayer: () => void;

  /** OpenRailwayMap raster overlay — rail lines, metro, signals. */
  metroOverlayVisible: boolean;
  setMetroOverlayVisible: (visible: boolean) => void;
  toggleMetroOverlay: () => void;

  /**
   * Filter dimensions for the Places layer. Sent as query params to
   * `/v0/mapky/viewport` so the server applies the filter in the same
   * Cypher pass — no client-side post-filtering, no second query.
   *
   * `activities` is multi-select OR; `minRating` is a 0-5 floor.
   * Default is the empty filter ("show every place").
   */
  placesFilters: PlaceFilters;
  togglePlaceActivity: (activity: PlaceActivity) => void;
  setMinRating: (rating: number | undefined) => void;
  resetPlacesFilters: () => void;

  /**
   * Independent BTC overlay layer (Bitcoin-accepting POIs from
   * BTCMap). Sibling to the cycling/rail/terrain overlays — fed by
   * `/v0/mapky/btc/viewport`, NOT by the Places layer's filter. The
   * overlay overlays orange BTC dots on top of whatever the Places
   * layer already renders, so users can see "Bitcoin places" without
   * losing other Mapky data on the map.
   */
  btcOverlayVisible: boolean;
  setBtcOverlayVisible: (visible: boolean) => void;
  toggleBtcOverlay: () => void;

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

  /** Compound ids of sequences the sidebar's filter is keeping visible.
   *  Used by SequenceMarkersLayer so the violet pins on the map match
   *  the captures-list filtered set (kind, tags, text). */
  visibleSequenceIds: Set<string> | null;
  setVisibleSequenceIds: (s: Set<string> | null) => void;

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

  /**
   * Layers card and Map-legend card are mutually exclusive — both
   * expand into the same bottom-left slot, so opening one auto-
   * collapses the other. The setters below enforce that invariant.
   */
  layerSheetOpen: boolean;
  setLayerSheetOpen: (open: boolean) => void;
  toggleLayerSheet: () => void;

  legendExpanded: boolean;
  setLegendExpanded: (open: boolean) => void;
  toggleLegend: () => void;

  /** Last-viewed tab inside the LayerSheet — persisted so the sheet
   *  re-opens to where the user left off. */
  layerSheetActiveTab: LayerSheetTab;
  setLayerSheetActiveTab: (tab: LayerSheetTab) => void;

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

      incidentsLayerVisible: true,
      setIncidentsLayerVisible: (visible) =>
        set({ incidentsLayerVisible: visible }),
      toggleIncidentsLayer: () =>
        set((s) => ({ incidentsLayerVisible: !s.incidentsLayerVisible })),

      metroOverlayVisible: false,
      setMetroOverlayVisible: (visible) => set({ metroOverlayVisible: visible }),
      toggleMetroOverlay: () =>
        set((s) => ({ metroOverlayVisible: !s.metroOverlayVisible })),

      placesFilters: { activities: [], minRating: undefined },
      togglePlaceActivity: (activity) =>
        set((s) => {
          const has = s.placesFilters.activities.includes(activity);
          const next = has
            ? s.placesFilters.activities.filter((a) => a !== activity)
            : [...s.placesFilters.activities, activity];
          return {
            placesFilters: { ...s.placesFilters, activities: next },
          };
        }),
      setMinRating: (rating) =>
        set((s) => ({
          placesFilters: {
            ...s.placesFilters,
            minRating:
              rating === undefined || rating <= 0 ? undefined : rating,
          },
        })),
      resetPlacesFilters: () =>
        set({ placesFilters: { activities: [], minRating: undefined } }),

      btcOverlayVisible: false,
      setBtcOverlayVisible: (visible) => set({ btcOverlayVisible: visible }),
      toggleBtcOverlay: () =>
        set((s) => ({ btcOverlayVisible: !s.btcOverlayVisible })),

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

      visibleSequenceIds: null,
      setVisibleSequenceIds: (s) => set({ visibleSequenceIds: s }),

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
      setLayerSheetOpen: (open) =>
        // Opening Layers auto-collapses the legend; closing leaves
        // legend's state alone.
        set((s) => ({
          layerSheetOpen: open,
          legendExpanded: open ? false : s.legendExpanded,
        })),
      toggleLayerSheet: () =>
        set((s) => ({
          layerSheetOpen: !s.layerSheetOpen,
          legendExpanded: !s.layerSheetOpen ? false : s.legendExpanded,
        })),

      legendExpanded: false,
      setLegendExpanded: (open) =>
        set((s) => ({
          legendExpanded: open,
          layerSheetOpen: open ? false : s.layerSheetOpen,
        })),
      toggleLegend: () =>
        set((s) => ({
          legendExpanded: !s.legendExpanded,
          layerSheetOpen: !s.legendExpanded ? false : s.layerSheetOpen,
        })),

      layerSheetActiveTab: "mapky",
      setLayerSheetActiveTab: (tab) => set({ layerSheetActiveTab: tab }),

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
      // v8: replace placesFilters {bitcoin, reviewed, tagged} with
      //     {activities[], minRating}. BTC moves OUT of placesFilters
      //     into its own btcOverlayVisible toggle (back to a sibling
      //     overlay; the v7 collapse hit an impossible-AND trap when
      //     all three pills were on with non-overlapping data).
      // v9: add layerSheetActiveTab so the tabbed LayerSheet re-opens
      //     where the user left off. Default "mapky".
      // v10: add incidentsLayerVisible toggle (default true).
      version: 10,
      migrate: (persisted: unknown, version: number) => {
        if (!persisted || typeof persisted !== "object") return persisted;
        const state = persisted as Record<string, unknown>;
        // v7 → v8: rebuild placesFilters and surface BTC as its own toggle.
        if (version < 8) {
          const old = (state.placesFilters as
            | { bitcoin?: boolean; reviewed?: boolean; tagged?: boolean }
            | undefined) ?? {};
          const activities: PlaceActivity[] = [];
          if (old.reviewed) activities.push("reviewed");
          if (old.tagged) activities.push("tagged");
          state.placesFilters = { activities, minRating: undefined };
          state.btcOverlayVisible = !!old.bitcoin;
        }
        if (version < 9) {
          // No-op for prior data — just adopt the v9 default if the
          // persisted state somehow carries an unrecognized value.
          const t = state.layerSheetActiveTab;
          if (t !== "mapky" && t !== "basemap" && t !== "overlays") {
            state.layerSheetActiveTab = "mapky";
          }
        }
        if (version < 10) {
          state.incidentsLayerVisible = true;
        }
        return state;
      },
      // Persist user-controlled toggles only. Theme/basemap lives in
      // map-store; dimmedLayers / hiddenLayers / sheet open-state /
      // sidebar / streetview / POI-click context are all ephemeral
      // runtime state.
      partialize: (state) => ({
        placesLayerVisible: state.placesLayerVisible,
        capturesLayerVisible: state.capturesLayerVisible,
        incidentsLayerVisible: state.incidentsLayerVisible,
        metroOverlayVisible: state.metroOverlayVisible,
        placesFilters: state.placesFilters,
        btcOverlayVisible: state.btcOverlayVisible,
        buildings3DVisible: state.buildings3DVisible,
        layerSheetActiveTab: state.layerSheetActiveTab,
      }),
    },
  ),
);
