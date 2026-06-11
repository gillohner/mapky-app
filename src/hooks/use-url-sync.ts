import { useEffect } from "react";
import { useUiStore } from "@/stores/ui-store";
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  useMapStore,
} from "@/stores/map-store";
import { PLACE_ACTIVITIES, type PlaceActivity } from "@/types/mapky";

/**
 * Bidirectional sync between layer/view state and URL search params,
 * so users can share or bookmark a specific layer/basemap/view.
 *
 * - At module load: read params and write them into the stores. Done
 *   synchronously so MapView's init effect picks up the hydrated
 *   center/zoom on first mount.
 * - Hook: reactively writes differences-from-default back to the URL
 *   via replaceState — no history entries, no route changes. Defaults
 *   produce a clean URL.
 *
 * Param keys (set only when non-default):
 *   th  theme (light|dark) — only set if differs from system preference
 *   bm  basemap (default|terrain|cycling|satellite)
 *   sl  satellite labels       (0 to hide; default visible when satellite)
 *   pl  places layer       (0 to hide; default visible)
 *   ca  captures layer     (0 to hide; default visible)
 *   mt  metro overlay      (1 to show)
 *   bo  BTC overlay        (1 to show — BTCMap merchants, sibling overlay)
 *   pa  place activity OR  (csv of `tagged|reviewed|posted|collected`)
 *   pr  min rating floor   (0.5–5.0)
 *   b3  3D buildings       (1 to show)
 *   z   zoom level
 *   c   center as "lat,lon"
 */
function hydrateFromUrl() {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const ui = useUiStore.getState();
  const m = useMapStore.getState();

  const th = params.get("th");
  if (th === "light" || th === "dark") {
    m.setTheme(th);
    document.documentElement.classList.toggle("dark", th === "dark");
  }

  const bm = params.get("bm");
  if (
    bm === "default" ||
    bm === "satellite" ||
    bm === "terrain" ||
    bm === "cycling"
  ) {
    m.setBasemap(bm);
  }

  if (params.get("sl") === "0") m.setSatelliteLabels(false);

  if (params.get("mt") === "1") ui.setMetroOverlayVisible(true);
  if (params.get("bo") === "1") ui.setBtcOverlayVisible(true);
  if (params.get("b3") === "1") ui.setBuildings3DVisible(true);

  // Place activity OR set — comma-separated tokens; unknown tokens
  // are ignored so a stale shared link from a future schema doesn't
  // crash hydration.
  //
  // This is a *replace* not a *toggle* — hydrate runs at module load
  // *after* Zustand persist has rehydrated from localStorage, so a URL
  // matching the persisted state would otherwise toggle the bit OFF.
  // We compose the URL set + persisted set explicitly via toggle so
  // hydration converges on `pa` regardless of what was persisted.
  const pa = params.get("pa");
  if (pa) {
    const known = new Set<PlaceActivity>(PLACE_ACTIVITIES);
    const fromUrl = new Set<PlaceActivity>();
    for (const tok of pa.split(",").map((t) => t.trim())) {
      if (known.has(tok as PlaceActivity)) {
        fromUrl.add(tok as PlaceActivity);
      }
    }
    const current = new Set(ui.placesFilters.activities);
    // Toggle on anything URL has that store doesn't, off anything store has that URL doesn't.
    for (const a of fromUrl) {
      if (!current.has(a)) ui.togglePlaceActivity(a);
    }
    for (const a of current) {
      if (!fromUrl.has(a)) ui.togglePlaceActivity(a);
    }
  }

  // Min-rating floor. Only override persisted state when the URL
  // explicitly carries a `pr` value — absence is "user opened app
  // normally", presence is "shared link wants this rating".
  const prRaw = params.get("pr");
  if (prRaw !== null) {
    const pr = parseFloat(prRaw);
    if (Number.isFinite(pr) && pr > 0) ui.setMinRating(pr);
    else ui.setMinRating(undefined);
  }

  const z = parseFloat(params.get("z") ?? "");
  const c = params.get("c");
  if (!Number.isNaN(z) && c) {
    const [latStr, lonStr] = c.split(",");
    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);
    if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
      m.setView([lon, lat], z);
    }
  }
}

