import { useEffect, useRef, useCallback, useState } from "react";
import type maplibregl from "maplibre-gl";
import { useMapStore } from "@/stores/map-store";
import { useViewportPlaces } from "@/lib/api/hooks";
import type { PlaceDetails } from "@/types/mapky";
import type { ViewportBounds } from "@/types/mapky";

const SOURCE_ID = "mapky-places";
const LAYER_ID = "mapky-places-circles";

function placesToGeoJSON(
  places: PlaceDetails[],
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: places.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      properties: {
        osm_canonical: p.osm_canonical,
        osm_type: p.osm_type,
        osm_id: p.osm_id,
        review_count: p.review_count,
        avg_rating: p.avg_rating,
        tag_count: p.tag_count,
        photo_count: p.photo_count,
      },
    })),
  };
}

export function MapkyPlacesLayer() {
  const map = useMapStore((s) => s.map);
  const [bounds, setBounds] = useState<ViewportBounds | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const updateBounds = useCallback(() => {
    if (!map) return;
    const b = map.getBounds();
    setBounds({
      minLat: b.getSouth(),
      minLon: b.getWest(),
      maxLat: b.getNorth(),
      maxLon: b.getEast(),
    });
  }, [map]);

  // Debounced viewport tracking
  useEffect(() => {
    if (!map) return;

    const onMoveEnd = () => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(updateBounds, 500);
    };

    // Initial load
    if (map.loaded()) {
      updateBounds();
    } else {
      map.once("load", updateBounds);
    }

    map.on("moveend", onMoveEnd);
    return () => {
      map.off("moveend", onMoveEnd);
      clearTimeout(debounceRef.current);
    };
  }, [map, updateBounds]);

  const { data: places } = useViewportPlaces(bounds);

  // Update map source when places change
  useEffect(() => {
    if (!map || !places) return;

    const geojson = placesToGeoJSON(places);

    const addSourceAndLayer = () => {
      if (map.getSource(SOURCE_ID)) {
        (
          map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource
        ).setData(geojson);
        return;
      }

      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: geojson,
      });

      map.addLayer({
        id: LAYER_ID,
        type: "circle",
        source: SOURCE_ID,
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["get", "review_count"],
            0, 6,
            5, 10,
            20, 16,
          ],
          "circle-color": [
            "interpolate",
            ["linear"],
            ["get", "avg_rating"],
            0, "#94a3b8",
            3, "#f59e0b",
            6, "#22c55e",
            9, "#2563eb",
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.9,
        },
      });

      map.on("click", LAYER_ID, (e) => {
        const feature = e.features?.[0];
        if (feature) {
          console.log("Mapky place clicked:", feature.properties);
        }
      });

      map.on("mouseenter", LAYER_ID, () => {
        map.getCanvas().style.cursor = "pointer";
      });

      map.on("mouseleave", LAYER_ID, () => {
        map.getCanvas().style.cursor = "";
      });
    };

    if (map.isStyleLoaded()) {
      addSourceAndLayer();
    } else {
      map.once("style.load", addSourceAndLayer);
    }
  }, [map, places]);

  return null;
}
