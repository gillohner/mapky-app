import { Layers } from "lucide-react";
import { useUiStore } from "@/stores/ui-store";
import { useMapStore } from "@/stores/map-store";

/**
 * Floating button (bottom-left) that opens the Layers sheet.
 *
 * - **Mobile (< md)**: flush left at `left-3` so it lines up vertically
 *   with the `MobileMenuTrigger` (hamburger) at the top of the same
 *   edge. The rail isn't rendered below `md:`, so there's nothing to
 *   dodge.
 * - **Desktop (md+)**: past the IconRail (w-12 = 48 px) at `md:left-14`,
 *   sliding to `md:left-[440px]` when a discover sidebar opens so the
 *   sidebar never covers it.
 *
 * MapLegends stack above it when their overlays are on.
 */
export function LayerSheetTrigger() {
  const open = useUiStore((s) => s.layerSheetOpen);
  const toggle = useUiStore((s) => s.toggleLayerSheet);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);

  // Light "active dot" hint when the user has flipped any toggle off
  // its default — a non-default overlay/basemap is on, a Mapky data
  // layer has been turned off, or any place filter is active.
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

  return (
    <button
      onClick={toggle}
      data-mapky-layer-trigger
      aria-label={open ? "Close layers" : "Open layers"}
      className={`mapky-layer-trigger pointer-events-auto fixed z-30 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background/95 text-foreground shadow-lg backdrop-blur transition-[left,bottom] duration-300 hover:border-accent ${
        sidebarOpen ? "left-3 md:left-[440px]" : "left-3 md:left-14"
      }`}
      style={{
        // Mobile: ride above the bottom sheet (var set by
        // MobileBottomSheet, defaults to 0 when no sheet is open).
        // Desktop: a fixed corner offset, set in app.css via media query.
        bottom:
          "calc(var(--mobile-sheet-vh, 0) * 1vh + 0.75rem + env(safe-area-inset-bottom))",
      }}
    >
      <Layers className="h-5 w-5" />
      {nonDefault && (
        <span
          className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent"
          aria-hidden
        />
      )}
    </button>
  );
}
