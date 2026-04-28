import { useEffect } from "react";
import { useMapStore } from "@/stores/map-store";
import { useUiStore } from "@/stores/ui-store";

const SOURCE_ID = "aws-terrain";
const LAYER_ID = "aws-terrain-hillshade";

/**
 * AWS Open Data Terrarium DEM tiles. Free, no auth, RGB-encoded
 * elevation. MapLibre's hillshade layer turns it into shaded relief.
 * Encoding format is "terrarium" — RGB packs elevation as
 *   height = (R * 256 + G + B / 256) - 32768
 */
const TILES = [
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
];

const ATTRIBUTION =
  'Terrain &copy; <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">AWS Open Data — Terrain Tiles</a>';

export function TerrainOverlayLayer() {
  const map = useMapStore((s) => s.map);
  const visible = useUiStore((s) => s.terrainOverlayVisible);

  useEffect(() => {
    if (!map) return;

    const ensure = () => {
      if (!visible) return;
      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
          type: "raster-dem",
          tiles: TILES,
          tileSize: 256,
          minzoom: 0,
          maxzoom: 15,
          encoding: "terrarium",
          attribution: ATTRIBUTION,
        });
      }
      if (!map.getLayer(LAYER_ID)) {
        map.addLayer({
          id: LAYER_ID,
          type: "hillshade",
          source: SOURCE_ID,
          paint: {
            // Terrarium DEM is only available up to z=15. Past that
            // MapLibre overzooms and the pixelation gets ugly, so we
            // fade exaggeration to 0 by z=16 — strong relief at
            // regional scales, invisible at street scales.
            "hillshade-exaggeration": [
              "interpolate",
              ["linear"],
              ["zoom"],
              6,
              0.7,
              12,
              0.55,
              14,
              0.4,
              15,
              0.25,
              16,
              0,
            ],
            "hillshade-shadow-color": "#222",
            "hillshade-highlight-color": "#fff",
            "hillshade-accent-color": "#5a5a5a",
          },
        });
      }
    };

    const remove = () => {
      if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    };

    if (visible) {
      if (map.isStyleLoaded()) ensure();
      else map.once("idle", ensure);
    } else {
      remove();
    }

    const onStyleData = () => {
      if (!visible) return;
      if (!map.getSource(SOURCE_ID)) ensure();
    };
    map.on("styledata", onStyleData);
    return () => {
      map.off("styledata", onStyleData);
    };
  }, [map, visible]);

  return null;
}
