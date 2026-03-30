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
    },
  },
});
