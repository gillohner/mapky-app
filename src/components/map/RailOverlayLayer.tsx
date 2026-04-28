import { useEffect, useRef } from "react";
import { useMapStore } from "@/stores/map-store";
import { useUiStore } from "@/stores/ui-store";

const SOURCE_ID = "openrailwaymap";
const LAYER_ID = "openrailwaymap-standard";

const TILES = [
  "https://a.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png",
  "https://b.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png",
  "https://c.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png",
];

const ATTRIBUTION =
  '<a href="https://www.openrailwaymap.org/" target="_blank" rel="noopener">OpenRailwayMap</a>';

/**
 * OpenRailwayMap raster overlay — rail lines, stations, signals,
 * electrification. Sits on top of the base style; toggleable from the
 * Layers sheet. Re-attaches itself when the basemap style is swapped
 * (theme switch wipes all custom sources).
 */
export function RailOverlayLayer() {
  const map = useMapStore((s) => s.map);
  const visible = useUiStore((s) => s.metroOverlayVisible);
  const attached = useRef(false);

  useEffect(() => {
    if (!map) return;

    const ensure = () => {
      if (!visible) return;
      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
          type: "raster",
          tiles: TILES,
          tileSize: 256,
          minzoom: 2,
          maxzoom: 19,
          attribution: ATTRIBUTION,
        });
      }
      if (!map.getLayer(LAYER_ID)) {
        map.addLayer({
          id: LAYER_ID,
          type: "raster",
          source: SOURCE_ID,
          paint: { "raster-opacity": 0.85 },
        });
      }
      attached.current = true;
    };

    const remove = () => {
      if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      attached.current = false;
    };

    if (visible) {
      if (map.isStyleLoaded()) ensure();
      else map.once("idle", ensure);
    } else {
      remove();
    }

    // Theme swap calls map.setStyle which removes all custom sources.
    // Re-attach on the next styledata pass while still toggled on.
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
