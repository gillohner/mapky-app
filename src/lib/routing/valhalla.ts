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
import axios from "axios";
import { nexusClient } from "@/lib/api/client";

// All Valhalla traffic flows through the pubky-nexus plugin's cached
// proxy at `/v0/mapky/routing/valhalla`. The plugin holds a 24 h Redis
// cache keyed by a content hash of the request body, so identical
// waypoint/costing pairs are served instantly without re-hitting the
// public Valhalla instance. Configure the upstream via
// `MAPKY_VALHALLA_URL` on the plugin side, not here.

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

  let data: ValhallaResponse;
  try {
    const response = await nexusClient.post<ValhallaResponse>(
      "/v0/mapky/routing/valhalla",
      body,
      { signal: opts.signal },
    );
    data = response.data;
  } catch (err) {
    if (axios.isCancel(err) || (err instanceof Error && err.name === "CanceledError")) {
      throw err;
    }
    if (axios.isAxiosError(err) && err.response) {
      const status = err.response.status;
      // The plugin forwards Valhalla's status verbatim on upstream
      // errors and wraps the body in `{ error }`. Pull the original
      // error text back out so `parseValhallaError` keeps working.
      const bodyData = err.response.data;
      const text =
        typeof bodyData === "string"
          ? bodyData
          : typeof bodyData?.error === "string"
            ? bodyData.error
            : JSON.stringify(bodyData ?? "");
      if (status === 429) {
        throw new RoutingError("Routing temporarily rate-limited.", {
          status: 429,
          hint: "The free Valhalla service throttles bursts. Wait a few seconds and try again, or simplify the route.",
        });
      }
      const parsed = parseValhallaError(text);
      const { message, hint } = friendlyValhallaError(
        parsed?.code,
        costing,
        text,
      );
      throw new RoutingError(message, {
        status,
        code: parsed?.code,
        hint,
      });
    }
    throw new RoutingError(
      err instanceof Error ? err.message : "Network error reaching Valhalla",
    );
  }

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
