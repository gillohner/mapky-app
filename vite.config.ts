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
