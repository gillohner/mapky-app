import { useEffect } from "react";
import { useMapStore } from "@/stores/map-store";
import { useUiStore } from "@/stores/ui-store";

const SOURCE_ID = "cyclosm";
const LAYER_ID = "cyclosm-layer";

const TILES = [
  "https://a.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
  "https://b.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
  "https://c.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
];

const ATTRIBUTION =
  '<a href="https://www.cyclosm.org" target="_blank" rel="noopener">CyclOSM</a> | hosted by <a href="https://openstreetmap.fr" target="_blank" rel="noopener">OSM-FR</a>';

/**
 * CyclOSM raster overlay — cycling infrastructure highlighted on top
 * of the basemap. Re-attaches after style swaps.
 */
export function CyclingOverlayLayer() {
  const map = useMapStore((s) => s.map);
  const visible = useUiStore((s) => s.cyclingOverlayVisible);

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
          // CyclOSM serves tiles up to z=20. With a lower maxzoom MapLibre
          // overzooms (scales) the highest available tile and the result
          // looks blurry past z=18.
          maxzoom: 20,
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
