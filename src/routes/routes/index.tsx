import { createFileRoute } from "@tanstack/react-router";
import { RouteList } from "@/components/route/RouteList";
import { MobileMenuTrigger } from "@/components/sidebar/MobileMenuTrigger";

export const Route = createFileRoute("/routes/")({
  component: RoutesIndexRoute,
});

function RoutesIndexRoute() {
  return (
    <>
      <MobileMenuTrigger />
      <RouteList />
    </>
  );
}
