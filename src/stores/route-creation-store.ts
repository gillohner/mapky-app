import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  RouteActivity,
  RouteDifficultyLabel,
  RouteFullJson,
  RouteWaypointJson,
} from "@/types/mapky";
import type { LngLat, RouteSnapResult, Waypoint } from "@/lib/routing/types";
import {
  emptyPreferences,
  type RoutingPreferences,
} from "@/lib/routing/preferences";

export type RouteCreationMode = "create" | "edit";

/**
 * Typed waypoint slot. Each kind tells the UI how to render the chip and
 * what's authoritative for re-snapping:
 *  - empty: user hasn't picked anything yet
 *  - gps:   "Your location" — re-resolved from the geolocation hook
 *  - place: pinned to an OSM POI (osm_type/osm_id known)
 *  - coords: arbitrary lat/lon (map click, GPX import, manual entry)
 */
export type WaypointSlot =
  | { kind: "empty"; id: string }
  | {
      kind: "gps";
      id: string;
      lat: number;
      lon: number;
      label: string;
    }
  | {
      kind: "place";
      id: string;
      lat: number;
      lon: number;
      label: string;
      osmType: string;
      osmId: number;
    }
  | {
      kind: "coords";
      id: string;
      lat: number;
      lon: number;
      label: string;
    };

export interface RouteComputed {
  polyline: string;
  decoded: LngLat[];
  distance_m: number;
  duration_s: number;
  elevation_gain_m?: number;
  elevation_loss_m?: number;
  /** True when the snapped route includes a ferry/transit segment. */
  hasFerry?: boolean;
  engine: "valhalla" | "manual" | "gpx";
  costing: string | null;
  computed_at: number;
}

interface RouteCreationState {
  /** Directions UI is mounted (top widget visible). */
  isOpen: boolean;
  mode: RouteCreationMode;
  editingFromAuthor: string | null;
  editingFromId: string | null;

  /**
   * Slots in route order: From … (stops) … To. Always at least 2 slots, an
   * empty one renders as a placeholder input.
   */
  slots: WaypointSlot[];

  /**
   * Index of the slot the user is currently picking for via map-click.
   * null = map clicks don't add waypoints. -1 = legacy "append on click"
   * (kept for the old code path, removed once everything migrates).
   */
  pickingForSlot: number | null;

  activity: RouteActivity;
  difficulty: RouteDifficultyLabel | null;

  // Save-step state — only relevant once the route is computed and the
  // user clicks "Save to my routes".
  name: string;
  description: string;
  imageUri: string | null;

  /** Currently-selected route — what the polyline + stats reflect. */
  computed: RouteComputed | null;
  /** Valhalla's primary (best) route. Persisted so selecting back to 0 works. */
  primary: RouteComputed | null;
  /** Alternates 1..N (does NOT include primary). */
  alternates: RouteComputed[];
  /** 0 = primary, 1..N = alternates[index-1]. */
  selectedAlternate: number;
  isComputing: boolean;
  computeError: string | null;
  /** Optional hint to surface alongside the error message. */
  computeErrorHint: string | null;
  computeNonce: number;

  /** User-overridable routing preferences (avoid ferries/tolls/highways). */
  preferences: RoutingPreferences;

  /** Bottom summary card (post-compute) is showing the save form. */
  showSaveForm: boolean;
  isPublishing: boolean;

  // ── actions ─────────────────────────────────────────────────────────
  open: (mode?: RouteCreationMode) => void;
  close: () => void;
  reset: () => void;

  setActivity: (activity: RouteActivity) => void;
  setDifficulty: (difficulty: RouteDifficultyLabel | null) => void;
  setName: (name: string) => void;
  setDescription: (description: string) => void;
  setImageUri: (uri: string | null) => void;

  setSlot: (index: number, slot: WaypointSlot) => void;
  clearSlot: (index: number) => void;
  addStop: () => void;
  removeSlot: (index: number) => void;
  swapEndpoints: () => void;
  setPickingForSlot: (index: number | null) => void;

  setComputed: (computed: RouteComputed | null) => void;
  /** Set primary + alternates in one go and reset the selected index. */
  setComputedBundle: (
    primary: RouteComputed | null,
    alternates: RouteComputed[],
  ) => void;
  selectAlternate: (index: number) => void;
  setComputing: (v: boolean) => void;
  setComputeError: (error: string | null, hint?: string | null) => void;
  setPreferences: (patch: Partial<RoutingPreferences>) => void;

  setShowSaveForm: (v: boolean) => void;
  setPublishing: (v: boolean) => void;

