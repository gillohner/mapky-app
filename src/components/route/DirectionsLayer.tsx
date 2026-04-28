import { useEffect, useMemo } from "react";
import { useMapStore } from "@/stores/map-store";
import { useRouteCreationStore } from "@/stores/route-creation-store";
import { useUiStore } from "@/stores/ui-store";
import { RouteAlternativesLayer } from "@/components/map/RouteAlternativesLayer";
import { WaypointMarkers } from "@/components/map/WaypointMarkers";
import { RouteMapClickHandler } from "@/components/map/RouteMapClickHandler";
import { DirectionsBar } from "./DirectionsBar";
import { RouteSummaryCard } from "./RouteSummaryCard";

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
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);

  // Tell the rest of the app a sidebar is occupied while directions is on.
  // PlacePanel does the same when it's mounted; the two never coexist
  // because PlaceDirectionsButton navigates away before opening directions.
  useEffect(() => {
    if (!isOpen) return;
    setSidebarOpen(true);
    return () => setSidebarOpen(false);
  }, [isOpen, setSidebarOpen]);

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

      {/* Mobile: bottom sheet (collapsible). Lets the user see the map
          while still picking start / end. */}
      <div className="pointer-events-auto absolute bottom-0 left-12 right-0 z-10 flex max-h-[70vh] flex-col overflow-y-auto rounded-t-2xl border-t border-border bg-background shadow-2xl md:hidden">
        <div className="mx-auto my-2 h-1 w-10 rounded-full bg-border" />
        <DirectionsBar />
        <RouteSummaryCard />
      </div>
    </>
  );
}
