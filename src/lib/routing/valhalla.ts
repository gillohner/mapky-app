import { decodePolyline, encodePolyline } from "./polyline";
import {
  buildCostingOptions,
  friendlyValhallaError,
  parseValhallaError,
  type RoutingPreferences,
} from "./preferences";
import type {
  Costing,
  LngLat,
  ManeuverStep,
  RouteSnapResult,
  Waypoint,
} from "./types";

// In dev we proxy through Vite (`/valhalla` → valhalla1.openstreetmap.de)
// because the FOSSGIS instance omits CORS headers on rate-limit
// responses, which surfaces as opaque "NetworkError" instead of the
// useful 429 body. In prod, set VITE_VALHALLA_URL to a server-side proxy
// you control (or self-hosted Valhalla).
const VALHALLA_URL =
  import.meta.env.VITE_VALHALLA_URL ??
  (import.meta.env.DEV
    ? "/valhalla/route"
    : "https://valhalla1.openstreetmap.de/route");

interface ValhallaLocation {
  lat: number;
  lon: number;
  type?: "break" | "through" | "via";
}

interface ValhallaManeuver {
  instruction?: string;
  length?: number;
  begin_shape_index?: number;
  travel_mode?: string;
  travel_type?: string;
}

interface ValhallaLeg {
  shape: string;
  summary: { length: number; time: number };
  maneuvers?: ValhallaManeuver[];
}

interface ValhallaTrip {
  legs: ValhallaLeg[];
  summary: { length: number; time: number };
  units: "kilometers" | "miles";
}

interface ValhallaResponse {
  trip: ValhallaTrip;
  /** Up to 2 alternate routes when alternates > 0 was requested. */
  alternates?: Array<{ trip: ValhallaTrip }>;
}

export class RoutingError extends Error {
  readonly status?: number;
  readonly code?: number;
  readonly hint?: string;
  constructor(
    message: string,
    opts: { status?: number; code?: number; hint?: string } = {},
  ) {
    super(message);
    this.name = "RoutingError";
    this.status = opts.status;
    this.code = opts.code;
    this.hint = opts.hint;
  }
}

export interface ValhallaRequestOptions {
  signal?: AbortSignal;
  /** User-overridable preferences (avoid ferries/tolls/highways). */
  preferences?: RoutingPreferences;
  /**
   * Activity-specific costing options merged on top of the prefs-derived
   * options (walking_speed, max_hiking_difficulty, walkway_factor, etc.).
   * Lets Walk/Run/Hike produce meaningfully different routes from the
   * shared `pedestrian` costing.
   */
  activityOptions?: Record<string, number | boolean>;
  /**
   * How many alternative paths to ask for, in addition to the primary.
   * Valhalla caps at 2; we default to 2 so the UI can show "fastest +
   * avoid ferry + scenic" style options.
   */
  alternates?: number;
}

export interface RouteSnapBundle {
  /** Primary (best) route — what most users will pick. */
  primary: RouteSnapResult;
  /** Up to N alternates, ordered by Valhalla. */
  alternates: RouteSnapResult[];
}

/**
 * Request a snapped route from Valhalla. Returns the primary path plus
 * any alternates the engine produced.
 */
