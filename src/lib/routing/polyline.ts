import type { LngLat } from "./types";

/**
 * Decode a Google-style encoded polyline.
 *
 * Valhalla emits precision-6 polylines by default; Google Maps API uses
 * precision 5. Pass `precision` to switch.
 *
 * Returns coordinates in [lon, lat] order to match GeoJSON / MapLibre.
 */
export function decodePolyline(encoded: string, precision = 6): LngLat[] {
  const factor = Math.pow(10, precision);
  const out: LngLat[] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dlon = result & 1 ? ~(result >> 1) : result >> 1;
    lon += dlon;

    out.push([lon / factor, lat / factor]);
  }

  return out;
}

/**
 * Encode an array of [lon, lat] coordinates as a Google-style polyline.
 * Default precision 6 matches Valhalla's output.
 */
export function encodePolyline(coords: LngLat[], precision = 6): string {
  const factor = Math.pow(10, precision);
  let out = "";
  let prevLat = 0;
  let prevLon = 0;

  for (const [lon, lat] of coords) {
    const latI = Math.round(lat * factor);
    const lonI = Math.round(lon * factor);
    out += encodeSigned(latI - prevLat);
    out += encodeSigned(lonI - prevLon);
    prevLat = latI;
    prevLon = lonI;
  }

  return out;
}

function encodeSigned(n: number): string {
  let v = n < 0 ? ~(n << 1) : n << 1;
  let out = "";
  while (v >= 0x20) {
    out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>>= 5;
  }
  out += String.fromCharCode(v + 63);
  return out;
}
