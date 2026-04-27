import { createFileRoute } from "@tanstack/react-router";
import { RouteDetailPanel } from "@/components/route/RouteDetailPanel";
import { MobileMenuTrigger } from "@/components/sidebar/MobileMenuTrigger";

export const Route = createFileRoute("/route/$authorId/$routeId")({
  component: RouteDetailRoute,
});

function RouteDetailRoute() {
  const { authorId, routeId } = Route.useParams();
  return (
    <>
      <MobileMenuTrigger />
      <RouteDetailPanel authorId={authorId} routeId={routeId} />
    </>
  );
}
