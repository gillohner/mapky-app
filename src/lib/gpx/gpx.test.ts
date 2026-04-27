import { describe, expect, it } from "vitest";
import { parseGpx } from "./parse";
import { emitGpx, gpxFilename } from "./emit";

const STRAVA_LIKE_RTE = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Strava" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Lake Loop</name><desc>Sunday spin</desc></metadata>
  <rte>
    <name>Lake Loop</name>
    <rtept lat="47.3769" lon="8.5417"><ele>408</ele><name>Start</name></rtept>
    <rtept lat="47.3494" lon="8.4920"><ele>869</ele><name>Summit</name></rtept>
    <rtept lat="47.3769" lon="8.5417"><ele>408</ele><name>Finish</name></rtept>
  </rte>
</gpx>`;

const GARMIN_LIKE_TRK = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Garmin Connect" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Morning hike</name></metadata>
  <trk><name>Morning hike</name>
    <trkseg>
      <trkpt lat="47.300" lon="8.500"><ele>500</ele></trkpt>
      <trkpt lat="47.301" lon="8.501"><ele>501</ele></trkpt>
      <trkpt lat="47.302" lon="8.502"><ele>502</ele></trkpt>
      <trkpt lat="47.303" lon="8.503"><ele>503</ele></trkpt>
      <trkpt lat="47.304" lon="8.504"><ele>504</ele></trkpt>
    </trkseg>
  </trk>
</gpx>`;

describe("parseGpx", () => {
  it("prefers <rte> when both present-style", () => {
    const parsed = parseGpx(STRAVA_LIKE_RTE);
    expect(parsed.name).toBe("Lake Loop");
    expect(parsed.description).toBe("Sunday spin");
    expect(parsed.waypoints).toHaveLength(3);
    expect(parsed.waypoints[0].lat).toBe(47.3769);
    expect(parsed.waypoints[0].lon).toBe(8.5417);
    expect(parsed.waypoints[0].name).toBe("Start");
    expect(parsed.geometry).toBeUndefined();
  });

  it("falls back to <trk> when no <rte>", () => {
    const parsed = parseGpx(GARMIN_LIKE_TRK);
    expect(parsed.name).toBe("Morning hike");
    expect(parsed.waypoints.length).toBeGreaterThanOrEqual(2);
    expect(parsed.geometry).toBeDefined();
    expect(parsed.geometry!.length).toBe(5);
    // Geometry order: [lon, lat]
    expect(parsed.geometry![0]).toEqual([8.5, 47.3]);
  });

  it("decimates large tracks to <=250 waypoints but preserves full geometry", () => {
    const points: string[] = [];
    for (let i = 0; i < 1000; i++) {
      const lat = 47 + i * 0.0001;
      const lon = 8 + i * 0.0001;
      points.push(`<trkpt lat="${lat}" lon="${lon}"/>`);
    }
    const gpx = `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
      <trk><trkseg>${points.join("")}</trkseg></trk></gpx>`;
    const parsed = parseGpx(gpx);
    expect(parsed.waypoints.length).toBeLessThanOrEqual(250);
    expect(parsed.waypoints.length).toBeGreaterThanOrEqual(2);
    expect(parsed.geometry!.length).toBe(1000);
  });

  it("rejects malformed XML", () => {
    expect(() => parseGpx("<gpx><not closed")).toThrow();
  });

  it("rejects non-gpx root element", () => {
    expect(() => parseGpx('<?xml version="1.0"?><foo></foo>')).toThrow(/<gpx>/);
  });

  it("rejects a route with fewer than 2 valid points", () => {
    const tooFew = `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
      <rte><rtept lat="47.0" lon="8.0"/></rte></gpx>`;
    expect(() => parseGpx(tooFew)).toThrow();
  });
});

describe("emitGpx", () => {
  it("emits a valid GPX 1.1 document with <rte> and <trk>", () => {
    const out = emitGpx({
      name: "Test",
      description: "desc",
      waypoints: [
        { lat: 47.0, lon: 8.0, ele: 400, name: "A" },
        { lat: 47.1, lon: 8.1, ele: 410, name: "B" },
      ],
      geometry: [
        [8.0, 47.0],
        [8.05, 47.05],
        [8.1, 47.1],
      ],
    });
    expect(out).toContain('<gpx version="1.1"');
    expect(out).toContain("<rte>");
    expect(out).toContain('<rtept lat="47" lon="8">');
    expect(out).toContain("<trk>");
    expect(out).toContain('<trkpt lat="47.05" lon="8.05"/>');
  });

  it("escapes XML-unsafe characters in name and description", () => {
    const out = emitGpx({
      name: 'Bad <name> & "stuff"',
      description: "<desc>",
      waypoints: [
        { lat: 47, lon: 8 },
        { lat: 48, lon: 9 },
      ],
    });
    expect(out).toContain("Bad &lt;name&gt; &amp; \"stuff\"");
    expect(out).toContain("&lt;desc&gt;");
    expect(out).not.toContain("Bad <name>");
  });

  it("omits <trk> when geometry is missing", () => {
    const out = emitGpx({
      name: "No track",
      waypoints: [
        { lat: 47, lon: 8 },
        { lat: 48, lon: 9 },
      ],
    });
    expect(out).toContain("<rte>");
    expect(out).not.toContain("<trk>");
  });
});

describe("emit → parse roundtrip", () => {
  it("preserves waypoints across an export/import cycle", () => {
    const waypoints = [
      { lat: 47.3769, lon: 8.5417, ele: 408, name: "Start" },
      { lat: 47.3494, lon: 8.492, ele: 869, name: "Summit" },
      { lat: 47.3769, lon: 8.5417, ele: 408, name: "Finish" },
    ];
    const gpx = emitGpx({ name: "Loop", description: "round trip", waypoints });
    const parsed = parseGpx(gpx);
    expect(parsed.name).toBe("Loop");
    expect(parsed.waypoints).toHaveLength(3);
    parsed.waypoints.forEach((w, i) => {
      expect(w.lat).toBeCloseTo(waypoints[i].lat, 6);
      expect(w.lon).toBeCloseTo(waypoints[i].lon, 6);
      expect(w.name).toBe(waypoints[i].name);
    });
  });
});

describe("gpxFilename", () => {
  it("slugs unicode and punctuation", () => {
    expect(gpxFilename("Café Loop!")).toBe("cafe-loop.gpx");
    expect(gpxFilename("  ALL  CAPS  ")).toBe("all-caps.gpx");
    expect(gpxFilename("foo / bar")).toBe("foo-bar.gpx");
  });

  it("falls back to 'route' for empty/garbage names", () => {
    expect(gpxFilename("")).toBe("route.gpx");
    expect(gpxFilename("???")).toBe("route.gpx");
  });
});
