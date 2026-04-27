import { useEffect } from "react";
import { useMapStore } from "@/stores/map-store";
import { useRouteCreationStore } from "@/stores/route-creation-store";

/**
 * Map-click integration for directions mode. When the user has activated
 * "Choose on map" for a slot (`pickingForSlot` is set), the next map click
 * fills that slot and exits picking mode. Other map clicks pass through to
 * the place-layer handlers (which themselves bail when this store is open).
 */
export function RouteMapClickHandler() {
  const map = useMapStore((s) => s.map);
  const isOpen = useRouteCreationStore((s) => s.isOpen);
  const pickingForSlot = useRouteCreationStore((s) => s.pickingForSlot);
  const setSlot = useRouteCreationStore((s) => s.setSlot);
  const setPickingForSlot = useRouteCreationStore((s) => s.setPickingForSlot);

  useEffect(() => {
    if (!map || !isOpen || pickingForSlot == null) return;

    const handler = (e: maplibregl.MapMouseEvent) => {
      const { lat, lng } = e.lngLat;
      const cur = useRouteCreationStore.getState().slots[pickingForSlot];
      if (!cur) return;
      setSlot(pickingForSlot, {
        kind: "coords",
        id: cur.id,
        lat,
        lon: lng,
        label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      });
      setPickingForSlot(null);
    };

    map.on("click", handler);
    map.getCanvas().style.cursor = "crosshair";

    return () => {
      map.off("click", handler);
      map.getCanvas().style.cursor = "";
    };
  }, [map, isOpen, pickingForSlot, setSlot, setPickingForSlot]);

  return null;
}
