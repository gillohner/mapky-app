import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { useMapStore } from "@/stores/map-store";
import {
  useCaptureCreationStore,
  useActiveDraftItem,
} from "@/stores/capture-creation-store";

const OTHER_PIN_SOURCE = "capture-draft-other-pins";
const OTHER_PIN_CIRCLE = "capture-draft-other-pin-circle";
const OTHER_PIN_LABEL = "capture-draft-other-pin-label";
const ARROW_LINE_SOURCE = "capture-draft-arrow-line";
const ARROW_LINE_LAYER = "capture-draft-arrow-line-layer";

/** Metres per pixel at a given latitude and zoom (Mercator). */
function metersPerPixel(lat: number, zoom: number): number {
  return (
    (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom)
  );
}

function offsetLatLon(
  lat: number,
  lon: number,
  bearingDeg: number,
  distanceMeters: number,
): [number, number] {
  const R = 6378137;
  const brng = (bearingDeg * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;
  const ang = distanceMeters / R;

  const lat2 = Math.asin(
    Math.sin(latRad) * Math.cos(ang) +
      Math.cos(latRad) * Math.sin(ang) * Math.cos(brng),
  );
  const lon2 =
    lonRad +
    Math.atan2(
      Math.sin(brng) * Math.sin(ang) * Math.cos(latRad),
      Math.cos(ang) - Math.sin(latRad) * Math.sin(lat2),
    );

  return [(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI];
}

/** Great-circle bearing from A → B in degrees (0..360). */
function bearing(
  latA: number,
  lonA: number,
  latB: number,
  lonB: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(latA);
  const φ2 = toRad(latB);
  const Δλ = toRad(lonB - lonA);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return ((θ * 180) / Math.PI + 360) % 360;
}

function makePinElement(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "capture-draft-pin-el";
  el.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" fill="rgb(14 165 233)" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" fill="white"/></svg>';
  return el;
}

function makeArrowTipElement(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "capture-draft-arrow-tip-el";
  el.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" fill="rgb(14 165 233)" stroke="white" stroke-width="2"><path d="M12 2 L22 22 L12 16 L2 22 Z" /></svg>';
  return el;
}

function ensureNonActiveLayers(map: maplibregl.Map) {
  if (!map.getSource(OTHER_PIN_SOURCE)) {
    map.addSource(OTHER_PIN_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }
  if (!map.getLayer(OTHER_PIN_CIRCLE)) {
    map.addLayer({
      id: OTHER_PIN_CIRCLE,
      type: "circle",
      source: OTHER_PIN_SOURCE,
      paint: {
        "circle-radius": 8,
        "circle-color": "rgb(14 165 233)",
        "circle-opacity": 0.7,
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      },
    });
  }
  if (!map.getLayer(OTHER_PIN_LABEL)) {
    map.addLayer({
      id: OTHER_PIN_LABEL,
      type: "symbol",
      source: OTHER_PIN_SOURCE,
      layout: {
        "text-field": ["to-string", ["get", "index"]],
        "text-size": 10,
        "text-font": ["Noto Sans Medium"],
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: { "text-color": "#ffffff" },
    });
  }

  if (!map.getSource(ARROW_LINE_SOURCE)) {
    map.addSource(ARROW_LINE_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }
  if (!map.getLayer(ARROW_LINE_LAYER)) {
    map.addLayer({
      id: ARROW_LINE_LAYER,
      type: "line",
      source: ARROW_LINE_SOURCE,
      paint: {
        "line-color": "rgb(14 165 233)",
        "line-width": 4,
        "line-opacity": 0.85,
      },
    });
  }
}

function clearNonActiveLayers(map: maplibregl.Map) {
  for (const id of [ARROW_LINE_LAYER, OTHER_PIN_LABEL, OTHER_PIN_CIRCLE]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  for (const id of [ARROW_LINE_SOURCE, OTHER_PIN_SOURCE]) {
    if (map.getSource(id)) map.removeSource(id);
  }
}

/**
 * Draws per-item draft pins on the main map while the creation flow is in
 * the `place` step. The ACTIVE item is rendered as two draggable markers:
 *
 *   - Pin marker: drag to move the capture's lat/lon
 *   - Arrow tip marker: drag to rotate the capture's heading
 *
 * The line between them updates in real time. Map clicks outside the
 * markers snap the pin. Every other item in a sequence is drawn as a
 * numbered circle for spatial context.
 */
export function MainMapCaptureOverlay() {
  const map = useMapStore((s) => s.map);
  const isOpen = useCaptureCreationStore((s) => s.isOpen);
  const step = useCaptureCreationStore((s) => s.step);
  const items = useCaptureCreationStore((s) => s.items);
  const activeIndex = useCaptureCreationStore((s) => s.activeIndex);
  const setActiveCoords = useCaptureCreationStore((s) => s.setActiveCoords);
  const setActiveHeading = useCaptureCreationStore((s) => s.setActiveHeading);
  const active = useActiveDraftItem();

  const pinMarkerRef = useRef<maplibregl.Marker | null>(null);
  const tipMarkerRef = useRef<maplibregl.Marker | null>(null);
  const layersReady = useRef(false);

  const showOverlay = isOpen && step === "place";

  // Setup/teardown of non-active layers + markers when entering/leaving the step
  useEffect(() => {
    if (!map || !showOverlay) {
      if (map && layersReady.current) {
        clearNonActiveLayers(map);
        layersReady.current = false;
      }
      if (pinMarkerRef.current) {
        pinMarkerRef.current.remove();
        pinMarkerRef.current = null;
      }
      if (tipMarkerRef.current) {
        tipMarkerRef.current.remove();
        tipMarkerRef.current = null;
      }
      return;
    }

    const setup = () => {
      if (!layersReady.current) {
        ensureNonActiveLayers(map);
        layersReady.current = true;
      }
    };
    if (map.isStyleLoaded()) setup();
    else map.once("idle", setup);

    return () => {
      if (map && layersReady.current) {
        clearNonActiveLayers(map);
        layersReady.current = false;
      }
    };
  }, [map, showOverlay]);

  // Seed active pin to map center if none set
  useEffect(() => {
    if (!map || !showOverlay || !active) return;
    if (active.lat != null && active.lon != null) return;
    const c = map.getCenter();
    setActiveCoords(c.lat, c.lng);
  }, [map, showOverlay, active, setActiveCoords]);

  // Pan to active pin when item changes
  useEffect(() => {
    if (!map || !showOverlay || !active) return;
    if (active.lat == null || active.lon == null) return;
    map.easeTo({ center: [active.lon, active.lat], duration: 400 });
  }, [map, showOverlay, activeIndex, active]);

  // Create/update the pin marker for the active item
  useEffect(() => {
    if (!map || !showOverlay || !active) return;
    if (active.lat == null || active.lon == null) return;

    if (!pinMarkerRef.current) {
      pinMarkerRef.current = new maplibregl.Marker({
        element: makePinElement(),
        draggable: true,
        anchor: "center",
      })
        .setLngLat([active.lon, active.lat])
        .addTo(map);

      pinMarkerRef.current.on("drag", () => {
        const ll = pinMarkerRef.current!.getLngLat();
        setActiveCoords(ll.lat, ll.lng);
      });
    } else {
      pinMarkerRef.current.setLngLat([active.lon, active.lat]);
    }
  }, [map, showOverlay, active, setActiveCoords]);

  // Create/update the arrow tip marker (represents current heading)
  useEffect(() => {
    if (!map || !showOverlay || !active) return;
    if (active.lat == null || active.lon == null) return;

    // Default heading = 0 (north) when unset, so the tip is always draggable.
    const headingDeg = active.heading ?? 0;
    const mpp = metersPerPixel(active.lat, map.getZoom());
    const dist = mpp * 80;
    const [tipLon, tipLat] = offsetLatLon(
      active.lat,
      active.lon,
      headingDeg,
      dist,
    );

    if (!tipMarkerRef.current) {
      const el = makeArrowTipElement();
      tipMarkerRef.current = new maplibregl.Marker({
        element: el,
        draggable: true,
        anchor: "center",
        rotationAlignment: "map",
      })
        .setLngLat([tipLon, tipLat])
        .setRotation(headingDeg)
        .addTo(map);

      tipMarkerRef.current.on("drag", () => {
        const cur = useCaptureCreationStore.getState();
        const curActive = cur.items[cur.activeIndex];
        if (!curActive || curActive.lat == null || curActive.lon == null) return;
        const ll = tipMarkerRef.current!.getLngLat();
        const b = bearing(curActive.lat, curActive.lon, ll.lat, ll.lng);
        setActiveHeading(Math.round(b));
        tipMarkerRef.current!.setRotation(Math.round(b));
      });
    } else {
      tipMarkerRef.current.setLngLat([tipLon, tipLat]);
      tipMarkerRef.current.setRotation(headingDeg);
    }
  }, [map, showOverlay, active, setActiveHeading]);

  // Update arrow line + non-active pins GeoJSON sources
  useEffect(() => {
    if (!map || !showOverlay || !layersReady.current) return;

    const pinSrc = map.getSource(OTHER_PIN_SOURCE) as
      | maplibregl.GeoJSONSource
      | undefined;
    const lineSrc = map.getSource(ARROW_LINE_SOURCE) as
      | maplibregl.GeoJSONSource
      | undefined;

    // Non-active pins (all items except the active one)
    const features: GeoJSON.Feature[] = [];
    for (let i = 0; i < items.length; i++) {
      if (i === activeIndex) continue;
      const it = items[i];
      if (it.lat == null || it.lon == null) continue;
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [it.lon, it.lat] },
        properties: { index: i + 1 },
      });
    }
    pinSrc?.setData({ type: "FeatureCollection", features });

    // Line from active pin → active arrow tip
    if (active && active.lat != null && active.lon != null) {
      const headingDeg = active.heading ?? 0;
      const mpp = metersPerPixel(active.lat, map.getZoom());
      const dist = mpp * 80;
      const [tipLon, tipLat] = offsetLatLon(
        active.lat,
        active.lon,
        headingDeg,
        dist,
      );
      lineSrc?.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: [
                [active.lon, active.lat],
                [tipLon, tipLat],
              ],
            },
            properties: {},
          },
        ],
      });
    } else {
      lineSrc?.setData({ type: "FeatureCollection", features: [] });
    }
  }, [map, showOverlay, items, activeIndex, active]);

  // Re-project arrow tip on zoom so its pixel length stays ~constant
  useEffect(() => {
    if (!map || !showOverlay) return;
    const onZoom = () => {
      if (!active || active.lat == null || active.lon == null) return;
      if (!tipMarkerRef.current) return;
      const headingDeg = active.heading ?? 0;
      const mpp = metersPerPixel(active.lat, map.getZoom());
      const dist = mpp * 80;
      const [tipLon, tipLat] = offsetLatLon(
        active.lat,
        active.lon,
        headingDeg,
        dist,
      );
      tipMarkerRef.current.setLngLat([tipLon, tipLat]);
    };
    map.on("zoom", onZoom);
    return () => {
      map.off("zoom", onZoom);
    };
  }, [map, showOverlay, active]);

  // Map click (outside markers) → snap pin to that point
  useEffect(() => {
    if (!map || !showOverlay) return;
    const onClick = (e: maplibregl.MapMouseEvent) => {
      setActiveCoords(e.lngLat.lat, e.lngLat.lng);
    };
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [map, showOverlay, setActiveCoords]);

  return null;
}
