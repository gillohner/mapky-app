import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import wasm from "vite-plugin-wasm";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  plugins: [
    TanStackRouterVite({ routesDirectory: "./src/routes" }),
    react(),
    tailwindcss(),
    wasm(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      // Keep our hand-authored public/manifest.json as the source of
      // truth — the plugin would otherwise emit its own
      // manifest.webmanifest and we'd have to keep them in sync.
      manifest: false,
      includeAssets: ["favicon.svg", "icons.svg", "manifest.json"],
      workbox: {
        // Vendor chunks (pubky SDK, maplibre) are large — raise the
        // per-file cap so they land in the precache instead of being
        // skipped (Workbox default is 2 MB).
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,svg,woff,woff2,ttf,png,webp}"],
        // TanStack Router rewrites all paths to index.html — without
        // a navigateFallback the SW would 404 on deep links offline.
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [
          /^\/v0\//,
          /^\/static\//,
          /^\/nominatim\//,
          /^\/valhalla\//,
        ],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          // Protomaps hosted tiles — `/tiles/v4/{z}/{x}/{y}.mvt`
          // (the actual URL the TileJSON declares). One cache entry
          // per tile, so a country pre-warm doesn't thrash itself.
          // The offline `mapky-tile` protocol writes its own copy
          // into IDB; this SW cache is the secondary buffer for
          // ad-hoc panning past pre-warmed regions.
          {
            urlPattern: ({ url }) =>
              url.hostname === "api.protomaps.com" &&
              /\/tiles\/v\d+\/\d+\/\d+\/\d+(\.[a-z]+)?$/.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "protomaps-tiles",
              cacheableResponse: { statuses: [0, 200] },
              expiration: {
                maxEntries: 100_000,
                maxAgeSeconds: 60 * 60 * 24 * 90,
              },
            },
          },
          {
            urlPattern: ({ url }) =>
              url.hostname === "api.protomaps.com" &&
              url.pathname.endsWith(".json"),
            handler: "StaleWhileRevalidate",
            options: { cacheName: "protomaps-meta" },
          },
          {
            urlPattern: ({ url }) =>
              url.hostname === "protomaps.github.io",
            handler: "CacheFirst",
            options: {
              cacheName: "map-assets",
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Raster overlays (Esri imagery, CyclOSM, OpenRailwayMap,
          // Terrarium DEM). All are {z}/{x}/{y} PNGs; cap entries to
          // keep storage bounded.
          {
            urlPattern: ({ url }) =>
              url.hostname === "server.arcgisonline.com" ||
              url.hostname.endsWith(".tiles.openrailwaymap.org") ||
              url.hostname.endsWith(".tile-cyclosm.openstreetmap.fr") ||
              (url.hostname === "s3.amazonaws.com" &&
                url.pathname.startsWith("/elevation-tiles-prod/")),
            handler: "CacheFirst",
            options: {
              cacheName: "raster-tiles",
              expiration: {
                maxEntries: 2000,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Nexus API. Network-first so fresh data wins when online;
          // falls back to cache when offline or slow. Matches both
          // same-origin (dev proxy) and cross-origin (prod nexus URL).
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/v0/"),
            handler: "NetworkFirst",
            options: {
              cacheName: "nexus-api",
              networkTimeoutSeconds: 4,
              expiration: {
                maxEntries: 1000,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Pubky gateway media (`/static/files`, `/static/avatar`).
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/static/"),
            handler: "CacheFirst",
            options: {
              cacheName: "pubky-media",
              expiration: {
                maxEntries: 1000,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        // Default off — the SW would interfere with HMR and shadow
        // the Vite proxy. Flip locally when smoke-testing offline.
        enabled: false,
        type: "module",
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Manual chunk splitting. Goal: keep the app shell (the JS that
    // gates the first paint) small, ship heavy + stable vendor libs
    // as their own long-lived chunks the browser can cache across
    // deploys, and let dynamic imports (sphere viewer, future route
    // splits) form their own bundles automatically.
    //
    // Bumping the warn limit because the pubky SDK chunk is genuinely
    // large (WASM + crypto) and isn't something we can split further.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;

          // Map stack — maplibre + tile loaders. Loaded on first paint
          // (the map mounts in __root.tsx), but stable across deploys
          // so the browser caches it once and reuses for every visit.
          if (
            id.includes("maplibre-gl") ||
            id.includes("pmtiles") ||
            id.includes("@protomaps/")
          ) {
            return "vendor-map";
          }

          // 360°/video sphere viewer — only loaded when the capture
          // detail panel mounts (SphereViewer dynamically imports
          // these). Force them into their own chunk so the home page
          // never pulls them.
          if (id.includes("@photo-sphere-viewer/")) {
            return "vendor-sphere";
          }

          // Pubky SDK ships a Rust→WASM blob plus crypto — single
          // biggest dependency, but it's its own pre-existing chunk
          // so we mostly need to keep it from getting bundled into
          // the main app code.
          if (id.includes("@synonymdev/pubky") || id.includes("pkarr")) {
            return "vendor-pubky";
          }

          // TanStack family — Query + Router are used everywhere but
          // upgrade together, so co-locating them avoids dep dupes
          // across multiple chunks.
          if (id.includes("@tanstack/")) {
            return "vendor-tanstack";
          }

          // React core — pinned together so chunks don't accidentally
          // pull two copies of react/jsx-runtime.
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/scheduler/")
          ) {
            return "vendor-react";
          }

          // Crypto / hashing helpers used by the auth / pubky paths.
          if (id.includes("blake3") || id.includes("/qrcode")) {
            return "vendor-crypto";
          }

          // Everything else from node_modules → a small misc bucket.
          // Kept separate from the app code so vendor lib upgrades
          // don't bust the app chunk's cache hash.
          return "vendor-misc";
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/v0": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/static": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/nominatim": {
        target: "https://nominatim.openstreetmap.org",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/nominatim/, ""),
        headers: { "User-Agent": "Mapky/1.0 (https://mapky.app)" },
      },
      // Valhalla FOSSGIS sends CORS headers on 200 but NOT on 429 / 4xx,
      // which surfaces as "NetworkError" in the browser when rate-limited.
      // Proxying through the dev server makes everything same-origin so
      // we always get the body (including the friendly error_code we map
      // to user-facing messages). For production, terminate this at a
      // real reverse proxy or self-host Valhalla.
      "/valhalla": {
        target: "https://valhalla1.openstreetmap.de",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/valhalla/, ""),
      },
    },
  },
});
