/**
 * Protomaps v4 encodes OSM element type + id in the MVT feature id:
 *   featureId = (elemType << 44) | osmId
 * where elemType: 1=node, 2=way, 3=relation
 */

const TYPE_TO_CODE: Record<string, number> = { node: 1, way: 2, relation: 3 };
const CODE_TO_TYPE: Record<number, string> = { 1: "node", 2: "way", 3: "relation" };

export function encodeFeatureId(osmType: string, osmId: number): number {
  const code = TYPE_TO_CODE[osmType];
  if (!code || osmId <= 0) return 0;
  return code * 2 ** 44 + osmId;
}

export function decodeFeatureId(
  fid: number,
): { osmType: string; osmId: number } | null {
  const elemType = Math.floor(fid / 2 ** 44);
  const osmId = fid % 2 ** 44;
  const osmType = CODE_TO_TYPE[elemType];
  if (!osmType || osmId <= 0) return null;
  return { osmType, osmId };
}

/**
 * All source layers that have highlight layers.
 * setFeatureState on a non-matching ID is a no-op, so it's safe to
 * try all of them — this avoids guessing wrong (e.g. a city relation
 * lives in "places", not "buildings").
 */
export const HIGHLIGHT_SOURCE_LAYERS = [
  "pois",
  "places",
  "buildings",
] as const;

export function sourceLayersForType(_osmType: string): string[] {
  return [...HIGHLIGHT_SOURCE_LAYERS];
}
