import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Camera,
  MapPin,
  Satellite,
  Map as MapIcon,
  TrainFront,
  Bike,
  Mountain,
  Building2,
  Bitcoin,
} from "lucide-react";
import { useUiStore } from "@/stores/ui-store";
import { useMapStore } from "@/stores/map-store";
import { PlaceFilterControls } from "@/components/place/PlaceFilterControls";
import type { LayerSheetTab } from "@/stores/ui-store";

/**
 * Layers sheet — Mapky data toggles + basemap + raster/extrusion
 * overlays organized into 3 tabs (Mapky data, Basemap, Overlays). Only
 * one tab's content renders at a time so the sheet stays compact on
 * portrait/short viewports. The tab bar pins to the top; the body
 * scrolls if a tab's content does run long.
 *
 * The Places/Captures toggles act on the bare home map; once the user
 * opens any sidebar (places / collections / routes / captures / search
 * / detail), `useAutoFocusLayer` overrides them via the `hiddenLayers`
 * set so the focused resource owns the map.
 */
export function LayerSheet() {
  const open = useUiStore((s) => s.layerSheetOpen);
  const setOpen = useUiStore((s) => s.setLayerSheetOpen);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const activeTab = useUiStore((s) => s.layerSheetActiveTab);
  const setActiveTab = useUiStore((s) => s.setLayerSheetActiveTab);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  // Close on outside click. Listen at the document level on the
  // `mousedown` event:
  //
  //   - `click` doesn't work because POI markers (HTML balloons) call
  //     `e.stopPropagation()` in their click handlers — clicks on a
  //     marker would never reach this listener and the sheet would
  //     refuse to close. `mousedown` fires earlier and isn't affected.
  //   - We still skip clicks inside the sheet itself (sheetRef) and on
  //     the trigger button (data-attr) so the trigger's own toggle
  //     handles the close cleanly.
  const sheetRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      if (sheetRef.current && sheetRef.current.contains(target)) return;
      if (target.closest?.("[data-mapky-layer-trigger]")) return;
      setOpen(false);
    };
    const t = setTimeout(() => {
      document.addEventListener("mousedown", onDown);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, setOpen]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-end justify-start pointer-events-none"
      onClick={() => setOpen(false)}
    >
      {/* Backdrop captures clicks to dismiss; visible only on mobile. */}
      <div className="pointer-events-auto absolute inset-0 bg-black/30 backdrop-blur-[1px] sm:hidden" />

      {/* Sheet — anchored bottom-left so it pops up above the
          LayerSheetTrigger button. `flex-col` + `max-h` + inner
          `overflow-y-auto` keep the tab bar pinned and the body
          scrollable on short viewports. `100dvh` (dynamic viewport
          height) tracks iOS browser-chrome changes correctly. */}
      <div
        ref={sheetRef}
        className={`pointer-events-auto relative mx-2 flex w-[calc(100%-1rem)] max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-background/95 p-4 shadow-xl backdrop-blur transition-[margin] duration-300 sm:w-80 ${
          sidebarOpen ? "sm:ml-16 md:ml-[440px]" : "sm:ml-16"
        }`}
        onClick={(e) => e.stopPropagation()}
        style={{
          marginBottom: "calc(5rem + env(safe-area-inset-bottom))",
          maxHeight: "calc(100dvh - 6rem)",
        }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Layers</h2>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="rounded p-1 text-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <TabBar active={activeTab} onChange={setActiveTab} />

        <div className="-mx-1 mt-3 flex-1 overflow-y-auto px-1 pb-1">
          {activeTab === "mapky" && <MapkyTab />}
          {activeTab === "basemap" && <BasemapTab />}
          {activeTab === "overlays" && <OverlaysTab />}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Tab bar ────────────────────────────────────────────────────────

const TABS: ReadonlyArray<{ id: LayerSheetTab; label: string }> = [
  { id: "mapky", label: "Mapky data" },
  { id: "basemap", label: "Basemap" },
  { id: "overlays", label: "Overlays" },
];

function TabBar({
  active,
  onChange,
}: {
  active: LayerSheetTab;
  onChange: (t: LayerSheetTab) => void;
}) {
  return (
    <div role="tablist" className="flex flex-wrap gap-1.5">
      {TABS.map((t) => {
        const on = active === t.id;
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
              on
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-border bg-surface text-muted hover:border-accent/60 hover:text-accent"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Tab contents ───────────────────────────────────────────────────

function MapkyTab() {
  const placesLayerVisible = useUiStore((s) => s.placesLayerVisible);
  const togglePlacesLayer = useUiStore((s) => s.togglePlacesLayer);
  const capturesLayerVisible = useUiStore((s) => s.capturesLayerVisible);
  const toggleCapturesLayer = useUiStore((s) => s.toggleCapturesLayer);
  const activeCollections = useUiStore((s) => s.activeCollectionOverlays);
  const clearAllCollectionOverlays = useUiStore(
    (s) => s.clearAllCollectionOverlays,
  );
  return (
    <div className="flex flex-col gap-1">
      <Toggle
        icon={<MapPin className="h-4 w-4" />}
        label="Places"
        on={placesLayerVisible}
        onChange={togglePlacesLayer}
      />
      <PlaceFilterControls disabled={!placesLayerVisible} />
      <Toggle
        icon={<Camera className="h-4 w-4" />}
        label="Captures"
        on={capturesLayerVisible}
        onChange={toggleCapturesLayer}
      />
      {activeCollections.size > 0 && (
        <button
          onClick={clearAllCollectionOverlays}
          className="mt-2 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-left text-xs text-muted hover:border-accent hover:text-foreground"
        >
          Hide all {activeCollections.size} pinned collection
          {activeCollections.size === 1 ? "" : "s"}
        </button>
      )}
    </div>
  );
}

function BasemapTab() {
  const basemap = useMapStore((s) => s.basemap);
  const setBasemap = useMapStore((s) => s.setBasemap);
  const satelliteLabels = useMapStore((s) => s.satelliteLabels);
  const toggleSatelliteLabels = useMapStore((s) => s.toggleSatelliteLabels);
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-1.5">
        <BasemapTile
          icon={<MapIcon className="h-4 w-4" />}
          label="Map"
          active={basemap === "default"}
          onClick={() => setBasemap("default")}
        />
        <BasemapTile
          icon={<Mountain className="h-4 w-4" />}
          label="Terrain"
          active={basemap === "terrain"}
          onClick={() => setBasemap("terrain")}
        />
        <BasemapTile
          icon={<Bike className="h-4 w-4" />}
          label="Cycling"
          active={basemap === "cycling"}
          onClick={() => setBasemap("cycling")}
        />
        <BasemapTile
          icon={<Satellite className="h-4 w-4" />}
          label="Satellite"
          active={basemap === "satellite"}
          onClick={() => setBasemap("satellite")}
        />
      </div>
      {basemap === "satellite" && (
        <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-surface">
          <input
            type="checkbox"
            checked={satelliteLabels}
            onChange={toggleSatelliteLabels}
            className="h-3.5 w-3.5 accent-accent"
          />
          <span className="flex-1">Show place &amp; road labels</span>
        </label>
      )}
    </div>
  );
}

function OverlaysTab() {
  const btcOverlayVisible = useUiStore((s) => s.btcOverlayVisible);
  const toggleBtcOverlay = useUiStore((s) => s.toggleBtcOverlay);
  const metroOverlayVisible = useUiStore((s) => s.metroOverlayVisible);
  const toggleMetroOverlay = useUiStore((s) => s.toggleMetroOverlay);
  const buildings3DVisible = useUiStore((s) => s.buildings3DVisible);
  const toggleBuildings3D = useUiStore((s) => s.toggleBuildings3D);
  return (
    <div className="flex flex-col gap-1">
      <Toggle
        icon={<Bitcoin className="h-4 w-4" />}
        label="Bitcoin POIs"
        on={btcOverlayVisible}
        onChange={toggleBtcOverlay}
      />
      <Toggle
        icon={<TrainFront className="h-4 w-4" />}
        label="Rail & metro"
        on={metroOverlayVisible}
        onChange={toggleMetroOverlay}
      />
      <Toggle
        icon={<Building2 className="h-4 w-4" />}
        label="3D buildings"
        on={buildings3DVisible}
        onChange={toggleBuildings3D}
      />
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────

function Toggle({
  icon,
  label,
  on,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  on: boolean;
  onChange: () => void;
}) {
  return (
    <button
      onClick={onChange}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface"
    >
      <span className={on ? "text-accent" : "text-muted"} aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-sm text-foreground">{label}</span>
      <Switch on={on} />
    </button>
  );
}

function Switch({ on }: { on: boolean }) {
  return (
    <span
      className={`inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full border transition-colors ${
        on ? "border-accent bg-accent" : "border-border bg-surface"
      }`}
      aria-hidden
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-[18px]" : "translate-x-[2px]"
        }`}
      />
    </span>
  );
}

function BasemapTile({
  icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center gap-1 rounded-md border px-2 py-2 text-[11px] transition-colors ${
        active
          ? "border-accent bg-accent/10 text-foreground"
          : disabled
            ? "border-border/50 text-muted/60"
            : "border-border bg-surface text-foreground hover:border-accent"
      } ${disabled ? "cursor-not-allowed" : ""}`}
    >
      <span aria-hidden>{icon}</span>
      <span>
        {label}
        {disabled && <span className="ml-1 text-[9px] uppercase">soon</span>}
      </span>
    </button>
  );
}
