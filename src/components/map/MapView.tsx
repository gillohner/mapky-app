import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { createMapStyle } from "@/lib/map/style";
import { useMapStore } from "@/stores/map-store";

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const initializedRef = useRef(false);
  const { center, zoom, theme, setMap, setView } = useMapStore();

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: createMapStyle(theme),
      center: center,
      zoom: zoom,
    });

    map.addControl(new maplibregl.NavigationControl(), "bottom-right");

    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      "bottom-right",
    );

    map.on("load", () => {
      initializedRef.current = true;
    });

    map.on("moveend", () => {
      const c = map.getCenter();
      setView([c.lng, c.lat], map.getZoom());
    });

    map.on("click", (e) => {
      const features = map.queryRenderedFeatures(e.point);
      const poi = features.find(
        (f) =>
          f.sourceLayer === "pois" ||
          f.sourceLayer === "places" ||
          f.layer.id.includes("poi") ||
          f.layer.id.includes("places"),
      );
      if (poi) {
        console.log("POI clicked:", poi.properties);
      }
    });

    map.on("mousemove", (e) => {
      const features = map.queryRenderedFeatures(e.point);
      const hasPoi = features.some(
        (f) =>
          f.sourceLayer === "pois" ||
          f.sourceLayer === "places" ||
          f.layer.id.includes("poi") ||
          f.layer.id.includes("places"),
      );
      map.getCanvas().style.cursor = hasPoi ? "pointer" : "";
    });

    mapRef.current = map;
    setMap(map);

    return () => {
      setMap(null);
      mapRef.current = null;
      initializedRef.current = false;
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only update style AFTER the initial load completes
  useEffect(() => {
    if (!mapRef.current || !initializedRef.current) return;
    mapRef.current.setStyle(createMapStyle(theme));
  }, [theme]);

  return (
    <div
      ref={containerRef}
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
    />
  );
}
