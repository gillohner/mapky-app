import { Layers } from "lucide-react";
import { useUiStore } from "@/stores/ui-store";

/**
 * Floating button (bottom-right) that opens the Layers sheet — same
 * pattern as Google Maps. Mounted once in `__root.tsx` so it's reachable
 * from any route. On mobile the bottom sheet for a detail panel
 * (`sidebarOpen`) eats the bottom-right corner, so we lift the trigger
 * above 60vh (the panel's max height) when one is open.
 */
export function LayerSheetTrigger() {
  const open = useUiStore((s) => s.layerSheetOpen);
  const toggle = useUiStore((s) => s.toggleLayerSheet);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);

  // Light "active dot" hint when any non-default layer state is on. Helps
  // users notice they have a non-default visual filter applied.
  const places = useUiStore((s) => s.placesLayerVisible);
  const captures = useUiStore((s) => s.capturesLayerVisible);
  const routes = useUiStore((s) => s.routesLayerVisible);
  const nonDefault = !places || !captures || routes;

  // On mobile (sm:), bottom sheet detail panels cover up to ~60vh from
  // the bottom — bump the trigger above them when open via a CSS var.
  // On desktop sm:bottom-6 wins (panels are top-right-anchored).
  const mobileBottomVar = sidebarOpen
    ? "calc(60vh + 0.75rem + env(safe-area-inset-bottom))"
    : "calc(0.75rem + env(safe-area-inset-bottom))";

  return (
    <button
      onClick={toggle}
      aria-label={open ? "Close layers" : "Open layers"}
      className="pointer-events-auto fixed right-3 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background/95 text-foreground shadow-lg backdrop-blur transition-[bottom] duration-200 hover:border-accent bottom-[var(--mapky-trigger-bottom)] sm:bottom-6 sm:right-6"
      style={{ "--mapky-trigger-bottom": mobileBottomVar } as React.CSSProperties}
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