  loadFromExisting: (
    authorId: string,
    routeId: string,
    body: RouteFullJson,
  ) => void;
}

let _id = 0;
const newId = () => `slot-${++_id}-${Date.now()}`;

function emptySlot(): WaypointSlot {
  return { kind: "empty", id: newId() };
}

const INITIAL: Pick<
  RouteCreationState,
  | "isOpen"
  | "mode"
  | "editingFromAuthor"
  | "editingFromId"
  | "slots"
  | "pickingForSlot"
  | "activity"
  | "difficulty"
  | "name"
  | "description"
  | "imageUri"
  | "computed"
  | "primary"
  | "alternates"
  | "selectedAlternate"
  | "isComputing"
  | "computeError"
  | "computeErrorHint"
  | "computeNonce"
  | "showSaveForm"
  | "isPublishing"
  | "preferences"
> = {
  isOpen: false,
  mode: "create",
  editingFromAuthor: null,
  editingFromId: null,
  slots: [emptySlot(), emptySlot()],
  pickingForSlot: null,
  activity: "hiking",
  difficulty: null,
  name: "",
  description: "",
  imageUri: null,
  computed: null,
  primary: null,
  alternates: [],
  selectedAlternate: 0,
  isComputing: false,
  computeError: null,
  computeErrorHint: null,
  computeNonce: 0,
  showSaveForm: false,
  isPublishing: false,
  preferences: emptyPreferences(),
};

function bump(state: { computeNonce: number }): { computeNonce: number } {
  return { computeNonce: state.computeNonce + 1 };
}

export const useRouteCreationStore = create<RouteCreationState>()(
  persist(
    (set) => ({
  ...INITIAL,

  open: (mode = "create") =>
    set((s) => ({
      ...s,
      isOpen: true,
      mode,
      // Reset slots only if we're not resuming a draft.
      slots:
        s.slots.some((slot) => slot.kind !== "empty") &&
        s.slots.length >= 2
          ? s.slots
          : [emptySlot(), emptySlot()],
    })),
  close: () => set({ isOpen: false, pickingForSlot: null }),
  reset: () =>
    set({ ...INITIAL, slots: [emptySlot(), emptySlot()] }),

  setActivity: (activity) => set((s) => ({ activity, ...bump(s) })),
  setDifficulty: (difficulty) => set({ difficulty }),
  setName: (name) => set({ name }),
  setDescription: (description) => set({ description }),
  setImageUri: (uri) => set({ imageUri: uri }),

  setSlot: (index, slot) =>
    set((s) => {
      const slots = [...s.slots];
      slots[index] = slot;
      return {
        slots,
        pickingForSlot: s.pickingForSlot === index ? null : s.pickingForSlot,
        ...bump(s),
      };
    }),
  clearSlot: (index) =>
    set((s) => {
      const slots = [...s.slots];
      slots[index] = emptySlot();
      return { slots, ...bump(s) };
    }),
  addStop: () =>
    set((s) => {
      // Insert before the destination so order stays From … stops … To.
      const slots = [...s.slots];
      const insertAt = Math.max(1, slots.length - 1);
      slots.splice(insertAt, 0, emptySlot());
      return { slots, pickingForSlot: insertAt, ...bump(s) };
    }),
  removeSlot: (index) =>
    set((s) => {
      // Never let the user shrink below 2 slots.
      if (s.slots.length <= 2) {
        const slots = [...s.slots];
        slots[index] = emptySlot();
        return { slots, ...bump(s) };
      }
      const slots = s.slots.filter((_, i) => i !== index);
      return {
        slots,
        pickingForSlot:
          s.pickingForSlot === index ? null : s.pickingForSlot,
        ...bump(s),
      };
    }),
  swapEndpoints: () =>
    set((s) => {
      if (s.slots.length < 2) return {};
      const slots = [...s.slots];
      const last = slots.length - 1;
      [slots[0], slots[last]] = [slots[last], slots[0]];
      return { slots, ...bump(s) };
    }),
  setPickingForSlot: (pickingForSlot) => set({ pickingForSlot }),

  setComputed: (computed) => set({ computed }),
  setComputedBundle: (primary, alternates) =>
    set({
      computed: primary,
      primary,
      alternates,
      selectedAlternate: 0,
    }),
  selectAlternate: (index) =>
    set((s) => {
      // index 0 = primary; 1..N = alternates[index-1].
      if (index === 0) {
        return { computed: s.primary, selectedAlternate: 0 };
      }
      const alt = s.alternates[index - 1];
      if (!alt) return {};
      return { computed: alt, selectedAlternate: index };
    }),
  setComputing: (isComputing) => set({ isComputing }),
  setComputeError: (computeError, hint = null) =>
    set({ computeError, computeErrorHint: hint }),
  setPreferences: (patch) =>
    set((s) => ({
      preferences: { ...s.preferences, ...patch },
      ...bump(s),
    })),

  setShowSaveForm: (showSaveForm) => set({ showSaveForm }),
  setPublishing: (isPublishing) => set({ isPublishing }),

  loadFromExisting: (authorId, routeId, body) => {
    const initialComputed = body.geometry
      ? {
          polyline: body.geometry.polyline,
          decoded: [] as LngLat[],
          distance_m: body.distance_m ?? 0,
          duration_s: body.estimated_duration_s ?? 0,
          elevation_gain_m: body.elevation_gain_m ?? undefined,
          elevation_loss_m: body.elevation_loss_m ?? undefined,
          engine:
            body.geometry.engine === "manual" ||
            body.geometry.engine === "gpx"
              ? (body.geometry.engine as "manual" | "gpx")
              : ("valhalla" as const),
          costing: body.geometry.costing ?? null,
          computed_at: body.geometry.computed_at,
        }
      : null;
    set(() => ({
      ...INITIAL,
      slots: body.waypoints.map((w) => waypointJsonToSlot(w)),
      isOpen: true,
      mode: "edit",
      editingFromAuthor: authorId,
      editingFromId: routeId,
      name: body.name,
      description: body.description ?? "",
      activity: body.activity,
      difficulty: body.difficulty ?? null,
      imageUri: body.image_uri ?? null,
      computed: initialComputed,
      primary: initialComputed,
      alternates: [],
      selectedAlternate: 0,
    }));
  },
}),
    {
      name: "mapky-directions",
      version: 1,
      // Persist only the user-authored bits — slots, activity, prefs, and
      // the save-form draft (name/description/difficulty). Don't persist
      // the snapped result itself: it's expensive to serialize, depends
      // on Valhalla being callable, and we want a fresh snap on rehydrate
      // anyway. Don't persist isOpen either — opening directions on every
      // app boot would be intrusive.
      partialize: (state) => ({
        slots: state.slots,
        activity: state.activity,
        difficulty: state.difficulty,
        name: state.name,
        description: state.description,
        imageUri: state.imageUri,
        preferences: state.preferences,
      }),
      // Bump computeNonce after rehydrate so the snap effect fires once
      // we land in directions mode again.
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.computeNonce = (state.computeNonce ?? 0) + 1;
        }
      },
    },
  ),
);

