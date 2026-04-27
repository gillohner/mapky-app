import { useUiStore } from "@/stores/ui-store";
import { useRouteCreationStore } from "@/stores/route-creation-store";
import { RoutesViewportLayer } from "./RoutesViewportLayer";

/**
 * Mount the routes viewport layer when the user toggled it on, but disable
 * during route creation/edit (the in-progress polyline takes the stage).
 */
export function ViewportRoutesGate() {
  const visible = useUiStore((s) => s.routesLayerVisible);
  const creating = useRouteCreationStore((s) => s.isOpen);
  return <RoutesViewportLayer enabled={visible && !creating} />;
}
