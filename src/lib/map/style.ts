import type { StyleSpecification } from "maplibre-gl";
import { layers, LIGHT, DARK } from "@protomaps/basemaps";
import { config } from "@/lib/config";

function getProtomapsUrl(): string {
  const base = config.protomaps.url;
  if (config.protomaps.key) {
    return `${base}?key=${config.protomaps.key}`;
  }
  return base;
}

export function createMapStyle(theme: "light" | "dark"): StyleSpecification {
  const flavor = theme === "dark" ? DARK : LIGHT;
  const url = getProtomapsUrl();

  return {
    version: 8,
    glyphs:
      "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
    sprite:
      "https://protomaps.github.io/basemaps-assets/sprites/v4/light",
    sources: {
      protomaps: {
        type: "vector",
        url: `pmtiles://${url}`,
        attribution:
          '<a href="https://protomaps.com">Protomaps</a> | <a href="https://openstreetmap.org">OpenStreetMap</a>',
      },
    },
    layers: layers("protomaps", flavor),
  };
}
