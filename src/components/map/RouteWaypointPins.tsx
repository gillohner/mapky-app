import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { useQueries } from "@tanstack/react-query";
import { useMapStore } from "@/stores/map-store";
import { reverseGeocode } from "@/lib/api/nominatim";
import { fetchPlaceDetail } from "@/lib/api/mapky";

interface Props {
  waypoints: { lat: number; lon: number }[];
}

/**
 * Read-only A/B/N pins for a saved route's waypoints, mirroring the
 * styling of WaypointMarkers (used by the directions sidebar).
 *
 * Each pin reverse-geocodes its lat/lon and, if the OSM element
 * resolves to an indexed Mapky place with reviews, replaces the
 * index/letter with the star-rating number. Both query layers are
 * batched via TanStack `useQueries`, so the ratings come in
 * progressively without blocking the initial pin render.
 */
export function RouteWaypointPins({ waypoints }: Props) {
  const map = useMapStore((s) => s.map);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  // Phase 1 — reverse-geocode each waypoint to find an OSM element.
  const reverseQueries = useQueries({
    queries: waypoints.map((w) => ({
      queryKey: ["nominatim", "reverse", w.lat, w.lon] as const,
      queryFn: () => reverseGeocode(w.lat, w.lon),
      enabled: Number.isFinite(w.lat) && Number.isFinite(w.lon),
      staleTime: 60 * 60_000,
      gcTime: Infinity,
      retry: false,
    })),
  });

  // Phase 2 — fetch the place detail for any resolved OSM ref.
  // Cache key matches usePlaceDetail so the side panel reuses it.
  const placeQueries = useQueries({
    queries: waypoints.map((_, i) => {
      const osm = reverseQueries[i].data;
      const osmType = osm?.osm_type ?? "";
      const osmId = osm?.osm_id ?? 0;
      const enabled = !!osmType && !!osmId;
      return {
        queryKey: ["mapky", "place", osmType, osmId] as const,
        queryFn: () => fetchPlaceDetail(osmType, osmId),
        enabled,
        retry: false,
      };
    }),
  });

  useEffect(() => {
    if (!map) return;
    // Tear down previous markers and rebuild — markers are cheap and
    // rebuild is the simplest path now that pin labels can change as
    // place ratings stream in.
    for (const m of markersRef.current) m.remove();
    markersRef.current = [];

    const total = waypoints.length;
    waypoints.forEach((w, i) => {
      // Mapky stores ratings on a 0–10 scale; show out of 5 stars.
      const place = placeQueries[i].data;
      const rating =
        place && place.review_count > 0 ? place.avg_rating / 2 : null;

      const el = document.createElement("div");
      el.style.cssText =
        "width: 28px; height: 36px; transform-origin: bottom center;";
      el.innerHTML = pinSvg(i, total, rating);
      const marker = new maplibregl.Marker({
        element: el,
        anchor: "bottom",
      })
        .setLngLat([w.lon, w.lat])
        .addTo(map);
      markersRef.current.push(marker);
    });

    return () => {
      for (const m of markersRef.current) m.remove();
      markersRef.current = [];
    };
    // Rebuild on waypoint or rating-data changes. Joining the
    // dataUpdatedAt timestamps keeps the dep stable until any of the
    // queries actually delivers fresh data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    map,
    waypoints,
    placeQueries.map((q) => q.dataUpdatedAt).join(","),
  ]);

  return null;
}

function pinSvg(idx: number, total: number, rating: number | null): string {
  const color = pinColor(idx, total);
  // When a rating is available, take over the inner text — that's
  // information the user cares about more than the letter. Color
  // still encodes start/end/intermediate.
  const innerText =
    rating != null ? rating.toFixed(1) : pinLabel(idx, total);
  // Smaller font when showing 3 chars ("3.2") so the digits fit.
  const fontSize = rating != null ? 10 : 12;
  return `
    <svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 0C6.27 0 0 6.27 0 14c0 9.5 14 22 14 22s14-12.5 14-22C28 6.27 21.73 0 14 0z" fill="${color}" stroke="#fff" stroke-width="2"/>
      <text x="14" y="18" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${fontSize}" font-weight="700" fill="#fff">${innerText}</text>
    </svg>
  `;
}

function pinColor(idx: number, total: number): string {
  if (idx === 0) return "#10B981"; // start = green
  if (idx === total - 1) return "#EF4444"; // end = red
  return "#3B82F6"; // via = blue
}

function pinLabel(idx: number, total: number): string {
  if (idx === 0) return "A";
  if (idx === total - 1) return "B";
  return String(idx);
}
