import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import wasm from "vite-plugin-wasm";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import path from "path";

export default defineConfig({
  plugins: [
    TanStackRouterVite({ routesDirectory: "./src/routes" }),
    react(),
    tailwindcss(),
    wasm(),
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