hydrateFromUrl();

/**
 * popstate (browser back/forward) handler — re-reads the URL's c/z
 * params and asks MapLibre to flyTo them smoothly. This is what makes
 * /collection/$id → back → /collections feel cohesive: the user's
 * pre-click viewport is captured in the /collections URL via the
 * store→URL effect, so popping back can restore it.
 */
function applyUrlViewportSmoothly() {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const z = parseFloat(params.get("z") ?? "");
  const c = params.get("c");
  if (Number.isNaN(z) || !c) return;
  const [latStr, lonStr] = c.split(",");
  const lat = parseFloat(latStr);
  const lon = parseFloat(lonStr);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return;
  const map = useMapStore.getState().map;
  if (map) {
    map.flyTo({ center: [lon, lat], zoom: z, duration: 700 });
  } else {
    // Map not ready yet (rare on popstate, but happens during HMR).
    useMapStore.getState().setView([lon, lat], z);
  }
}

export function useUrlSync() {
  const metroOverlayVisible = useUiStore((s) => s.metroOverlayVisible);
  const btcOverlayVisible = useUiStore((s) => s.btcOverlayVisible);
  const placesFilters = useUiStore((s) => s.placesFilters);
  const buildings3DVisible = useUiStore((s) => s.buildings3DVisible);

  const theme = useMapStore((s) => s.theme);
  const basemap = useMapStore((s) => s.basemap);
  const satelliteLabels = useMapStore((s) => s.satelliteLabels);
  const center = useMapStore((s) => s.center);
  const zoom = useMapStore((s) => s.zoom);

  // Hook into browser back/forward so the map smoothly returns to the
  // viewport that was in the URL at that history entry. replaceState
  // (used by the store→URL effect below) doesn't fire popstate, so
  // there's no infinite loop with our own writes.
  useEffect(() => {
    const onPop = () => applyUrlViewportSmoothly();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const sysTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
    setOrDelete(params, "th", theme !== sysTheme ? theme : null);
    setOrDelete(params, "bm", basemap !== "default" ? basemap : null);
    setOrDelete(
      params,
      "sl",
      basemap === "satellite" && !satelliteLabels ? "0" : null,
    );

    setOrDelete(params, "mt", metroOverlayVisible ? "1" : null);
    setOrDelete(params, "bo", btcOverlayVisible ? "1" : null);
    // Place activities — emit a sorted comma-separated list when any
    // are active; absent param means "no narrowing".
    setOrDelete(
      params,
      "pa",
      placesFilters.activities.length > 0
        ? [...placesFilters.activities].sort().join(",")
        : null,
    );
    // Min rating — emit only when above zero.
    setOrDelete(
      params,
      "pr",
      placesFilters.minRating && placesFilters.minRating > 0
        ? placesFilters.minRating.toString()
        : null,
    );
    setOrDelete(params, "b3", buildings3DVisible ? "1" : null);

    const isDefaultViewport =
      Math.abs(zoom - DEFAULT_MAP_ZOOM) < 0.005 &&
      Math.abs(center[0] - DEFAULT_MAP_CENTER[0]) < 0.00001 &&
      Math.abs(center[1] - DEFAULT_MAP_CENTER[1]) < 0.00001;

    setOrDelete(params, "z", isDefaultViewport ? null : zoom.toFixed(2));
    setOrDelete(
      params,
      "c",
      isDefaultViewport
        ? null
        : `${center[1].toFixed(5)},${center[0].toFixed(5)}`,
    );

    const search = params.toString();
    const newPathSearch =
      window.location.pathname + (search ? `?${search}` : "");
    const current = window.location.pathname + window.location.search;
    if (newPathSearch !== current) {
      window.history.replaceState(
        window.history.state,
        "",
        newPathSearch + window.location.hash,
      );
    }
  }, [
    metroOverlayVisible,
    btcOverlayVisible,
    placesFilters,
    buildings3DVisible,
    theme,
    basemap,
    satelliteLabels,
    center,
    zoom,
  ]);
}

function setOrDelete(
  params: URLSearchParams,
  key: string,
  value: string | null,
) {
  if (value === null) params.delete(key);
  else params.set(key, value);
}
