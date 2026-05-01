import { useEffect, useId } from "react";
import { useUiStore } from "@/stores/ui-store";

/**
 * Marks a sidebar component as mounted in the ui-store. Used by every
 * sidebar surface (DiscoverSidebar, DirectionsLayer, SearchPanel) so
 * the SearchBar / LayerSheetTrigger know to slide past the gutter.
 *
 * Counter-based via `registerSidebar` / `unregisterSidebar` rather
 * than the older boolean toggle: route transitions briefly mount the
 * NEW sidebar before the OLD one's cleanup runs, and a plain boolean
 * setter would race in that window — the unmount cleanup of the
 * outgoing sidebar would override the incoming sidebar's "open"
 * write, leaving the SearchBar painted on top of the new sidebar's
 * header until something else triggered a re-evaluation.
 */
export function useSidebarPresence(enabled: boolean = true): void {
  const id = useId();
  const register = useUiStore((s) => s.registerSidebar);
  const unregister = useUiStore((s) => s.unregisterSidebar);
  useEffect(() => {
    if (!enabled) return;
    register(id);
    return () => unregister(id);
  }, [id, enabled, register, unregister]);
}
