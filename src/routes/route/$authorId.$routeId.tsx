import { createFileRoute } from "@tanstack/react-router";
import { RouteDetailPanel } from "@/components/route/RouteDetailPanel";

export const Route = createFileRoute("/route/$authorId/$routeId")({
  component: RouteDetailRoute,
});

function RouteDetailRoute() {
  const { authorId, routeId } = Route.useParams();
  return (
    <>
      <RouteDetailPanel authorId={authorId} routeId={routeId} />
    </>
  );
}
