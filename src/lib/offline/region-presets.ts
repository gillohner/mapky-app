import type { Bbox } from "./tiles";

/**
 * Hardcoded "region packs" that aren't a single OSM relation — mostly
 * continents and other large spans the search box can't easily land on
 * with one query. Bboxes are deliberately tight (no oceans / poles) so
 * the tile count estimate is realistic; users tweaking the max-zoom
 * down still get a usable pre-warmed area.
 *
 * For everything an admin boundary already covers (countries, states,
 * cities, neighbourhoods) prefer Nominatim's `boundingbox` instead of
 * adding an entry here.
 */
export interface RegionPreset {
  id: string;
  name: string;
  bbox: Bbox;
  /**
   * Suggested ceiling. Continent-scale presets cap low because the
   * tile count grows by 4× per zoom — anything over 8 is multi-GB.
   */
  defaultMaxZoom: number;
}

export const REGION_PRESETS: RegionPreset[] = [
  {
    id: "preset:europe",
    name: "Europe",
    bbox: { west: -11, south: 35, east: 40, north: 71 },
    defaultMaxZoom: 6,
  },
  {
    id: "preset:north-america",
    name: "North America",
    bbox: { west: -168, south: 14, east: -52, north: 72 },
    defaultMaxZoom: 5,
  },
  {
    id: "preset:south-america",
    name: "South America",
    bbox: { west: -82, south: -56, east: -34, north: 13 },
    defaultMaxZoom: 5,
  },
  {
    id: "preset:africa",
    name: "Africa",
    bbox: { west: -18, south: -35, east: 52, north: 38 },
    defaultMaxZoom: 5,
  },
  {
    id: "preset:asia",
    name: "Asia",
    bbox: { west: 25, south: -11, east: 180, north: 78 },
    defaultMaxZoom: 5,
  },
  {
    id: "preset:oceania",
    name: "Oceania",
    bbox: { west: 110, south: -50, east: 180, north: 0 },
    defaultMaxZoom: 5,
  },
];
