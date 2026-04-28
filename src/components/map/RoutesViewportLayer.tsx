import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import type maplibregl from "maplibre-gl";
import { useMapStore } from "@/stores/map-store";
import { useViewportRoutes } from "@/lib/api/hooks";
import type { RouteDetails } from "@/types/mapky";
import { useLayerOpacityMultiplier } from "@/lib/map/dim";

const SOURCE_ID = "mapky-routes-viewport";
const LAYER_ID = "mapky-routes-viewport-layer";

interface RoutesViewportLayerProps {
  /** Hide the layer when false (e.g. while creating a new route). */
  enabled?: boolean;
}

/**
 * Renders all routes in the current map viewport as start-point pins. The
 * indexer only returns metadata + bbox + start lat/lon, so we can't draw
 * the polyline here without per-route homeserver fetches; the pin nudges
 * users to tap into the detail view, which loads the full body.
 */
export function RoutesViewportLayer({ enabled = true }: RoutesViewportLayerProps) {
  const map = useMapStore((s) => s.map);
  const navigate = useNavigate();
  const bbox = enabled && map ? boundsOf(map) : null;
  const { data: routes } = useViewportRoutes(bbox);

  useEffect(() => {
    if (!map || !enabled) return;

    const ensure = () => {
      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      if (!map.getLayer(LAYER_ID)) {
        map.addLayer({
          id: LAYER_ID,
          type: "circle",
          source: SOURCE_ID,
          paint: {
            "circle-color": "#8B5CF6",
            "circle-radius": 7,
            "circle-stroke-color": "#fff",
            "circle-stroke-width": 2,
          },
        });
      }
    };

    if (!map.isStyleLoaded()) {
      map.once("style.load", ensure);
    } else {
      ensure();
    }

    const onClick = (e: maplibregl.MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      const authorId = f.properties?.author_id as string | undefined;
      const compoundId = f.properties?.id as string | undefined;
      if (!authorId || !compoundId) return;
      const routeId = compoundId.split(":").pop()!;
      navigate({
        to: "/route/$authorId/$routeId",
        params: { authorId, routeId },
      });
    };
    map.on("click", LAYER_ID, onClick);

    const onEnter = () => (map.getCanvas().style.cursor = "pointer");
    const onLeave = () => (map.getCanvas().style.cursor = "");
    map.on("mouseenter", LAYER_ID, onEnter);
    map.on("mouseleave", LAYER_ID, onLeave);

    return () => {
      map.off("click", LAYER_ID, onClick);
      map.off("mouseenter", LAYER_ID, onEnter);
      map.off("mouseleave", LAYER_ID, onLeave);
      if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    };
  }, [map, enabled, navigate]);

  // Sync features with the current viewport's routes.
  useEffect(() => {
    if (!map) return;
    const src = map.getSource(SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!src) return;
    src.setData({
      type: "FeatureCollection",
      features: (routes ?? []).map(routeFeature),
    });
  }, [map, routes]);

  const dim = useLayerOpacityMultiplier("routes");
  useEffect(() => {
    if (!map) return;
    const apply = () => {
      if (map.getLayer(LAYER_ID)) {
        map.setPaintProperty(LAYER_ID, "circle-opacity", dim);
        map.setPaintProperty(LAYER_ID, "circle-stroke-opacity", dim);
      }
    };
    apply();
    map.on("styledata", apply);
    return () => {
      map.off("styledata", apply);
    };
  }, [map, dim]);

  return null;
}

function routeFeature(r: RouteDetails): GeoJSON.Feature {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [r.start_lon, r.start_lat] },
    properties: { id: r.id, author_id: r.author_id, name: r.name },
  };
}

function boundsOf(map: maplibregl.Map): {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
} {
  const b = map.getBounds();
  return {
    minLat: b.getSouth(),
    minLon: b.getWest(),
    maxLat: b.getNorth(),
    maxLon: b.getEast(),
  };
}
