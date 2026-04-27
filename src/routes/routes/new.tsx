import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRouteCreationStore } from "@/stores/route-creation-store";

export const Route = createFileRoute("/routes/new")({
  component: NewRouteRoute,
});

/**
 * Legacy entry point for "create a route". The directions UI is now mounted
 * at the root layout and triggered via the "Directions" button on places /
 * the IconRail / the routes list. This route just opens directions and
 * redirects to home so the URL stays clean.
 */
function NewRouteRoute() {
  const navigate = useNavigate();
  const open = useRouteCreationStore((s) => s.open);
  const mode = useRouteCreationStore((s) => s.mode);

  useEffect(() => {
    open(mode === "edit" ? "edit" : "create");
    navigate({ to: "/directions", replace: true });
  }, [open, mode, navigate]);

  return null;
}
