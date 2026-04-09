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
