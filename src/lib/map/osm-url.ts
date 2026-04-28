/** Parse an OSM URL or canonical string into type + id.
 *
 * Accepts:
 * - "https://www.openstreetmap.org/node/123"
 * - "node/123"
 */
export function parseOsmCanonical(
  url: string,
): { osmType: string; osmId: number } | null {
  const match = url.match(/(node|way|relation)\/(\d+)/);
  if (!match) return null;
  return { osmType: match[1], osmId: Number(match[2]) };
}

/**
 * Friendly placeholder for a place when Nominatim hasn't returned a
 * name yet (loading or rate-limited 429). Beats showing raw
 * `node/123` strings in the UI.
 */
export function fallbackPlaceLabel(osmType: string, osmId: number): string {
  const human =
    osmType === "node"
      ? "Place"
      : osmType === "way"
        ? "Area"
        : osmType === "relation"
          ? "Region"
          : "Place";
  return `${human} #${osmId}`;
}
