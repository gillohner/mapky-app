import type { RouteActivityType } from "mapky-app-specs";

/** A point along a route, in [lon, lat] order to match GeoJSON / MapLibre. */
export type LngLat = [number, number];

export interface Waypoint {
  lat: number;
  lon: number;
  ele?: number | null;
  name?: string | null;
}

/** Engine-agnostic costing identifier; passes through to Valhalla today. */
export type Costing = "auto" | "bicycle" | "pedestrian";

export interface RouteSnapResult {
  /** Encoded polyline (Google polyline format, precision 6). */
  polyline: string;
  /** Decoded as [lon, lat][] for direct rendering as a GeoJSON LineString. */
  decoded: LngLat[];
  distance_m: number;
  duration_s: number;
  /** Optional elevation aggregates (Valhalla returns these per-leg). */
  elevation_gain_m?: number;
  elevation_loss_m?: number;
  /** Engine-supplied turn-by-turn maneuvers, if any. */
  maneuvers?: ManeuverStep[];
  /**
   * True if any leg contains a ferry / transit segment. We surface this in
   * the UI so the user notices when their route crosses water by boat —
   * Valhalla doesn't know which ferries actually run, so the route is
   * informational only.
   */
  hasFerry?: boolean;
  engine: "valhalla";
  costing: Costing;
  computed_at: number;
}

export interface ManeuverStep {
  instruction: string;
  distance_m: number;
  /** Index into the original waypoints array nearest to where this maneuver begins. */
  waypoint_index: number;
}

export type ActivityCosting = Record<RouteActivityType, Costing>;
