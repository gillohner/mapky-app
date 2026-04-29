import { Layers } from "lucide-react";
import { useUiStore } from "@/stores/ui-store";

/**
 * Floating button (top-right) that opens the Layers sheet. Sits next
 * to the search bar on mobile (which now reserves a 64px slot on its
 * right edge) and just above the corner on desktop.
 */
export function LayerSheetTrigger() {
  const open = useUiStore((s) => s.layerSheetOpen);
  const toggle = useUiStore((s) => s.toggleLayerSheet);

  // Light "active dot" hint when any of the optional overlays are on.
  const metro = useUiStore((s) => s.metroOverlayVisible);
  const cycling = useUiStore((s) => s.cyclingOverlayVisible);
  const terrain = useUiStore((s) => s.terrainOverlayVisible);
  const buildings = useUiStore((s) => s.buildings3DVisible);
  const nonDefault = metro || cycling || terrain || buildings;

  return (
    <button
      onClick={toggle}
      aria-label={open ? "Close layers" : "Open layers"}
      className="pointer-events-auto fixed right-3 top-3 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background/95 text-foreground shadow-lg backdrop-blur hover:border-accent sm:right-6 sm:top-6"
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