// Dev-only: expose the store on window for E2E tests / quick debugging.
// Bundled out of production builds via the Vite import.meta.env.DEV gate.
if (typeof window !== "undefined" && import.meta.env.DEV) {
  // @ts-expect-error — dev-only hook
  window.__route = useRouteCreationStore;
}

/**
 * Convert a raw Valhalla snap result into the `RouteComputed` shape the
 * store stores. Pure function; lives next to the store so callers don't
 * forget any field.
 */
export function snapToComputed(snap: RouteSnapResult): RouteComputed {
  return {
    polyline: snap.polyline,
    decoded: snap.decoded,
    distance_m: snap.distance_m,
    duration_s: snap.duration_s,
    elevation_gain_m: snap.elevation_gain_m,
    elevation_loss_m: snap.elevation_loss_m,
    hasFerry: snap.hasFerry,
    engine: snap.engine,
    costing: snap.costing,
    computed_at: snap.computed_at,
  };
}

/**
 * Translate a typed slot to the {lat, lon, ele?, name?} the routing engine
 * (and saved JSON) expects. Empty slots are filtered out by the caller.
 */
export function slotToWaypoint(slot: WaypointSlot): Waypoint | null {
  if (slot.kind === "empty") return null;
  return {
    lat: slot.lat,
    lon: slot.lon,
    ele: null,
    name: slot.label,
  };
}

function waypointJsonToSlot(w: RouteWaypointJson): WaypointSlot {
  return {
    kind: "coords",
    id: newId(),
    lat: w.lat,
    lon: w.lon,
    label: w.name ?? `${w.lat.toFixed(5)}, ${w.lon.toFixed(5)}`,
  };
}

/** Number of usable slots (non-empty). */
export function readySlotCount(slots: WaypointSlot[]): number {
  return slots.filter((s) => s.kind !== "empty").length;
}
