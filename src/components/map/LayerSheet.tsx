import { useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X,
  MapPin,
  Camera,
  Route as RouteIcon,
  Sun,
  Moon,
  Satellite,
  TrainFront,
  Bike,
  Mountain,
  Building2,
} from "lucide-react";
import { useUiStore } from "@/stores/ui-store";
import { useMapStore } from "@/stores/map-store";

/**
 * Single source of truth for what's drawn on the map. Replaces the flat
 * layer-toggle stripe in the icon rail with a Google/Apple Maps-style
 * sheet (bottom-sheet on mobile, anchored card on desktop) grouped into
 * Mapky data, Basemap, and Overlays sections. Closes on Escape and
 * outside-click.
 */
export function LayerSheet() {
  const open = useUiStore((s) => s.layerSheetOpen);
  const setOpen = useUiStore((s) => s.setLayerSheetOpen);

  const placesLayerVisible = useUiStore((s) => s.placesLayerVisible);
  const togglePlacesLayer = useUiStore((s) => s.togglePlacesLayer);
  const capturesLayerVisible = useUiStore((s) => s.capturesLayerVisible);
  const toggleCapturesLayer = useUiStore((s) => s.toggleCapturesLayer);
  const routesLayerVisible = useUiStore((s) => s.routesLayerVisible);
  const toggleRoutesLayer = useUiStore((s) => s.toggleRoutesLayer);

  const metroOverlayVisible = useUiStore((s) => s.metroOverlayVisible);
  const toggleMetroOverlay = useUiStore((s) => s.toggleMetroOverlay);

  const cyclingOverlayVisible = useUiStore((s) => s.cyclingOverlayVisible);
  const toggleCyclingOverlay = useUiStore((s) => s.toggleCyclingOverlay);

  const terrainOverlayVisible = useUiStore((s) => s.terrainOverlayVisible);
  const toggleTerrainOverlay = useUiStore((s) => s.toggleTerrainOverlay);

  const buildings3DVisible = useUiStore((s) => s.buildings3DVisible);
  const toggleBuildings3D = useUiStore((s) => s.toggleBuildings3D);

  const activeCollections = useUiStore((s) => s.activeCollectionOverlays);
  const clearAllCollectionOverlays = useUiStore(
    (s) => s.clearAllCollectionOverlays,
  );

  const theme = useMapStore((s) => s.theme);
  const setTheme = useMapStore((s) => s.setTheme);
  const basemap = useMapStore((s) => s.basemap);
  const setBasemap = useMapStore((s) => s.setBasemap);
  const satelliteLabels = useMapStore((s) => s.satelliteLabels);
  const toggleSatelliteLabels = useMapStore((s) => s.toggleSatelliteLabels);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  const handleSetTheme = (t: "light" | "dark") => {
    setTheme(t);
    document.documentElement.classList.toggle("dark", t === "dark");
    // Picking a theme also implies the default vector basemap.
    if (basemap !== "default") setBasemap("default");
  };

  const handleSetSatellite = () => setBasemap("satellite");

  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-start justify-end pointer-events-none"
      onClick={() => setOpen(false)}
    >
      {/* Backdrop captures clicks to dismiss; visible only on mobile. */}
      <div className="pointer-events-auto absolute inset-0 bg-black/30 backdrop-blur-[1px] sm:hidden" />

      {/* Sheet */}
      <div
        className="pointer-events-auto relative m-2 mt-16 w-full max-w-md rounded-2xl border border-border bg-background/95 p-4 shadow-xl backdrop-blur sm:mr-6 sm:mt-20 sm:w-80"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
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

        {/* Mapky data */}
        <Section title="Mapky data">
          <Toggle
            icon={<MapPin className="h-4 w-4" />}
            label="Places"
            description="Pubky-tagged spots on the map"
            on={placesLayerVisible}
            onChange={togglePlacesLayer}
          />
          <Toggle
            icon={<Camera className="h-4 w-4" />}
            label="Captures"
            description="Photos, panoramas, and tracks"
            on={capturesLayerVisible}
            onChange={toggleCapturesLayer}
          />
          <Toggle
            icon={<RouteIcon className="h-4 w-4" />}
            label="Routes"
            description="Saved walking, biking, hiking routes"
            on={routesLayerVisible}
            onChange={toggleRoutesLayer}
          />
          {activeCollections.size > 0 && (
            <button
              onClick={clearAllCollectionOverlays}
              className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-left text-xs text-muted hover:border-accent hover:text-foreground"
            >
              Hide all {activeCollections.size} pinned collection
              {activeCollections.size === 1 ? "" : "s"}
            </button>
          )}
        </Section>

        {/* Basemap */}
        <Section title="Basemap">
          <div className="grid grid-cols-3 gap-1.5">
            <BasemapTile
              icon={<Sun className="h-4 w-4" />}
              label="Light"
              active={basemap === "default" && theme === "light"}
              onClick={() => handleSetTheme("light")}
            />
            <BasemapTile
              icon={<Moon className="h-4 w-4" />}
              label="Dark"
              active={basemap === "default" && theme === "dark"}
              onClick={() => handleSetTheme("dark")}
            />
            <BasemapTile
              icon={<Satellite className="h-4 w-4" />}
              label="Satellite"
              active={basemap === "satellite"}
              onClick={handleSetSatellite}
            />
          </div>
          {basemap === "satellite" && (
            <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-surface">
              <input
                type="checkbox"
                checked={satelliteLabels}
                onChange={toggleSatelliteLabels}
                className="h-3.5 w-3.5 accent-accent"
              />
              <span className="flex-1">Show place &amp; road labels</span>
            </label>
          )}
        </Section>

        {/* Overlays */}
        <Section title="Overlays" lastSection>
          <Toggle
            icon={<TrainFront className="h-4 w-4" />}
            label="Rail & metro"
            description="OpenRailwayMap — lines, stations, signals"
            on={metroOverlayVisible}
            onChange={toggleMetroOverlay}
          />
          <Toggle
            icon={<Bike className="h-4 w-4" />}
            label="Cycling"
            description="CyclOSM — bike lanes, paths, infrastructure"
            on={cyclingOverlayVisible}
            onChange={toggleCyclingOverlay}
          />
          <Toggle
            icon={<Mountain className="h-4 w-4" />}
            label="Terrain"
            description="Hillshade relief from elevation tiles"
            on={terrainOverlayVisible}
            onChange={toggleTerrainOverlay}
          />
          <Toggle
            icon={<Building2 className="h-4 w-4" />}
            label="3D buildings"
            description="Tilt the map to see extruded volumes"
            on={buildings3DVisible}
            onChange={toggleBuildings3D}
          />
        </Section>
      </div>
    </div>,
    document.body,
  );
}

function Section({
  title,
  children,
  lastSection,
}: {
  title: string;
  children: React.ReactNode;
  lastSection?: boolean;
}) {
  return (
    <div className={lastSection ? "" : "mb-3 border-b border-border/60 pb-3"}>
      <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
        {title}
      </h3>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

function Toggle({
  icon,
  label,
  description,
  on,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  on: boolean;
  onChange: () => void;
}) {
  return (
    <button
      onClick={onChange}
      className="flex items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface"
    >
      <span
        className={`mt-0.5 ${on ? "text-accent" : "text-muted"}`}
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-foreground">{label}</span>
        <span className="block text-[11px] text-muted">{description}</span>
      </span>
      <Switch on={on} />
    </button>
  );
}

function Switch({ on }: { on: boolean }) {
  return (
    <span
      className={`mt-1 inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full border transition-colors ${
        on
          ? "border-accent bg-accent"
          : "border-border bg-surface"
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
