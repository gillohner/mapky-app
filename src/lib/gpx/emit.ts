import type { LngLat, Waypoint } from "../routing/types";

export interface EmitGpxInput {
  name: string;
  description?: string | null;
  /** User-input waypoints (start, vias, end). Emitted as <rte>/<rtept>. */
  waypoints: Waypoint[];
  /**
   * Full snapped path, in [lon, lat] order. Emitted as <trk>/<trkseg>/<trkpt>
   * so consumers (Garmin, Strava) get the actual route shape.
   */
  geometry?: LngLat[] | null;
  creator?: string;
}

/** Emit a GPX 1.1 document. Pure string output, no XML helpers. */
export function emitGpx(input: EmitGpxInput): string {
  const creator = input.creator ?? "MapKy";
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<gpx version="1.1" creator="${escapeAttr(creator)}" xmlns="http://www.topografix.com/GPX/1/1">`,
  );

  lines.push("  <metadata>");
  lines.push(`    <name>${escapeText(input.name)}</name>`);
  if (input.description) {
    lines.push(`    <desc>${escapeText(input.description)}</desc>`);
  }
  lines.push("  </metadata>");

  lines.push("  <rte>");
  lines.push(`    <name>${escapeText(input.name)}</name>`);
  if (input.description) {
    lines.push(`    <desc>${escapeText(input.description)}</desc>`);
  }
  for (const w of input.waypoints) {
    lines.push(`    <rtept lat="${w.lat}" lon="${w.lon}">`);
    if (w.ele != null) lines.push(`      <ele>${w.ele}</ele>`);
    if (w.name) lines.push(`      <name>${escapeText(w.name)}</name>`);
    lines.push("    </rtept>");
  }
  lines.push("  </rte>");

  if (input.geometry && input.geometry.length >= 2) {
    lines.push("  <trk>");
    lines.push(`    <name>${escapeText(input.name)}</name>`);
    lines.push("    <trkseg>");
    for (const [lon, lat] of input.geometry) {
      lines.push(`      <trkpt lat="${lat}" lon="${lon}"/>`);
    }
    lines.push("    </trkseg>");
    lines.push("  </trk>");
  }

  lines.push("</gpx>");
  return lines.join("\n");
}

function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, "&quot;");
}

/** Slug a string for use as a filename. */
export function gpxFilename(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "route"}.gpx`;
}
