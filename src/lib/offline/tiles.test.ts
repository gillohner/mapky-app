import { describe, expect, it } from "vitest";
import {
  countTiles,
  lonToTileX,
  latToTileY,
  tilesInBbox,
  type Bbox,
} from "./tiles";

describe("tile math", () => {
  it("z=0 has exactly one tile spanning the globe", () => {
    const bbox: Bbox = { west: -180, south: -85, east: 180, north: 85 };
    expect(tilesInBbox(bbox, 0)).toEqual([[0, 0, 0]]);
  });

  it("z=1 has four tiles for the whole world", () => {
    const bbox: Bbox = { west: -180, south: -85, east: 180, north: 85 };
    expect(tilesInBbox(bbox, 1).length).toBe(4);
  });

  it("Zurich at zoom 14 is roughly a dozen tiles", () => {
    // Zurich city centre, ~0.05° × 0.04°
    const bbox: Bbox = {
      west: 8.52,
      south: 47.36,
      east: 8.57,
      north: 47.4,
    };
    const tiles = tilesInBbox(bbox, 14);
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.length).toBeLessThan(40);
  });

  it("lonToTileX is monotonic", () => {
    expect(lonToTileX(-180, 5)).toBeLessThan(lonToTileX(180, 5));
  });

  it("latToTileY decreases as latitude increases (north → smaller y)", () => {
    expect(latToTileY(60, 5)).toBeLessThan(latToTileY(-60, 5));
  });

  it("countTiles sums across zoom range", () => {
    const bbox: Bbox = { west: -180, south: -85, east: 180, north: 85 };
    // z=0..2 → 1 + 4 + 16
    expect(countTiles(bbox, 0, 2)).toBe(21);
  });
});
