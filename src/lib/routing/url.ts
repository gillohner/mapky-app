import type { WaypointSlot } from "@/stores/route-creation-store";
import type { RouteActivity } from "@/types/mapky";

/**
 * Slot encoding for URL params:
 *   "gps"                       → unresolved "Your location" intent
 *   "47.37,8.55"                → bare lat,lon (kind: coords or gps)
 *   "47.37,8.55@way:135207248"  → place anchored to an OSM element
 *
 * Coordinates are clamped to 6 decimals so URLs stay short (~10 cm
 * precision, well below what Valhalla's polyline rendering needs). GPS
 * slots are serialized as their actual coordinates rather than the
 * literal "gps" token: this loses the "this came from GPS" semantics
 * across reload, but preserves the user's real location and gives shared
 * links a concrete origin instead of asking the recipient for their own
 * GPS permission. The literal "gps" token is still parsed for
 * forward-compatibility / explicit author intent.
 */
export function slotToParam(slot: WaypointSlot): string | null {
  if (slot.kind === "empty") return null;
  const base = `${slot.lat.toFixed(6)},${slot.lon.toFixed(6)}`;
  if (slot.kind === "place") {
    return `${base}@${slot.osmType}:${slot.osmId}`;
  }
  // gps + coords both serialize as bare lat,lon.
  return base;
}

let _id = 0;
const newId = () => `slot-url-${++_id}-${Date.now()}`;

export function parseSlotParam(param: string): WaypointSlot {
  if (param === "gps") {
    // GPS without resolved coordinates can't be a complete slot. The
    // directions UI will treat empty + a side-effect to request location
    // at mount, but for serialization we keep the structure simple and
    // hand the user back an empty slot they can re-pick.
    return { kind: "empty", id: newId() };
  }
  // "lat,lon" optionally suffixed with "@osmType:osmId"
  const [coords, osmRef] = param.split("@");
  const [latStr, lonStr] = coords.split(",");
  const lat = Number(latStr);
  const lon = Number(lonStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { kind: "empty", id: newId() };
  }
  if (osmRef) {
    const [osmType, osmIdStr] = osmRef.split(":");
    const osmId = Number(osmIdStr);
    if (osmType && Number.isFinite(osmId)) {
      return {
        kind: "place",
        id: newId(),
        lat,
        lon,
        label: `${osmType}/${osmId}`,
        osmType,
        osmId,
      };
    }
  }
  return {
    kind: "coords",
    id: newId(),
    lat,
    lon,
    label: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
  };
}

export interface DirectionsSearchParams {
  from?: string;
  via?: string[];
  to?: string;
  mode?: RouteActivity;
}

const ACTIVITY_KEYS: RouteActivity[] = [
  "walking",
  "running",
  "hiking",
  "cycling",
  "driving",
  "skiing",
  "other",
];

export function isRouteActivity(s: string): s is RouteActivity {
  return (ACTIVITY_KEYS as string[]).includes(s);
}

/**
 * Build URL search params from current store state. Only emits non-empty
 * fields so the URL stays short (e.g. when the user only has a 'To' set).
 */
export function buildDirectionsSearch(
  slots: WaypointSlot[],
  activity: RouteActivity,
): DirectionsSearchParams {
  if (slots.length < 2) return { mode: activity };
  const fromSlot = slots[0];
  const toSlot = slots[slots.length - 1];
  const stops = slots.slice(1, -1);
  const search: DirectionsSearchParams = { mode: activity };
  const fromParam = slotToParam(fromSlot);
  const toParam = slotToParam(toSlot);
  if (fromParam) search.from = fromParam;
  if (toParam) search.to = toParam;
  const viaParams = stops
    .map((s) => slotToParam(s))
    .filter((s): s is string => s !== null);
  if (viaParams.length > 0) search.via = viaParams;
  return search;
}

/**
 * Hydrate store-shape slots from URL params. Always returns at least 2
 * slots (filling missing endpoints with empty placeholders).
 */
export function parseDirectionsSearch(
  search: DirectionsSearchParams,
): { slots: WaypointSlot[]; activity?: RouteActivity } {
  const slots: WaypointSlot[] = [];
  slots.push(
    search.from ? parseSlotParam(search.from) : { kind: "empty", id: newId() },
  );
  if (search.via && search.via.length > 0) {
    for (const v of search.via) slots.push(parseSlotParam(v));
  }
  slots.push(
    search.to ? parseSlotParam(search.to) : { kind: "empty", id: newId() },
  );
  return {
    slots,
    activity:
      search.mode && isRouteActivity(search.mode) ? search.mode : undefined,
  };
}
