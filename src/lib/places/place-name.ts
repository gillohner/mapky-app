import type { NominatimResult } from "@/lib/api/nominatim";
import { fallbackPlaceLabel } from "@/lib/map/osm-url";

/**
 * Build a display name from Nominatim's address breakdown. OSM has
 * tons of unnamed buildings — `building=yes` with full `addr:*` tags
 * but no `name` — and showing the OSM ID for those is useless. The
 * address is what the user typed in the search bar / saw on the map,
 * so it's also the title we should show.
 *
 * Resolution priority:
 *  - "{house_number} {road}, {city}"   when both number + road exist
 *  - "{road}"                          road-only fallback
 *  - "{neighbourhood|suburb|...}"      named area fallback
 *  - null                              caller falls through to the
 *                                      next layer (display_name, etc.)
 */
export function buildAddressName(
  address: Record<string, string> | undefined,
): string | null {
  if (!address) return null;
  const num = address.house_number;
  // Nominatim normalises `addr:street` → `address.road`, but some
  // results (e.g. shop on a footpath) use `pedestrian` or `street`
  // directly. Cover the common variants.
  const road =
    address.road ||
    address.street ||
    address.pedestrian ||
    address.footway ||
    address.path;
  const city =
    address.city ||
    address.town ||
    address.village ||
    address.hamlet ||
    address.municipality;

  if (num && road) {
    return city ? `${num} ${road}, ${city}` : `${num} ${road}`;
  }
  if (road) return city ? `${road}, ${city}` : road;
  for (const key of ["neighbourhood", "suburb", "hamlet", "village", "town", "city"]) {
    if (address[key]) return address[key];
  }
  return null;
}

/**
 * Pick the best human-readable label for an OSM place from a Nominatim
 * lookup. Used everywhere a place is referenced by name — list rows,
 * detail headers, search results — so the same OSM ref renders the
 * same text everywhere.
 *
 * Resolution chain (highest priority first):
 *   1. Nominatim's `name` tag            ("Café Foo")
 *   2. tile-clicked name passed in       (basemap label, may differ)
 *   3. Built address                     ("48 Hirschengraben, Luzern")
 *   4. First chunk of `display_name`     ("48 Hirschengraben")
 *   5. `way 184411684` / similar         (last-resort identifier)
 */
export function resolvePlaceName(
  osmType: string,
  osmId: number,
  nominatim: NominatimResult | undefined | null,
  tileName?: string,
): string {
  return (
    nominatim?.name?.trim() ||
    tileName?.trim() ||
    buildAddressName(nominatim?.address) ||
    nominatim?.display_name?.split(",")[0]?.trim() ||
    fallbackPlaceLabel(osmType, osmId)
  );
}
