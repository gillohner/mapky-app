import { create } from "zustand";
import type { GeoCaptureKind } from "@/types/mapky";
import type { GeoExif } from "@/lib/exif";

export type CaptureStep = "pick" | "place" | "caption" | "tag" | "review";

export const CAPTURE_STEPS: CaptureStep[] = [
  "pick",
  "place",
  "caption",
  "tag",
  "review",
];

/**
 * One media file + its own metadata. Per-item coordinates & heading give each
 * image in a sequence its own pin on the map, initialised from EXIF when
 * present and editable via PlaceStep/AimStep.
 */
export interface DraftItem {
  id: string;
  file: File;
  previewUrl: string;
  exif: GeoExif | null;
  kind: GeoCaptureKind;

  // Per-item editable fields.
  lat: number | null;
  lon: number | null;
  heading: number | null;
  pitch: number | null;
  fov: number | null;
  /** UNIX microseconds — from EXIF DateTimeOriginal. */
  capturedAt: number | null;
}

interface CaptureCreationState {
  isOpen: boolean;
  step: CaptureStep;

  /** All picked files. length 1 → single mode, length >1 → batch/sequence. */
  items: DraftItem[];
  /** Index currently focused in map-interactive steps. */
  activeIndex: number;

  // Sequence-wide (apply once to the published sequence JSON).
  caption: string; // Used as capture caption in single mode.
  pendingTags: string[];
  sequenceName: string;
  sequenceDescription: string;

  isPublishing: boolean;

  open: () => void;
  close: () => void;
  reset: () => void;

  next: () => void;
  prev: () => void;
  setStep: (step: CaptureStep) => void;

  setItems: (items: DraftItem[]) => void;
  removeItem: (id: string) => void;
  reorderItems: (ids: string[]) => void;
  setActiveIndex: (idx: number) => void;

  // Per-item mutations — write to items[activeIndex].
  setActiveCoords: (lat: number, lon: number) => void;
  setActiveHeading: (heading: number | null) => void;
  setActivePitch: (pitch: number | null) => void;
  setActiveFov: (fov: number | null) => void;

  // Apply active item's coords/heading to every other item missing them.
  applyActiveToAll: () => void;

  setCaption: (caption: string) => void;
  setSequenceName: (name: string) => void;
  setSequenceDescription: (description: string) => void;
  addTag: (label: string) => void;
  removeTag: (label: string) => void;
  setIsPublishing: (publishing: boolean) => void;
}

const INITIAL = {
  isOpen: false,
  step: "pick" as CaptureStep,
  items: [] as DraftItem[],
  activeIndex: 0,
  caption: "",
  pendingTags: [] as string[],
  sequenceName: "",
  sequenceDescription: "",
  isPublishing: false,
};

function stepIndex(step: CaptureStep): number {
  return CAPTURE_STEPS.indexOf(step);
}

function revokeItems(items: DraftItem[]) {
  for (const it of items) {
    URL.revokeObjectURL(it.previewUrl);
  }
}

/** Build a DraftItem seeded from its EXIF. */
export function makeDraftItem(
  file: File,
  previewUrl: string,
  exif: GeoExif | null,
  kind: GeoCaptureKind,
): DraftItem {
  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    previewUrl,
    exif,
    kind,
    lat: exif?.lat ?? null,
    lon: exif?.lon ?? null,
    heading: exif?.heading ?? null,
    pitch: exif?.pitch ?? null,
    fov: null,
    capturedAt: exif?.capturedAt ?? null,
  };
}

function updateActiveItem(
  items: DraftItem[],
  activeIndex: number,
  patch: Partial<DraftItem>,
): DraftItem[] {
  return items.map((it, i) => (i === activeIndex ? { ...it, ...patch } : it));
}

export const useCaptureCreationStore = create<CaptureCreationState>((set, get) => ({
  ...INITIAL,

  open: () => set({ ...INITIAL, isOpen: true }),

  close: () => {
    revokeItems(get().items);
    set({ ...INITIAL });
  },

  reset: () => {
    revokeItems(get().items);
    set({ ...INITIAL, isOpen: get().isOpen });
  },

  next: () =>
    set((s) => {
      const idx = stepIndex(s.step);
      const nextIdx = Math.min(idx + 1, CAPTURE_STEPS.length - 1);
      return { step: CAPTURE_STEPS[nextIdx] };
    }),
  prev: () =>
    set((s) => {
      const idx = stepIndex(s.step);
      const prevIdx = Math.max(idx - 1, 0);
      return { step: CAPTURE_STEPS[prevIdx] };
    }),
  setStep: (step) => set({ step }),

  setItems: (items) => {
    revokeItems(get().items);
    set({ items, activeIndex: 0 });
  },

  removeItem: (id) =>
    set((s) => {
      const target = s.items.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      const items = s.items.filter((i) => i.id !== id);
      const activeIndex = Math.min(s.activeIndex, Math.max(0, items.length - 1));
      return { items, activeIndex };
    }),

  reorderItems: (ids) =>
    set((s) => {
      const byId = new Map(s.items.map((i) => [i.id, i]));
      const items = ids
        .map((id) => byId.get(id))
        .filter((x): x is DraftItem => !!x);
      return { items };
    }),

  setActiveIndex: (idx) =>
    set((s) => ({
      activeIndex: Math.max(0, Math.min(idx, s.items.length - 1)),
    })),

  setActiveCoords: (lat, lon) =>
    set((s) => ({
      items: updateActiveItem(s.items, s.activeIndex, { lat, lon }),
    })),
  setActiveHeading: (heading) =>
    set((s) => ({
      items: updateActiveItem(s.items, s.activeIndex, { heading }),
    })),
  setActivePitch: (pitch) =>
    set((s) => ({
      items: updateActiveItem(s.items, s.activeIndex, { pitch }),
    })),
  setActiveFov: (fov) =>
    set((s) => ({
      items: updateActiveItem(s.items, s.activeIndex, { fov }),
    })),

  applyActiveToAll: () =>
    set((s) => {
      const a = s.items[s.activeIndex];
      if (!a) return s;
      const items = s.items.map((it) => ({
        ...it,
        lat: it.lat ?? a.lat,
        lon: it.lon ?? a.lon,
        heading: it.heading ?? a.heading,
        pitch: it.pitch ?? a.pitch,
        fov: it.fov ?? a.fov,
      }));
      return { items };
    }),

  setCaption: (caption) => set({ caption }),
  setSequenceName: (sequenceName) => set({ sequenceName }),
  setSequenceDescription: (sequenceDescription) => set({ sequenceDescription }),

  addTag: (label) =>
    set((s) => {
      const trimmed = label.trim().toLowerCase();
      if (!trimmed || s.pendingTags.includes(trimmed)) return s;
      return { pendingTags: [...s.pendingTags, trimmed] };
    }),
  removeTag: (label) =>
    set((s) => ({ pendingTags: s.pendingTags.filter((t) => t !== label) })),

  setIsPublishing: (publishing) => set({ isPublishing: publishing }),
}));

/** Selector: the active draft item (null if none picked). */
export function useActiveDraftItem(): DraftItem | null {
  return useCaptureCreationStore((s) => s.items[s.activeIndex] ?? null);
}

/** Selector: true when more than one file is queued — batch/sequence mode. */
export function useIsBatch(): boolean {
  return useCaptureCreationStore((s) => s.items.length > 1);
}

/** Selector: true when every item has lat + lon (via EXIF or manual). */
export function useAllItemsHaveCoords(): boolean {
  return useCaptureCreationStore((s) =>
    s.items.length > 0 && s.items.every((i) => i.lat != null && i.lon != null),
  );
}
