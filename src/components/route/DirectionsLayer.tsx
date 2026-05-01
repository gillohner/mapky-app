import { useEffect, useMemo } from "react";
import { useMapStore } from "@/stores/map-store";
import { useRouteCreationStore } from "@/stores/route-creation-store";
import { useUiStore } from "@/stores/ui-store";
import { RouteAlternativesLayer } from "@/components/map/RouteAlternativesLayer";
import { WaypointMarkers } from "@/components/map/WaypointMarkers";
import { RouteMapClickHandler } from "@/components/map/RouteMapClickHandler";
import { DirectionsBar } from "./DirectionsBar";
import { RouteSummaryCard } from "./RouteSummaryCard";
import { MobileBottomSheet } from "@/components/shared/MobileBottomSheet";
import { useSidebarPresence } from "@/hooks/use-sidebar-presence";

/**
 * Mounts the directions UI as a left-anchored sidebar (Google Maps style).
 *
 * Layout on md+:
 *   ┌────┬─────────┬─────────────────────┐
 *   │Rail│ Direc-  │       Map           │
 *   │ 48 │ tions   │   (fitBounds pads   │
 *   │ px │ panel   │    left for the     │
 *   │    │ 380 px  │    sidebar)         │
 *   └────┴─────────┴─────────────────────┘
 *
 * Mobile collapses the panel to a bottom sheet handled inside the
 * children's responsive classes.
 *
 * Sets `sidebarOpen` so SearchBar shifts and fitBounds knows to pad left.
 */
export function DirectionsLayer() {
  const isOpen = useRouteCreationStore((s) => s.isOpen);
  const computed = useRouteCreationStore((s) => s.computed);
  const slots = useRouteCreationStore((s) => s.slots);
  const map = useMapStore((s) => s.map);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);

  // Register presence only while directions is active. The hook uses
  // a counter in ui-store, so a transient overlap with the next
  // sidebar (e.g. /directions → /route/...) keeps `sidebarOpen` true
  // through the handover instead of flickering false in the gap
  // between this layer's cleanup and the new sidebar's mount.
  useSidebarPresence(isOpen);

  const fallbackLine = useMemo(
    () =>
      slots
        .filter((s) => s.kind !== "empty")
        .map(
          (s) =>
            [
              (s as Exclude<typeof s, { kind: "empty" }>).lon,
              (s as Exclude<typeof s, { kind: "empty" }>).lat,
            ] as [number, number],
        ),
    [slots],
  );

  // Fit map to the computed route once it's available. Pad left for the
  // directions sidebar (only when it's actually visible — mobile uses a
  // bottom sheet so the bottom pad does the work there instead).
  useEffect(() => {
    if (!map || !computed || computed.decoded.length < 2) return;
    let minLng = Infinity,
      minLat = Infinity,
      maxLng = -Infinity,
      maxLat = -Infinity;
    for (const [lng, lat] of computed.decoded) {
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    }
    if (!Number.isFinite(minLng)) return;
    const isDesktop =
      typeof window !== "undefined" && window.innerWidth >= 768;
    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      {
        padding: {
          top: 80,
          bottom: isDesktop ? 80 : 320,
          left: sidebarOpen && isDesktop ? 460 : 80,
          right: 80,
        },
        duration: 600,
        maxZoom: 16,
      },
    );
  }, [map, computed, sidebarOpen]);

  if (!isOpen) return null;

  return (
    <>
      <RouteMapClickHandler />
      <WaypointMarkers />
      <RouteAlternativesLayer fallbackWaypoints={fallbackLine} />

      {/* Desktop: left-anchored sidebar (same area as PlacePanel) */}
      <div className="pointer-events-auto absolute inset-y-0 left-12 z-10 hidden w-[380px] flex-col border-r border-border bg-background shadow-xl md:flex">
        <div className="flex flex-1 flex-col overflow-y-auto">
          <DirectionsBar />
          <RouteSummaryCard />
        </div>
      </div>

      {/* Mobile: shared draggable bottom sheet — DirectionsBar lives in
          the always-visible header so the user can edit start/end at
          any snap; the route summary lives in the body. */}
      <MobileBottomSheet
        defaultSnap="middle"
        header={<DirectionsBar />}
      >
        <RouteSummaryCard />
      </MobileBottomSheet>
    </>
  );
}
