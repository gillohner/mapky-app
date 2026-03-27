import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { addProtomapsProtocol } from "@/lib/map/protomaps";
import { createMapStyle } from "@/lib/map/style";
import { useMapStore } from "@/stores/map-store";

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const { center, zoom, theme, setMap, setView } = useMapStore();

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    addProtomapsProtocol();

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: createMapStyle(theme),
      center: center,
      zoom: zoom,
      attributionControl: {},
    });

    map.addControl(new maplibregl.NavigationControl(), "bottom-right");

    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      "bottom-right",
    );

    map.on("moveend", () => {
      const c = map.getCenter();
      setView([c.lng, c.lat], map.getZoom());
    });

    // POI click handler — log for now, will navigate to place route later
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

    // Change cursor on POI hover
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
      map.remove();
    };
    // Only run on mount — center/zoom are read once, then tracked via moveend
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update map style when theme changes
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setStyle(createMapStyle(theme));
  }, [theme]);

  return <div ref={containerRef} className="absolute inset-0" />;
}
