import { Workbox } from "workbox-window";

/**
 * Register the Workbox-generated service worker.
 *
 * vite-plugin-pwa emits `sw.js` at the site root in production builds.
 * In dev (`devOptions.enabled: false`) the file does not exist, so we
 * skip registration to avoid 404 noise during `npm run dev`.
 *
 * registerType: "autoUpdate" in vite.config.ts means a new SW
 * activates automatically on the next page load — no prompt UI yet.
 */
export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  if (import.meta.env.DEV) return;

  const wb = new Workbox("/sw.js");

  wb.addEventListener("waiting", () => {
    // skipWaiting: true is set in workbox config, so a waiting SW
    // is rare. Log it so we notice if the lifecycle stalls.
    if (import.meta.env.DEV) {
      console.info("[pwa] new service worker is waiting");
    }
  });

  wb.register().catch((err) => {
    console.warn("[pwa] service worker registration failed", err);
  });
}
