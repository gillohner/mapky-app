import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: MapHUD,
});

function MapHUD() {
  return null;
}
