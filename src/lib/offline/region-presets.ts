import type { Bbox } from "./tiles";

/**
 * CoMaps / Organic-Maps style downloadable region packs. Curated, not
 * dynamic — each entry has a known bbox + recommended max-zoom so the
 * UI can show a size estimate without round-tripping Nominatim. The
 * dialog's free-text search is the fallback for everything not in the
 * tree.
 *
 * Bboxes are approximate land-only extents (no claimed waters, no
 * polar overhang). Picking the right max-zoom matters a lot: tile
 * counts grow 4× per zoom, so a country at z=14 is multi-GB while
 * z=10 fits in tens of MB.
 */

export interface RegionPack {
  id: string;
  name: string;
  bbox: Bbox;
  /** Heuristic ceiling so the size estimate isn't shocking. */
  defaultMaxZoom: number;
}

export interface ContinentPack {
  id: string;
  name: string;
  bbox: Bbox;
  defaultMaxZoom: number;
  countries: RegionPack[];
}

export const REGION_TREE: ContinentPack[] = [
  {
    id: "preset:europe",
    name: "Europe",
    bbox: { west: -11, south: 35, east: 40, north: 71 },
    defaultMaxZoom: 6,
    countries: [
      { id: "country:at", name: "Austria",        bbox: { west: 9.5,   south: 46.4,  east: 17.2,  north: 49.0  }, defaultMaxZoom: 11 },
      { id: "country:be", name: "Belgium",        bbox: { west: 2.5,   south: 49.5,  east: 6.4,   north: 51.6  }, defaultMaxZoom: 11 },
      { id: "country:cz", name: "Czechia",        bbox: { west: 12.1,  south: 48.5,  east: 18.9,  north: 51.1  }, defaultMaxZoom: 11 },
      { id: "country:dk", name: "Denmark",        bbox: { west: 8.0,   south: 54.5,  east: 15.2,  north: 57.8  }, defaultMaxZoom: 11 },
      { id: "country:fi", name: "Finland",        bbox: { west: 20.5,  south: 59.7,  east: 31.6,  north: 70.1  }, defaultMaxZoom: 10 },
      { id: "country:fr", name: "France",         bbox: { west: -5.2,  south: 41.3,  east: 9.6,   north: 51.1  }, defaultMaxZoom: 10 },
      { id: "country:de", name: "Germany",        bbox: { west: 5.8,   south: 47.2,  east: 15.1,  north: 55.1  }, defaultMaxZoom: 10 },
      { id: "country:gr", name: "Greece",         bbox: { west: 19.3,  south: 34.8,  east: 28.3,  north: 41.8  }, defaultMaxZoom: 11 },
      { id: "country:hu", name: "Hungary",        bbox: { west: 16.1,  south: 45.7,  east: 22.9,  north: 48.6  }, defaultMaxZoom: 11 },
      { id: "country:ie", name: "Ireland",        bbox: { west: -10.5, south: 51.4,  east: -5.4,  north: 55.4  }, defaultMaxZoom: 11 },
      { id: "country:it", name: "Italy",          bbox: { west: 6.6,   south: 35.5,  east: 18.5,  north: 47.1  }, defaultMaxZoom: 10 },
      { id: "country:nl", name: "Netherlands",    bbox: { west: 3.3,   south: 50.7,  east: 7.2,   north: 53.6  }, defaultMaxZoom: 11 },
      { id: "country:no", name: "Norway",         bbox: { west: 4.6,   south: 57.9,  east: 31.1,  north: 71.2  }, defaultMaxZoom: 10 },
      { id: "country:pl", name: "Poland",         bbox: { west: 14.1,  south: 49.0,  east: 24.2,  north: 54.9  }, defaultMaxZoom: 10 },
      { id: "country:pt", name: "Portugal",       bbox: { west: -9.6,  south: 36.9,  east: -6.2,  north: 42.2  }, defaultMaxZoom: 11 },
      { id: "country:ro", name: "Romania",        bbox: { west: 20.2,  south: 43.6,  east: 29.7,  north: 48.3  }, defaultMaxZoom: 11 },
      { id: "country:es", name: "Spain",          bbox: { west: -9.4,  south: 36.0,  east: 4.3,   north: 43.8  }, defaultMaxZoom: 10 },
      { id: "country:se", name: "Sweden",         bbox: { west: 11.0,  south: 55.3,  east: 24.2,  north: 69.1  }, defaultMaxZoom: 10 },
      { id: "country:ch", name: "Switzerland",    bbox: { west: 5.9,   south: 45.8,  east: 10.5,  north: 47.8  }, defaultMaxZoom: 12 },
      { id: "country:gb", name: "United Kingdom", bbox: { west: -8.6,  south: 49.9,  east: 1.8,   north: 60.9  }, defaultMaxZoom: 10 },
      { id: "country:ua", name: "Ukraine",        bbox: { west: 22.1,  south: 44.4,  east: 40.2,  north: 52.4  }, defaultMaxZoom: 10 },
    ],
  },
  {
    id: "preset:north-america",
    name: "North America",
    bbox: { west: -168, south: 14, east: -52, north: 72 },
    defaultMaxZoom: 5,
    countries: [
      { id: "country:ca", name: "Canada",         bbox: { west: -141,   south: 41.7,  east: -52.6, north: 70.0  }, defaultMaxZoom: 8 },
      { id: "country:mx", name: "Mexico",         bbox: { west: -118.4, south: 14.5,  east: -86.7, north: 32.7  }, defaultMaxZoom: 10 },
      { id: "country:us", name: "United States",  bbox: { west: -125,   south: 24.4,  east: -66.9, north: 49.4  }, defaultMaxZoom: 9 },
      { id: "country:cu", name: "Cuba",           bbox: { west: -85,    south: 19.8,  east: -74,   north: 23.5  }, defaultMaxZoom: 11 },
    ],
  },
  {
    id: "preset:south-america",
    name: "South America",
    bbox: { west: -82, south: -56, east: -34, north: 13 },
    defaultMaxZoom: 5,
    countries: [
      { id: "country:ar", name: "Argentina", bbox: { west: -73.6, south: -55.0, east: -53.6, north: -21.8 }, defaultMaxZoom: 9  },
      { id: "country:bo", name: "Bolivia",   bbox: { west: -69.6, south: -22.9, east: -57.5, north: -9.7  }, defaultMaxZoom: 10 },
      { id: "country:br", name: "Brazil",    bbox: { west: -74.0, south: -33.8, east: -34.7, north: 5.3   }, defaultMaxZoom: 8  },
      { id: "country:cl", name: "Chile",     bbox: { west: -75.7, south: -55.9, east: -66.4, north: -17.5 }, defaultMaxZoom: 9  },
      { id: "country:co", name: "Colombia",  bbox: { west: -79.0, south: -4.2,  east: -66.9, north: 12.5  }, defaultMaxZoom: 10 },
      { id: "country:pe", name: "Peru",      bbox: { west: -81.3, south: -18.4, east: -68.7, north: -0.0  }, defaultMaxZoom: 10 },
      { id: "country:uy", name: "Uruguay",   bbox: { west: -58.4, south: -34.9, east: -53.2, north: -30.1 }, defaultMaxZoom: 11 },
    ],
  },
  {
    id: "preset:africa",
    name: "Africa",
    bbox: { west: -18, south: -35, east: 52, north: 38 },
    defaultMaxZoom: 5,
    countries: [
      { id: "country:dz", name: "Algeria",      bbox: { west: -8.7,  south: 18.9,  east: 12.0,  north: 37.1  }, defaultMaxZoom: 9  },
      { id: "country:eg", name: "Egypt",        bbox: { west: 24.7,  south: 21.7,  east: 36.9,  north: 31.7  }, defaultMaxZoom: 10 },
      { id: "country:et", name: "Ethiopia",     bbox: { west: 33.0,  south: 3.4,   east: 48.0,  north: 14.9  }, defaultMaxZoom: 10 },
      { id: "country:gh", name: "Ghana",        bbox: { west: -3.3,  south: 4.7,   east: 1.2,   north: 11.2  }, defaultMaxZoom: 11 },
      { id: "country:ke", name: "Kenya",        bbox: { west: 33.9,  south: -4.7,  east: 41.9,  north: 5.0   }, defaultMaxZoom: 10 },
      { id: "country:ma", name: "Morocco",      bbox: { west: -13.2, south: 21.4,  east: -1.0,  north: 35.9  }, defaultMaxZoom: 10 },
      { id: "country:ng", name: "Nigeria",      bbox: { west: 2.7,   south: 4.3,   east: 14.7,  north: 13.9  }, defaultMaxZoom: 10 },
      { id: "country:za", name: "South Africa", bbox: { west: 16.5,  south: -34.8, east: 32.9,  north: -22.1 }, defaultMaxZoom: 10 },
      { id: "country:tn", name: "Tunisia",      bbox: { west: 7.5,   south: 30.2,  east: 11.6,  north: 37.5  }, defaultMaxZoom: 11 },
    ],
  },
  {
    id: "preset:asia",
    name: "Asia",
    bbox: { west: 25, south: -11, east: 180, north: 78 },
    defaultMaxZoom: 5,
    countries: [
      { id: "country:cn", name: "China",        bbox: { west: 73.5,  south: 18.2,  east: 134.8, north: 53.6 }, defaultMaxZoom: 7  },
      { id: "country:in", name: "India",        bbox: { west: 68.1,  south: 6.7,   east: 97.4,  north: 35.7 }, defaultMaxZoom: 9  },
      { id: "country:id", name: "Indonesia",    bbox: { west: 95.0,  south: -11.0, east: 141.0, north: 6.0  }, defaultMaxZoom: 9  },
      { id: "country:ir", name: "Iran",         bbox: { west: 44.0,  south: 25.0,  east: 63.3,  north: 39.8 }, defaultMaxZoom: 10 },
      { id: "country:jp", name: "Japan",        bbox: { west: 122.9, south: 24.0,  east: 153.0, north: 45.5 }, defaultMaxZoom: 10 },
      { id: "country:kz", name: "Kazakhstan",   bbox: { west: 46.5,  south: 40.6,  east: 87.3,  north: 55.4 }, defaultMaxZoom: 8  },
      { id: "country:my", name: "Malaysia",     bbox: { west: 99.6,  south: 0.9,   east: 119.3, north: 7.4  }, defaultMaxZoom: 10 },
      { id: "country:ph", name: "Philippines",  bbox: { west: 116.9, south: 4.6,   east: 126.6, north: 21.1 }, defaultMaxZoom: 10 },
      { id: "country:kr", name: "South Korea",  bbox: { west: 124.6, south: 33.1,  east: 131.9, north: 38.6 }, defaultMaxZoom: 11 },
      { id: "country:lk", name: "Sri Lanka",    bbox: { west: 79.6,  south: 5.9,   east: 81.9,  north: 9.9  }, defaultMaxZoom: 11 },
      { id: "country:th", name: "Thailand",     bbox: { west: 97.3,  south: 5.6,   east: 105.6, north: 20.5 }, defaultMaxZoom: 10 },
      { id: "country:tr", name: "Turkey",       bbox: { west: 25.6,  south: 35.8,  east: 44.8,  north: 42.1 }, defaultMaxZoom: 10 },
      { id: "country:ae", name: "UAE",          bbox: { west: 51.5,  south: 22.5,  east: 56.4,  north: 26.1 }, defaultMaxZoom: 11 },
      { id: "country:vn", name: "Vietnam",      bbox: { west: 102.1, south: 8.4,   east: 109.5, north: 23.4 }, defaultMaxZoom: 10 },
    ],
  },
  {
    id: "preset:oceania",
    name: "Oceania",
    bbox: { west: 110, south: -50, east: 180, north: 0 },
    defaultMaxZoom: 5,
    countries: [
      { id: "country:au", name: "Australia",   bbox: { west: 112.9, south: -43.7, east: 153.6, north: -10.7 }, defaultMaxZoom: 7  },
      { id: "country:nz", name: "New Zealand", bbox: { west: 166.2, south: -47.3, east: 178.6, north: -34.4 }, defaultMaxZoom: 10 },
    ],
  },
];

export function findPack(
  id: string,
): { continent: ContinentPack; country: RegionPack | null } | null {
  for (const c of REGION_TREE) {
    if (c.id === id) return { continent: c, country: null };
    const country = c.countries.find((co) => co.id === id);
    if (country) return { continent: c, country };
  }
  return null;
}
