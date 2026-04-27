import { describe, expect, it } from "vitest";
import { decodePolyline, encodePolyline } from "./polyline";

describe("polyline encode/decode", () => {
  it("encodes Google's reference example at precision 5", () => {
    // Reference vector from Google's polyline algorithm spec.
    // https://developers.google.com/maps/documentation/utilities/polylinealgorithm
    const coords: Array<[number, number]> = [
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ];
    const encoded = encodePolyline(coords, 5);
    expect(encoded).toBe("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
  });

  it("roundtrips at precision 6 (Valhalla default)", () => {
    const coords: Array<[number, number]> = [
      [8.5417, 47.3769],
      [8.545, 47.38],
      [8.55, 47.385],
      [8.5601, 47.3911],
    ];
    const encoded = encodePolyline(coords, 6);
    const decoded = decodePolyline(encoded, 6);
    expect(decoded).toHaveLength(coords.length);
    decoded.forEach(([lng, lat], i) => {
      expect(lng).toBeCloseTo(coords[i][0], 5);
      expect(lat).toBeCloseTo(coords[i][1], 5);
    });
  });

  it("roundtrips a single segment", () => {
    const coords: Array<[number, number]> = [
      [0, 0],
      [1, 1],
    ];
    const encoded = encodePolyline(coords, 6);
    const decoded = decodePolyline(encoded, 6);
    expect(decoded[0][0]).toBeCloseTo(0, 5);
    expect(decoded[0][1]).toBeCloseTo(0, 5);
    expect(decoded[1][0]).toBeCloseTo(1, 5);
    expect(decoded[1][1]).toBeCloseTo(1, 5);
  });

  it("handles negative coordinates and zero crossings", () => {
    const coords: Array<[number, number]> = [
      [-179.999, -89.999],
      [0, 0],
      [179.999, 89.999],
    ];
    const encoded = encodePolyline(coords, 6);
    const decoded = decodePolyline(encoded, 6);
    expect(decoded).toHaveLength(3);
    decoded.forEach(([lng, lat], i) => {
      expect(lng).toBeCloseTo(coords[i][0], 5);
      expect(lat).toBeCloseTo(coords[i][1], 5);
    });
  });

  it("returns an empty array for an empty string", () => {
    expect(decodePolyline("", 6)).toEqual([]);
  });

  it("encodes an empty input to an empty string", () => {
    expect(encodePolyline([], 6)).toBe("");
  });
});
