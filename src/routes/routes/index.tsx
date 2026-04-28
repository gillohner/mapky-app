import { createFileRoute } from "@tanstack/react-router";
import { RouteList } from "@/components/route/RouteList";

export const Route = createFileRoute("/routes/")({
  component: RoutesIndexRoute,
});

function RoutesIndexRoute() {
  return (
    <>
      <RouteList />
    </>
  );
}
