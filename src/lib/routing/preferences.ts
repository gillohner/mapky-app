import type { Costing } from "./types";

/**
 * User-toggleable routing constraints. Mapped onto Valhalla's
 * `costing_options` per-mode parameters.
 *
 * `null` means "use the smart default for this mode" — the user hasn't
 * touched the toggle. `true` / `false` are explicit overrides.
 */
export interface RoutingPreferences {
  avoidFerries: boolean | null;
  avoidTolls: boolean | null;
  avoidHighways: boolean | null;
}

export function emptyPreferences(): RoutingPreferences {
  return {
    avoidFerries: null,
    avoidTolls: null,
    avoidHighways: null,
  };
}

/**
 * Sensible defaults per mode. Foot modes ban ferries (you can't really
 * step onto a ferry mid-stride), bikes default to avoiding tolls and
 * highways, drivers tolerate both. Users can override via UI toggles.
 */
const DEFAULTS: Record<Costing, Required<{ [K in keyof RoutingPreferences]: boolean }>> = {
  pedestrian: {
    avoidFerries: true,
    avoidTolls: false,
    avoidHighways: false,
  },
  bicycle: {
    avoidFerries: false,
    avoidTolls: true,
    avoidHighways: true,
  },
  auto: {
    avoidFerries: false,
    avoidTolls: false,
    avoidHighways: false,
  },
};

/** Resolve user prefs against mode defaults — null fields fall back. */
export function effectivePreferences(
  costing: Costing,
  prefs: RoutingPreferences,
): { avoidFerries: boolean; avoidTolls: boolean; avoidHighways: boolean } {
  const d = DEFAULTS[costing];
  return {
    avoidFerries: prefs.avoidFerries ?? d.avoidFerries,
    avoidTolls: prefs.avoidTolls ?? d.avoidTolls,
    avoidHighways: prefs.avoidHighways ?? d.avoidHighways,
  };
}

/**
 * Build the `costing_options.{costing}` block for a Valhalla request.
 *
 * Valhalla's *use_X* options are 0..1 weights, not booleans. 0 means
 * "avoid", 0.5 is neutral (the engine default), 1 means "prefer".
 * Translating booleans:
 *   true  (avoid) → 0
 *   false (allow) → 0.5  (Valhalla's neutral default)
 *
 * Some options aren't available on every costing. We only emit the keys
 * Valhalla supports for the given mode, so the request body stays small
 * and predictable.
 */
export function buildCostingOptions(
  costing: Costing,
  prefs: RoutingPreferences,
): Record<string, number> {
  const eff = effectivePreferences(costing, prefs);
  const opts: Record<string, number> = {};

  // use_ferry — supported by all three costings.
  opts.use_ferry = eff.avoidFerries ? 0 : 0.5;

  // use_tolls + use_highways — auto + bicycle only. Pedestrian doesn't
  // weight either of these.
  if (costing !== "pedestrian") {
    opts.use_tolls = eff.avoidTolls ? 0 : 0.5;
    opts.use_highways = eff.avoidHighways ? 0 : 1;
  }

  return opts;
}

/**
 * Map a Valhalla error code to a user-friendly message + an optional
 * actionable hint. Codes from Valhalla docs:
 * https://valhalla.github.io/valhalla/api/turn-by-turn/api-reference/#error-codes
 */
export function friendlyValhallaError(
  code: number | undefined,
  costing: Costing,
  raw: string,
): { message: string; hint?: string } {
  switch (code) {
    case 154:
      return {
        message: "Route is too long for this travel mode.",
        hint:
          costing === "pedestrian"
            ? "Walking and hiking are capped at ~200 km. Try driving, biking, or splitting it into shorter segments."
            : costing === "bicycle"
              ? "Cycling is capped at ~500 km. Try driving or pick closer points."
              : "Try picking closer waypoints or splitting into segments.",
      };
    case 171:
    case 172:
      return {
        message: "No road found near one of the waypoints.",
        hint: "Move the pin to a place reachable by road or path.",
      };
    case 442:
    case 443:
      return {
        message: "One of the points is outside the supported map area.",
      };
    case 167:
    case 168:
      return {
        message: "Couldn't find a route between these waypoints.",
        hint:
          "Try a different mode of travel, or pick points connected by " +
          "roads/paths.",
      };
    case 156:
      return { message: "One of the locations couldn't be matched to a road." };
    default: {
      // Avoid leaking the raw JSON — strip any obvious noise.
      const trimmed = raw.length > 200 ? raw.slice(0, 200) + "…" : raw;
      return {
        message: "Routing failed.",
        hint: trimmed.includes("error")
          ? trimmed.replace(/^.*"error":"([^"]+)".*$/, "$1")
          : undefined,
      };
    }
  }
}

/**
 * Parse the JSON body Valhalla returns on error. Looks for `error_code`
 * and `error` fields. Returns null if the body isn't JSON.
 */
export function parseValhallaError(
  raw: string,
): { code?: number; error?: string } | null {
  try {
    const j = JSON.parse(raw);
    if (typeof j === "object" && j) {
      return {
        code: typeof j.error_code === "number" ? j.error_code : undefined,
        error: typeof j.error === "string" ? j.error : undefined,
      };
    }
  } catch {
    // not JSON — fall through
  }
  return null;
}
