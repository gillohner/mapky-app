import { createFileRoute } from "@tanstack/react-router";
import { MobileMenuTrigger } from "@/components/sidebar/MobileMenuTrigger";

export const Route = createFileRoute("/")({
  component: MapHUD,
});

function MapHUD() {
  return <MobileMenuTrigger />;
}
