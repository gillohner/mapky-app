import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import { layers, namedFlavor } from "@protomaps/basemaps";
import { config } from "@/lib/config";

export type Basemap = "default" | "terrain" | "cycling" | "satellite";

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
  if (basemap === "terrain") {
    return createTerrainStyle();
  }
  if (basemap === "cycling") {
    return createCyclingStyle();
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
 * Terrain basemap — Protomaps grayscale flavor with AWS Open Data
 * Terrarium hillshade baked in underneath the road/POI layers. The
 * grayscale background lets the relief shading read clearly without
 * competing with colored land-use polygons. Theme is ignored: terrain
 * is one cohesive look regardless of light/dark mode.
 */
function createTerrainStyle(): StyleSpecification {
  const flavor = namedFlavor("grayscale");
  const key = config.protomaps.key;
  const protomapsLayers = layers("protomaps", flavor, { lang: "en" });

  // Insert hillshade just BEFORE the first symbol layer (labels) so:
  //   - all fills (earth, landuse, water) and lines (roads, water lines,
  //     boundaries, buildings) get tinted by the relief
  //   - labels stay crisp on top, unaffected by shading
  // Putting hillshade earlier (just after `background`) doesn't work
  // because the opaque earth/landuse fills above it cover the relief —
  // exactly the "map laid over terrain" issue otherwise.
  const symbolStart = protomapsLayers.findIndex((l) => l.type === "symbol");
  const splitAt = symbolStart >= 0 ? symbolStart : protomapsLayers.length;
  const hillshade: LayerSpecification = {
    id: "aws-terrain-hillshade",
    type: "hillshade",
    source: "aws-terrain",
    paint: {
      // Same exaggeration ramp the standalone overlay used: strong at
      // regional scales, fade to 0 by z=16 (Terrarium maxzoom is 15).
      "hillshade-exaggeration": [
        "interpolate",
        ["linear"],
        ["zoom"],
        6, 0.7,
        12, 0.55,
        14, 0.4,
        15, 0.25,
        16, 0,
      ],
      "hillshade-shadow-color": "#222",
      "hillshade-highlight-color": "#fff",
      "hillshade-accent-color": "#5a5a5a",
    },
  };

  return {
    version: 8,
    glyphs:
      "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
    sprite:
      "https://protomaps.github.io/basemaps-assets/sprites/v4/light",
    sources: {
      protomaps: {
        type: "vector",
        url: `https://api.protomaps.com/tiles/v4.json?key=${key}`,
        attribution:
          '<a href="https://protomaps.com">Protomaps</a> | &copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
      },
      "aws-terrain": {
        type: "raster-dem",
        tiles: [
          "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        minzoom: 0,
        maxzoom: 15,
        encoding: "terrarium",
        attribution:
          'Terrain &copy; <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">AWS Open Data — Terrain Tiles</a>',
      },
    },
    layers: [
      ...protomapsLayers.slice(0, splitAt),
      hillshade,
      ...protomapsLayers.slice(splitAt),
    ],
  };
}

/**
 * Cycling basemap — CyclOSM raster tiles. A complete styled basemap
 * (full coverage of land/water/roads/labels) focused on cycling
 * infrastructure. OpenStreetMap.org lists CyclOSM as a base layer
 * alongside Standard / Transport / Humanitarian, so we treat it the
 * same here: mutually exclusive with the other basemaps.
 */
function createCyclingStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs:
      "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
    sources: {
      cyclosm: {
        type: "raster",
        tiles: [
          "https://a.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
          "https://b.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
          "https://c.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        minzoom: 2,
        maxzoom: 20,
        attribution:
          '<a href="https://www.cyclosm.org" target="_blank" rel="noopener">CyclOSM</a> | hosted by <a href="https://openstreetmap.fr" target="_blank" rel="noopener">OSM-FR</a>',
      },
    },
    layers: [
      {
        id: "cyclosm",
        type: "raster",
        source: "cyclosm",
      },
    ],
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
