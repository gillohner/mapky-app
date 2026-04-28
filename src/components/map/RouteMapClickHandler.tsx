import { useEffect } from "react";
import type maplibregl from "maplibre-gl";
import { useMapStore } from "@/stores/map-store";
import { useRouteCreationStore } from "@/stores/route-creation-store";
import { pickFeature } from "@/lib/map/pick-feature";

/**
 * Map-click integration for directions mode. When the user has activated
 * "Choose on map" for a slot (`pickingForSlot` is set), the next map
 * click fills that slot.
 *
 * The click is resolved through the same layered POI / place / building
 * picker the rest of the app uses, so a click that lands on (or near) a
 * POI, place label, or building yields a `place` slot anchored to the
 * actual OSM element instead of a bare lat/lon. Only when nothing
 * decodable is under the cursor do we fall back to raw coordinates.
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
      const cur = useRouteCreationStore.getState().slots[pickingForSlot];
      if (!cur) return;

      const hit = pickFeature(map, e.point);
      if (hit && hit.osmType && hit.osmId) {
        // Prefer the feature's own point geometry so the snap target is
        // the POI itself, not the (possibly off-by-a-few-pixels) cursor.
        const lat = hit.lat ?? e.lngLat.lat;
        const lon = hit.lng ?? e.lngLat.lng;
        const label =
          hit.name || `${hit.osmType}/${hit.osmId}`;
        setSlot(pickingForSlot, {
          kind: "place",
          id: cur.id,
          lat,
          lon,
          label,
          osmType: hit.osmType,
          osmId: hit.osmId,
        });
      } else {
        const { lat, lng } = e.lngLat;
        setSlot(pickingForSlot, {
          kind: "coords",
          id: cur.id,
          lat,
          lon: lng,
          label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        });
      }
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
