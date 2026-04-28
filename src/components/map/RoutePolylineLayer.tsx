import { useEffect, useRef } from "react";
import { useMapStore } from "@/stores/map-store";
import type { LngLat } from "@/lib/routing/types";

interface RoutePolylineLayerProps {
  /** Polyline as decoded [lon, lat][] points; pass empty array to clear. */
  coords: LngLat[];
  /** Optional waypoints to render as straight-line fallback when there's no snap. */
  fallbackWaypoints?: LngLat[];
  sourceId?: string;
  color?: string;
  width?: number;
  /** Render dashed when true; useful for unsnapped previews. */
  dashed?: boolean;
}

/**
 * Renders a route polyline as a MapLibre line layer. Mounts the source +
 * layer on first render and keeps them in sync with `coords` afterwards.
 * Cleans up on unmount.
 *
 * Holds the latest line in a ref so the styledata re-attach (which fires
 * when the basemap swap or first pmtile load wipes our layers) can
 * repopulate the source without waiting for another React render.
 */
export function RoutePolylineLayer({
  coords,
  fallbackWaypoints,
  sourceId = "mapky-route-line",
  color = "#3B82F6",
  width = 5,
  dashed = false,
}: RoutePolylineLayerProps) {
  const map = useMapStore((s) => s.map);
  const lineRef = useRef<GeoJSON.FeatureCollection>(emptyFC());

  useEffect(() => {
    if (!map) return;
    const layerId = `${sourceId}-layer`;
    const haloId = `${sourceId}-halo`;

    const ensure = () => {
      try {
        if (!map.getSource(sourceId)) {
          map.addSource(sourceId, {
            type: "geojson",
            data: lineRef.current,
          });
        } else {
          // Source already there — make sure its data matches the latest
          // line. Covers the case where ensure() was called by the
          // styledata listener after a setStyle wiped only the layers.
          (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(
            lineRef.current,
          );
        }
        if (!map.getLayer(haloId)) {
          map.addLayer({
            id: haloId,
            type: "line",
            source: sourceId,
            paint: {
              "line-color": "#FFFFFF",
              "line-opacity": 0.7,
              "line-width": width + 4,
              "line-blur": 1,
            },
            layout: { "line-cap": "round", "line-join": "round" },
          });
        }
        if (!map.getLayer(layerId)) {
          map.addLayer({
            id: layerId,
            type: "line",
            source: sourceId,
            paint: {
              "line-color": color,
              "line-width": width,
              ...(dashed ? { "line-dasharray": [2, 2] } : {}),
            },
            layout: { "line-cap": "round", "line-join": "round" },
          });
        }
      } catch {
        // Style isn't ready yet — styledata listener below retries.
      }
    };

    ensure();
    const onStyleData = () => {
      if (!map.getSource(sourceId) || !map.getLayer(layerId)) ensure();
    };
    map.on("styledata", onStyleData);

    return () => {
      map.off("styledata", onStyleData);
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getLayer(haloId)) map.removeLayer(haloId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    };
  }, [map, sourceId, color, width, dashed]);

  useEffect(() => {
    const path = coords.length >= 2 ? coords : fallbackWaypoints ?? [];
    lineRef.current =
      path.length < 2
        ? emptyFC()
        : {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                geometry: { type: "LineString", coordinates: path },
                properties: {},
              },
            ],
          };
    if (!map) return;
    const src = map.getSource(sourceId) as
      | maplibregl.GeoJSONSource
      | undefined;
    src?.setData(lineRef.current);
  }, [map, sourceId, coords, fallbackWaypoints]);

  return null;
}

function emptyFC(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}
