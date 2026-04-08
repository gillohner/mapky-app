import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { useMapStore } from "@/stores/map-store";
import { useUiStore } from "@/stores/ui-store";

const SEL_SOURCE = "mapky-selected-place";
const SEL_LAYER_GLOW = "mapky-selected-glow";
const SEL_LAYER_RING = "mapky-selected-ring";

function ensureLayers(map: maplibregl.Map) {
  if (!map.getSource(SEL_SOURCE)) {
    map.addSource(SEL_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }

  // Outer glow — rendered above POI icons
  if (!map.getLayer(SEL_LAYER_GLOW)) {
    map.addLayer({
      id: SEL_LAYER_GLOW,
      type: "circle",
      source: SEL_SOURCE,
      paint: {
        "circle-radius": 22,
        "circle-color": "#22c55e",
        "circle-opacity": 0.18,
        "circle-blur": 0.6,
      },
    });
  }

  // Crisp ring around the place
  if (!map.getLayer(SEL_LAYER_RING)) {
    map.addLayer({
      id: SEL_LAYER_RING,
      type: "circle",
      source: SEL_SOURCE,
      paint: {
        "circle-radius": 16,
        "circle-color": "transparent",
        "circle-stroke-width": 2.5,
        "circle-stroke-color": "#22c55e",
        "circle-stroke-opacity": 0.7,
      },
    });
  }
}

/**
 * Highlights the selected place with a GeoJSON glow + ring rendered
 * above tile POI icons. Uses place coords (from Nexus API) so it
 * covers the actual node, not the click point.
 */
export function SelectedPlaceMarker() {
  const map = useMapStore((s) => s.map);
  const selected = useUiStore((s) => s.selectedFeature);
  const layerReady = useRef(false);

  // Recreate layers after style changes (theme toggle)
  useEffect(() => {
    if (!map) return;
    const onStyleData = () => {
      layerReady.current = false;
    };
    map.on("styledata", onStyleData);
    return () => {
      map.off("styledata", onStyleData);
    };
  }, [map]);

  useEffect(() => {
    if (!map) return;

    const apply = () => {
      if (!layerReady.current) {
        ensureLayers(map);
        layerReady.current = true;
      }

      const src = map.getSource(SEL_SOURCE) as
        | maplibregl.GeoJSONSource
        | undefined;
      if (!src) return;

      if (selected) {
        src.setData({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [selected.lng, selected.lat],
              },
              properties: {},
            },
          ],
        });
      } else {
        src.setData({ type: "FeatureCollection", features: [] });
      }
    };

    if (map.isStyleLoaded()) {
      apply();
    } else {
      map.once("idle", apply);
    }
  }, [map, selected]);

  return null;
}
