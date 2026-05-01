import { useMemo } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { fetchBitcoinPois, type BitcoinPoi } from "./overpass";
import type { ViewportBounds } from "@/types/mapky";

const TILE = 1.0; // ≈ 100 km bins, keeps Overpass calls minimal

/**
 * Shared viewport Bitcoin POIs hook. The map layer and the Places
 * sidebar both call this — same query key, same cache, so opening
 * the sidebar doesn't trigger a second Overpass round-trip.
 *
 * The toggle in the Layers sheet controls whether the orange ring is
 * RENDERED on the map; the data is fetched either way so the sidebar
 * preview can show a Bitcoin chip on every applicable place row.
 */
export function useViewportBitcoinPois(
  bounds: ViewportBounds | null,
  /**
   * Whether the current zoom is high enough to query Overpass safely
   * (continent-scale queries time out). Pass a pre-computed boolean
   * (e.g. `zoom >= 9`) instead of the raw zoom number — that way the
   * caller's `useMapStore((s) => s.zoom >= 9)` selector only fires
   * re-renders on the threshold crossing, not every zoom step.
   */
  zoomEnough: boolean,
): { pois: BitcoinPoi[] | undefined; keys: ReadonlySet<string> } {
  const snapped = useMemo<ViewportBounds | null>(() => {
    if (!bounds || !zoomEnough) return null;
    return {
      minLat: floorTo(bounds.minLat, TILE),
      minLon: floorTo(bounds.minLon, TILE),
      maxLat: ceilTo(bounds.maxLat, TILE),
      maxLon: ceilTo(bounds.maxLon, TILE),
    };
  }, [bounds, zoomEnough]);

  const { data: pois } = useQuery({
    queryKey: [
      "btcmap",
      "overpass",
      snapped?.minLat,
      snapped?.minLon,
      snapped?.maxLat,
      snapped?.maxLon,
    ],
    queryFn: ({ signal }) => fetchBitcoinPois(snapped!, signal),
    enabled: snapped !== null,
    placeholderData: keepPreviousData,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });

  const keys = useMemo(() => {
    if (!pois?.length) return EMPTY_SET;
    const s = new Set<string>();
    for (const b of pois) s.add(`${b.osmType}:${b.osmId}`);
    return s;
  }, [pois]);

  return { pois, keys };
}

const EMPTY_SET: ReadonlySet<string> = new Set();

function floorTo(v: number, step: number): number {
  return Math.floor(v / step) * step;
}
function ceilTo(v: number, step: number): number {
  return Math.ceil(v / step) * step;
}
