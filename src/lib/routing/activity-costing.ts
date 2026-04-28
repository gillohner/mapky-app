import { RouteActivityType } from "mapky-app-specs";
import type { Costing } from "./types";

/**
 * Per-activity routing profile. Each profile picks a Valhalla costing AND
 * a set of pedestrian-specific options that make the modes meaningfully
 * different — without these tweaks, Walk/Run/Hike all produce identical
 * routes and just label them differently, which is dishonest UX.
 *
 * Knobs we use (Valhalla docs: turn-by-turn / costing options):
 *  - walking_speed (km/h): affects ETA, not the path. Walk and Hike share
 *    a single 5 km/h baseline — a trail's slowness comes from its grade
 *    and surface, not the label the user picked, and Valhalla can't
 *    model that with a flat speed. Run is genuinely faster (~10 km/h).
 *  - max_hiking_difficulty (0–6, SAC scale): caps which trail grades the
 *    router will use. 1 = paved/easy paths only (Walk/Run), 6 = expert
 *    alpine (Hike). This is the meaningful Walk-vs-Hike differentiator.
 *  - walkway_factor (< 1 = more attractive): we lower it for Hike so the
 *    router prefers trails over roads when both options exist.
 */
export interface ActivityProfile {
  costing: Costing;
  /** Options merged into `costing_options.{costing}` on the Valhalla request. */
  options?: Record<string, number | boolean>;
}

const PROFILES: Partial<Record<RouteActivityType, ActivityProfile>> = {
  // Foot modes — all share `pedestrian` costing but differ in speed and
  // which trail grades they tolerate.
  [RouteActivityType.Walking]: {
    costing: "pedestrian",
    options: {
      walking_speed: 5,
      max_hiking_difficulty: 1,
      // Slightly penalise stairs and alleys for casual walks.
      step_penalty: 4,
    },
  },
  [RouteActivityType.Running]: {
    costing: "pedestrian",
    options: {
      walking_speed: 10,
      max_hiking_difficulty: 1,
      step_penalty: 8,
    },
  },
  [RouteActivityType.Hiking]: {
    costing: "pedestrian",
    options: {
      walking_speed: 5,
      // Allow expert alpine trails (T6 on the SAC scale).
      max_hiking_difficulty: 6,
      // Prefer trails over roads — lower walkway_factor = more attractive.
      walkway_factor: 0.7,
    },
  },
  // Skiing — Valhalla has no ski engine. We don't expose it in the UI; if
  // a legacy saved route comes through with activity=skiing we fall back
  // to walking semantics so the route renders, but it's lossy.
  [RouteActivityType.Skiing]: {
    costing: "pedestrian",
    options: {
      walking_speed: 4,
      max_hiking_difficulty: 6,
    },
  },
  [RouteActivityType.Cycling]: {
    costing: "bicycle",
  },
  [RouteActivityType.Driving]: {
    costing: "auto",
  },
  // Catch-all. Walk-equivalent.
  [RouteActivityType.Other]: {
    costing: "pedestrian",
  },
};

const FALLBACK: ActivityProfile = { costing: "pedestrian" };

export function profileForActivity(activity: RouteActivityType): ActivityProfile {
  return PROFILES[activity] ?? FALLBACK;
}

/**
 * Backwards-compatible helper — returns just the costing string.
 * Prefer `profileForActivity` for new callers that need the options too.
 */
export function costingForActivity(activity: RouteActivityType): Costing {
  return profileForActivity(activity).costing;
}
