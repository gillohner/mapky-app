import type { LngLat, Waypoint } from "../routing/types";

export interface ParsedGpx {
  /** Top-level metadata/name from <metadata><name> or <rte><name> if present. */
  name?: string;
  /** Description from <metadata><desc> or <rte><desc>. */
  description?: string;
  /**
   * Waypoints: prefer <rte><rtept>; fall back to a downsampled <trk><trkseg><trkpt>.
   * Always at least 2 points if the GPX is well-formed; caller validates further.
   */
  waypoints: Waypoint[];
  /**
   * Full track geometry as [lon, lat][] when the GPX contains a <trk>. Lets
   * the importer skip the routing engine and persist the imported geometry as-is.
   */
  geometry?: LngLat[];
}

const TRACK_POINT_CAP = 250;

/**
 * Parse a GPX 1.1 string into waypoints + optional track geometry.
 *
 * Heuristics:
 * 1. If the doc has a <rte>, use its <rtept>s as the waypoints (these are the
 *    user's intended stops).
 * 2. Else, use the first <trk>'s flattened <trkpt>s. Pick up to TRACK_POINT_CAP
 *    waypoints by even decimation, but persist the FULL track as geometry.
 * 3. <wpt> are ignored unless we have nothing else (rare).
 */
export function parseGpx(input: string): ParsedGpx {
  const doc = new DOMParser().parseFromString(input, "application/xml");
  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    throw new Error(`Invalid GPX: ${parserError.textContent ?? "parse error"}`);
  }

  const rootName = doc.documentElement.localName;
  if (rootName !== "gpx") {
    throw new Error(`Expected <gpx> root, got <${rootName}>`);
  }

  const metaName = textOf(doc.querySelector("gpx > metadata > name"));
  const metaDesc = textOf(doc.querySelector("gpx > metadata > desc"));

  const rte = doc.querySelector("gpx > rte");
  if (rte) {
    const ptEls = Array.from(rte.querySelectorAll(":scope > rtept"));
    const waypoints = ptEls.map(elementToWaypoint).filter(isValidPoint);
    if (waypoints.length >= 2) {
      return {
        name: textOf(rte.querySelector(":scope > name")) ?? metaName,
        description: textOf(rte.querySelector(":scope > desc")) ?? metaDesc,
        waypoints,
      };
    }
  }

  const trk = doc.querySelector("gpx > trk");
  if (trk) {
    const segs = Array.from(trk.querySelectorAll(":scope > trkseg"));
    const allPts: Waypoint[] = [];
    for (const seg of segs) {
      const segPts = Array.from(seg.querySelectorAll(":scope > trkpt"))
        .map(elementToWaypoint)
        .filter(isValidPoint);
      allPts.push(...segPts);
    }
    if (allPts.length >= 2) {
      const geometry: LngLat[] = allPts.map((w) => [w.lon, w.lat]);
      const waypoints = decimate(allPts, TRACK_POINT_CAP);
      return {
        name: textOf(trk.querySelector(":scope > name")) ?? metaName,
        description: textOf(trk.querySelector(":scope > desc")) ?? metaDesc,
        waypoints,
        geometry,
      };
    }
  }

  const wptEls = Array.from(doc.querySelectorAll("gpx > wpt"));
  if (wptEls.length >= 2) {
    const waypoints = wptEls.map(elementToWaypoint).filter(isValidPoint);
    if (waypoints.length >= 2) {
      return { name: metaName, description: metaDesc, waypoints };
    }
  }

  throw new Error(
    "GPX has no usable route, track, or waypoint sequence (need ≥2 points)",
  );
}

function elementToWaypoint(el: Element): Waypoint {
  const lat = Number(el.getAttribute("lat"));
  const lon = Number(el.getAttribute("lon"));
  const eleText = textOf(el.querySelector(":scope > ele"));
  const nameText = textOf(el.querySelector(":scope > name"));
  return {
    lat,
    lon,
    ele: eleText !== undefined ? Number(eleText) : null,
    name: nameText ?? null,
  };
}

function isValidPoint(w: Waypoint): boolean {
  return (
    Number.isFinite(w.lat) &&
    Number.isFinite(w.lon) &&
    Math.abs(w.lat) <= 90 &&
    Math.abs(w.lon) <= 180
  );
}

function textOf(el: Element | null | undefined): string | undefined {
  const t = el?.textContent?.trim();
  return t && t.length > 0 ? t : undefined;
}

function decimate<T>(items: T[], cap: number): T[] {
  if (items.length <= cap) return items;
  const out: T[] = [];
  // Always keep first and last; sample evenly between.
  const step = (items.length - 1) / (cap - 1);
  for (let i = 0; i < cap; i++) {
    out.push(items[Math.round(i * step)]);
  }
  return out;
}