export async function requestRoute(
  waypoints: Waypoint[],
  costing: Costing,
  opts: ValhallaRequestOptions = {},
): Promise<RouteSnapBundle> {
  if (waypoints.length < 2) {
    throw new RoutingError("Need at least 2 waypoints");
  }

  const locations: ValhallaLocation[] = waypoints.map((w, i) => ({
    lat: w.lat,
    lon: w.lon,
    type: i === 0 || i === waypoints.length - 1 ? "break" : "via",
  }));

  const prefs: RoutingPreferences = opts.preferences ?? {
    avoidFerries: null,
    avoidTolls: null,
    avoidHighways: null,
  };
  // Merge order: prefs (avoid_X) → activity options (walking_speed, etc.).
  // Activity wins if there's a conflict, but in practice the two sets
  // address disjoint Valhalla knobs.
  const costingOptions = {
    ...buildCostingOptions(costing, prefs),
    ...(opts.activityOptions ?? {}),
  };

  const body = {
    locations,
    costing,
    costing_options: { [costing]: costingOptions },
    alternates: opts.alternates ?? 2,
    directions_options: { units: "kilometers" },
  };

  let res: Response;
  try {
    res = await fetch(VALHALLA_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    throw new RoutingError(
      err instanceof Error ? err.message : "Network error reaching Valhalla",
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const parsed = parseValhallaError(text);
    // 429 = upstream rate limit. FOSSGIS is fair-use; this is the user's
    // signal to slow down. Map it to a friendly message regardless of
    // whether the body parsed (the proxy strips CORS issues but Valhalla
    // sometimes returns plain text on rate-limit too).
    if (res.status === 429) {
      throw new RoutingError("Routing temporarily rate-limited.", {
        status: 429,
        hint: "The free Valhalla service throttles bursts. Wait a few seconds and try again, or simplify the route.",
      });
    }
    const { message, hint } = friendlyValhallaError(
      parsed?.code,
      costing,
      text,
    );
    throw new RoutingError(message, {
      status: res.status,
      code: parsed?.code,
      hint,
    });
  }

  const data = (await res.json()) as ValhallaResponse;
  if (!data.trip?.legs?.length) {
    throw new RoutingError("Routing engine returned no legs.");
  }

  const primary = tripToSnap(data.trip, waypoints, costing);
  const alternates = (data.alternates ?? [])
    .map((a) => (a?.trip?.legs?.length ? tripToSnap(a.trip, waypoints, costing) : null))
    .filter((s): s is RouteSnapResult => s !== null);

  return { primary, alternates };
}

function tripToSnap(
  trip: ValhallaTrip,
  waypoints: Waypoint[],
  costing: Costing,
): RouteSnapResult {
  // Concatenate per-leg shapes into a single decoded polyline. Each leg's
  // shape begins with the leg's start point; the start point of leg N+1
  // duplicates the end point of leg N, so we drop that duplicate.
  const decoded: LngLat[] = [];
  for (let i = 0; i < trip.legs.length; i++) {
    const legCoords = decodePolyline(trip.legs[i].shape);
    if (i === 0) decoded.push(...legCoords);
    else decoded.push(...legCoords.slice(1));
  }
  const polyline = encodePolyline(decoded);
  const maneuvers = collectManeuvers(trip.legs, waypoints.length);
  const hasFerry = detectFerry(trip.legs);
  return {
    polyline,
    decoded,
    distance_m: trip.summary.length * 1000,
    duration_s: trip.summary.time,
    maneuvers,
    hasFerry,
    engine: "valhalla",
    costing,
    computed_at: Date.now(),
  };
}

function collectManeuvers(
  legs: ValhallaLeg[],
  waypointCount: number,
): ManeuverStep[] {
  const out: ManeuverStep[] = [];
  for (let legIdx = 0; legIdx < legs.length; legIdx++) {
    const leg = legs[legIdx];
    if (!leg.maneuvers) continue;
    const waypoint_index = Math.min(legIdx, Math.max(0, waypointCount - 1));
    for (const m of leg.maneuvers) {
      if (!m.instruction) continue;
      out.push({
        instruction: m.instruction,
        distance_m: (m.length ?? 0) * 1000,
        waypoint_index,
      });
    }
  }
  return out;
}

function detectFerry(legs: ValhallaLeg[]): boolean {
  for (const leg of legs) {
    if (!leg.maneuvers) continue;
    for (const m of leg.maneuvers) {
      if (m.travel_type === "ferry") return true;
      if (m.travel_mode === "transit") return true;
    }
  }
  return false;
}
