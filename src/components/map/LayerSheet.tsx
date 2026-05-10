import { useEffect } from "react";
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
  Layers,
} from "lucide-react";
import { useUiStore } from "@/stores/ui-store";
import { useMapStore } from "@/stores/map-store";
import { PlaceFilterControls } from "@/components/place/PlaceFilterControls";
import type { LayerSheetTab } from "@/stores/ui-store";

/**
 * Layers panel — bottom-left, behaves the same as MapLegends:
 *
 *   - Collapsed: round icon-only button (h-11 w-11 round). Click to
 *     expand the card in place. No portal, no fullscreen modal, no
 *     mobile backdrop blur.
 *   - Expanded: card grows upward from the bottom-anchored wrapper
 *     to fit the tab bar + active-tab content. Click the icon (or
 *     the close X) to collapse back to the round button.
 *
 * Three tabs share the body region: Mapky data, Basemap, Overlays —
 * only one tab's content renders at a time. Last-viewed tab persists
 * via `layerSheetActiveTab` so re-opening lands where the user left.
 */
export function LayerSheet() {
  const open = useUiStore((s) => s.layerSheetOpen);
  const setOpen = useUiStore((s) => s.setLayerSheetOpen);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const activeTab = useUiStore((s) => s.layerSheetActiveTab);
  const setActiveTab = useUiStore((s) => s.setLayerSheetActiveTab);
  // Hide Layers entirely while the legend is expanded — both share
  // the same bottom-left slot, and the collapsed Layers pill
  // would otherwise peek through the legend card's edges.
  const legendOpen = useUiStore((s) => s.legendExpanded);

  // Active-dot indicator when any toggle is off its default — same
  // signal LayerSheetTrigger used to carry, now lives on the merged
  // header button.
  const metro = useUiStore((s) => s.metroOverlayVisible);
  const btcOverlay = useUiStore((s) => s.btcOverlayVisible);
  const filters = useUiStore((s) => s.placesFilters);
  const buildings = useUiStore((s) => s.buildings3DVisible);
  const places = useUiStore((s) => s.placesLayerVisible);
  const captures = useUiStore((s) => s.capturesLayerVisible);
  const basemap = useMapStore((s) => s.basemap);
  const filtersActive =
    filters.activities.length > 0 || (filters.minRating ?? 0) > 0;
  const nonDefault =
    metro ||
    btcOverlay ||
    filtersActive ||
    buildings ||
    !places ||
    !captures ||
    basemap !== "default";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (legendOpen && !open) return null;

  return (
    <div
      // Same anchor + sidebar-tracking math as LayerSheetTrigger had,
      // and same as MapLegends so the two cards line up at the same
      // baseline. Width grows when expanded so the body has room for
      // the tab content.
      className={`pointer-events-auto fixed z-30 flex max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-background/95 shadow-lg backdrop-blur transition-[left,width] duration-300 hover:border-accent ${
        sidebarOpen ? "left-3 md:left-[440px]" : "left-3 md:left-14"
      } ${open ? "w-[calc(100%-1.5rem)] sm:w-80" : "w-11"}`}
      data-mapky-layer-trigger
      style={{
        bottom:
          "calc(var(--mobile-sheet-vh, 0) * 1vh + 0.25rem + env(safe-area-inset-bottom))",
        // Cap height so portrait/short viewports get an internal
        // scroll instead of overflowing past the top of the page.
        // Only applied when expanded — collapsed pill is just h-11.
        maxHeight: open ? "calc(100dvh - 6rem)" : undefined,
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        aria-label={open ? "Close layers" : "Open layers"}
        aria-expanded={open}
        className={`relative flex h-11 w-full flex-shrink-0 items-center transition-colors ${
          open
            ? "justify-between gap-2 px-3 text-xs font-medium"
            : "justify-center"
        } text-foreground`}
      >
        <Layers className="h-5 w-5" />
        {open && <span className="flex-1 text-left">Layers</span>}
        {open && (
          <X className="h-4 w-4 text-muted" aria-hidden />
        )}
        {!open && nonDefault && (
          <span
            className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent"
            aria-hidden
          />
        )}
      </button>
      {open && (
        <div className="flex flex-1 flex-col overflow-hidden border-t border-border px-3 pb-2 pt-2">
          <TabBar active={activeTab} onChange={setActiveTab} />
          <div className="-mx-1 mt-2 flex-1 overflow-y-auto px-1 pb-1">
            {activeTab === "mapky" && <MapkyTab />}
            {activeTab === "basemap" && <BasemapTab />}
            {activeTab === "overlays" && <OverlaysTab />}
          </div>
        </div>
      )}
    </div>
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
