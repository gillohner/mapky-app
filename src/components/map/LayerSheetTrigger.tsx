import { Layers } from "lucide-react";
import { useUiStore } from "@/stores/ui-store";
import { useMapStore } from "@/stores/map-store";

/**
 * Floating button (bottom-left) that opens the Layers sheet. Offset
 * past the IconRail (w-12 = 48px) so it doesn't sit underneath it,
 * and slides right with the same animation as SearchBar when a
 * discover sidebar opens, so it never gets covered by the sidebar.
 * MapLegends stack above it when their overlays are on.
 */
export function LayerSheetTrigger() {
  const open = useUiStore((s) => s.layerSheetOpen);
  const toggle = useUiStore((s) => s.toggleLayerSheet);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);

  // Light "active dot" hint when the user has flipped any toggle off
  // its default — a non-default overlay/basemap is on, OR a Mapky
  // data layer has been turned off.
  const metro = useUiStore((s) => s.metroOverlayVisible);
  const bitcoin = useUiStore((s) => s.bitcoinOverlayVisible);
  const buildings = useUiStore((s) => s.buildings3DVisible);
  const places = useUiStore((s) => s.placesLayerVisible);
  const captures = useUiStore((s) => s.capturesLayerVisible);
  const basemap = useMapStore((s) => s.basemap);
  const nonDefault =
    metro || bitcoin || buildings || !places || !captures || basemap !== "default";

  return (
    <button
      onClick={toggle}
      aria-label={open ? "Close layers" : "Open layers"}
      className={`pointer-events-auto fixed bottom-3 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background/95 text-foreground shadow-lg backdrop-blur transition-[left] duration-300 hover:border-accent sm:bottom-6 ${
        sidebarOpen ? "left-14 md:left-[440px]" : "left-14 sm:left-16"
      }`}
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
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
