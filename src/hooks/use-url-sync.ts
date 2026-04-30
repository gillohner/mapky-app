import { useEffect } from "react";
import { useUiStore } from "@/stores/ui-store";
import { useMapStore } from "@/stores/map-store";

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
 *   bm  basemap (default|satellite)
 *   sl  satellite labels       (0 to hide; default visible when satellite)
 *   pl  places layer       (0 to hide; default visible)
 *   ca  captures layer     (0 to hide; default visible)
 *   mt  metro overlay      (1 to show)
 *   cy  cycling overlay    (1 to show)
 *   tr  terrain overlay    (1 to show)
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
  if (bm === "default" || bm === "satellite") m.setBasemap(bm);

  if (params.get("sl") === "0") m.setSatelliteLabels(false);

  if (params.get("mt") === "1") ui.setMetroOverlayVisible(true);
  if (params.get("cy") === "1") ui.setCyclingOverlayVisible(true);
  if (params.get("tr") === "1") ui.setTerrainOverlayVisible(true);
  if (params.get("b3") === "1") ui.setBuildings3DVisible(true);

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
  const cyclingOverlayVisible = useUiStore((s) => s.cyclingOverlayVisible);
  const terrainOverlayVisible = useUiStore((s) => s.terrainOverlayVisible);
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
    setOrDelete(params, "cy", cyclingOverlayVisible ? "1" : null);
    setOrDelete(params, "tr", terrainOverlayVisible ? "1" : null);
    setOrDelete(params, "b3", buildings3DVisible ? "1" : null);

    setOrDelete(params, "z", zoom.toFixed(2));
    setOrDelete(
      params,
      "c",
      `${center[1].toFixed(5)},${center[0].toFixed(5)}`,
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
    cyclingOverlayVisible,
    terrainOverlayVisible,
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
