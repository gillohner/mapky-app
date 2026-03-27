import { createRoot } from "react-dom/client";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import "@/styles/app.css";

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Apply persisted theme on load
const storedTheme = (() => {
  try {
    const data = localStorage.getItem("mapky-map");
    if (data) {
      const parsed = JSON.parse(data);
      return parsed?.state?.theme;
    }
  } catch {
    /* ignore */
  }
  return null;
})();

if (
  storedTheme === "dark" ||
  (!storedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches)
) {
  document.documentElement.classList.add("dark");
}

// No StrictMode — it double-mounts MapLibre, creating two WebGL contexts
// which exceeds browser limits and causes "WebGL context was lost"
createRoot(document.getElementById("root")!).render(
  <RouterProvider router={router} />,
);
