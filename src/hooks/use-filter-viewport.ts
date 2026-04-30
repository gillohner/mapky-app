import { useEffect, useRef } from "react";
import { useMapStore } from "@/stores/map-store";

export interface FilterBounds {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

/**
 * Tie the map viewport to the discover sidebar's filter state.
 *
 * - When a filter becomes active, snapshot the current center/zoom and
 *   fly to the bounding box of the filtered items.
 * - While active, re-fit on every change to the bounds (e.g. user
 *   adds/removes a tag or types a query that narrows further).
 * - When all filters clear, restore the snapshot smoothly.
 *
 * The hook is no-op on first mount: it only kicks in on activation.
 * Lists pass `null` for `bounds` when there's nothing to fit (e.g. an
 * empty filtered set), in which case the previous viewport stays put.
 */
export function useFilterViewport({
  active,
  bounds,
}: {
  active: boolean;
  bounds: FilterBounds | null;
}) {
  const map = useMapStore((s) => s.map);
  const savedRef = useRef<{ center: [number, number]; zoom: number } | null>(
    null,
  );
  const wasActiveRef = useRef(false);
  const lastBoundsKeyRef = useRef<string | null>(null);

  // Content-based key: identity of the `bounds` object changes every
  // render (it's recomputed from the filtered list each time), and
  // fitBounds itself moves the map → new viewport query → new
  // filtered list → new bounds object → infinite loop. Compare by
  // value so we only fit when the box actually moved.
  const boundsKey = bounds ? boundsToKey(bounds) : null;

  useEffect(() => {
    if (!map) return;

    if (active && bounds) {
      // First activation in this session: snapshot the current view.
      if (!wasActiveRef.current) {
        const c = map.getCenter();
        savedRef.current = { center: [c.lng, c.lat], zoom: map.getZoom() };
        wasActiveRef.current = true;
      }
      // Skip duplicate fits to the same box — that's what was driving
      // the update-depth-exceeded cascade.
      if (boundsKey === lastBoundsKeyRef.current) return;
      lastBoundsKeyRef.current = boundsKey;
      const isDesktop =
        typeof window !== "undefined" && window.innerWidth >= 640;
      map.fitBounds(
        [
          [bounds.minLon, bounds.minLat],
          [bounds.maxLon, bounds.maxLat],
        ],
        {
          padding: {
            top: 80,
            bottom: isDesktop ? 80 : 280,
            left: isDesktop ? 410 : 80,
            right: 80,
          },
          duration: 600,
          maxZoom: 17,
        },
      );
    } else if (!active && wasActiveRef.current) {
      if (savedRef.current) {
        map.flyTo({
          center: savedRef.current.center,
          zoom: savedRef.current.zoom,
          duration: 600,
        });
      }
      savedRef.current = null;
      wasActiveRef.current = false;
      lastBoundsKeyRef.current = null;
    }
  }, [map, active, bounds, boundsKey]);
}

/** Round to 4 decimals (~11m) so tiny float jitter doesn't refire a
 * fit on every viewport-query refresh. */
function boundsToKey(b: FilterBounds): string {
  const r = (n: number) => n.toFixed(4);
  return `${r(b.minLat)},${r(b.minLon)},${r(b.maxLat)},${r(b.maxLon)}`;
}

/** Build a bounding box from a list of points. Returns null when empty. */
export function pointsToBounds(
  points: { lat: number; lon: number }[],
): FilterBounds | null {
  if (points.length === 0) return null;
  let minLat = Infinity;
  let minLon = Infinity;
  let maxLat = -Infinity;
  let maxLon = -Infinity;
  for (const p of points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }
  if (!Number.isFinite(minLat)) return null;
  // Pad a bit so single-point fits don't zoom all the way to building level.
  const dLat = Math.max((maxLat - minLat) * 0.15, 0.0005);
  const dLon = Math.max((maxLon - minLon) * 0.15, 0.0005);
  return {
    minLat: minLat - dLat,
    minLon: minLon - dLon,
    maxLat: maxLat + dLat,
    maxLon: maxLon + dLon,
  };
}
