import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import { layers, namedFlavor } from "@protomaps/basemaps";
import { config } from "@/lib/config";

export type Basemap = "default" | "satellite";

export interface CreateMapStyleOptions {
  /** When basemap === "satellite", overlay vector labels on top of imagery. */
  satelliteLabels?: boolean;
}

export function createMapStyle(
  theme: "light" | "dark",
  basemap: Basemap = "default",
  options: CreateMapStyleOptions = {},
): StyleSpecification {
  if (basemap === "satellite") {
    return createSatelliteStyle(options.satelliteLabels ?? true);
  }
  return createDefaultStyle(theme);
}

function createDefaultStyle(theme: "light" | "dark"): StyleSpecification {
  const flavor = namedFlavor(theme);
  const key = config.protomaps.key;

  return {
    version: 8,
    glyphs:
      "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
    sprite:
      `https://protomaps.github.io/basemaps-assets/sprites/v4/${theme}`,
    sources: {
      protomaps: {
        type: "vector",
        url: `https://api.protomaps.com/tiles/v4.json?key=${key}`,
        attribution:
          '<a href="https://protomaps.com">Protomaps</a> | &copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
      },
    },
    layers: layers("protomaps", flavor, { lang: "en" }),
  };
}

/**
 * Esri World Imagery raster basemap. With `labels=true` (hybrid),
 * Protomaps vector labels are overlaid using the dark flavor — its
 * white text + dark halo reads well against most imagery.
 */
function createSatelliteStyle(labels: boolean): StyleSpecification {
  const key = config.protomaps.key;
  const sources: StyleSpecification["sources"] = {
    "esri-world-imagery": {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      minzoom: 0,
      maxzoom: 19,
      attribution:
        'Tiles &copy; <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a> &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    },
  };

  const baseLayers: LayerSpecification[] = [
    {
      id: "esri-world-imagery",
      type: "raster",
      source: "esri-world-imagery",
    },
  ];

  if (!labels) {
    return {
      version: 8,
      glyphs:
        "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
      sources,
      layers: baseLayers,
    };
  }

  // Add Protomaps source + symbol-only layers from the dark flavor for
  // labels with white text + dark halo (reads against imagery).
  sources.protomaps = {
    type: "vector",
    url: `https://api.protomaps.com/tiles/v4.json?key=${key}`,
    attribution:
      '<a href="https://protomaps.com">Protomaps</a> | &copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
  };

  const labelLayers = layers("protomaps", namedFlavor("dark"), { lang: "en" })
    .filter((l) => l.type === "symbol")
    .map(forceStrongLabelContrast);

  return {
    version: 8,
    glyphs:
      "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
    sprite:
      "https://protomaps.github.io/basemaps-assets/sprites/v4/dark",
    sources,
    layers: [...baseLayers, ...labelLayers],
  };
}

/**
 * Imagery underneath labels varies wildly (snow, sand, dark forests,
 * blue water, urban grays), so default Protomaps halo widths are too
 * thin to read on satellite. We force every symbol layer to use white
 * text with a strong, opaque-black halo — same approach Google/Apple
 * use for their hybrid view.
 */
function forceStrongLabelContrast(layer: LayerSpecification): LayerSpecification {
  if (layer.type !== "symbol") return layer;
  return {
    ...layer,
    paint: {
      ...layer.paint,
      "text-color": "#ffffff",
      "text-halo-color": "rgba(0, 0, 0, 0.9)",
      "text-halo-width": 1.6,
      "text-halo-blur": 0.5,
    },
  };
}
