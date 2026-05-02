import { useEffect } from "react";
import type maplibregl from "maplibre-gl";
import { useMapStore } from "@/stores/map-store";
import { useUiStore } from "@/stores/ui-store";

const LAYER_ID = "mapky-3d-buildings";
const PROTOMAPS_SOURCE = "protomaps";
const BUILDINGS_SOURCE_LAYER = "buildings";

/**
 * Extrudes Protomaps' building footprints using the `height` field
 * baked into the v4 buildings layer. No new source — purely a render
 * change on data the basemap already loads. Pitch the map (right-drag
 * or two-finger drag) to actually see the volumes.
 *
 * Inserted before the first symbol layer so place/road labels keep
 * floating on top of the geometry. Theme-aware fill color so dark and
 * light basemaps both look right.
 */
export function Buildings3DLayer() {
  const map = useMapStore((s) => s.map);
  const visible = useUiStore((s) => s.buildings3DVisible);
  const theme = useMapStore((s) => s.theme);
  const basemap = useMapStore((s) => s.basemap);

  useEffect(() => {
    if (!map) return;

    const ensure = () => {
      if (!visible) return;
      if (!map.getSource(PROTOMAPS_SOURCE)) return; // no-op when on pure satellite
      if (map.getLayer(LAYER_ID)) return;

      // Drop the layer just before the first symbol so labels render
      // on top of the buildings.
      const layers = map.getStyle().layers;
      const firstSymbol = layers.find(
        (l: { type: string }) => l.type === "symbol",
      );
      const beforeId = firstSymbol?.id;

      const fillColor = theme === "dark" ? "#2a2a2a" : "#cfcfcf";

      map.addLayer(
        {
          id: LAYER_ID,
          type: "fill-extrusion",
          source: PROTOMAPS_SOURCE,
          "source-layer": BUILDINGS_SOURCE_LAYER,
          minzoom: 14,
          paint: {
            "fill-extrusion-color": fillColor,
            // Fade in as we zoom past z=14 so the transition is smooth.
            "fill-extrusion-height": [
              "interpolate",
              ["linear"],
              ["zoom"],
              14,
              0,
              15.5,
              ["coalesce", ["to-number", ["get", "height"]], 5],
            ],
            "fill-extrusion-base": [
              "coalesce",
              ["to-number", ["get", "min_height"]],
              0,
            ],
            "fill-extrusion-opacity": 0.85,
          },
        } as maplibregl.LayerSpecification,
        beforeId,
      );
    };

    const remove = () => {
      if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
    };

    if (visible) {
      if (map.isStyleLoaded()) ensure();
      else map.once("idle", ensure);
    } else {
      remove();
    }

    const onStyleData = () => {
      if (!visible) return;
      if (!map.getLayer(LAYER_ID)) ensure();
    };
    map.on("styledata", onStyleData);
    return () => {
      map.off("styledata", onStyleData);
    };
  }, [map, visible, theme, basemap]);

  return null;
}
