import { createFileRoute } from "@tanstack/react-router";
import { IncidentDetailPanel } from "@/components/incident/IncidentDetailPanel";

export const Route = createFileRoute("/incident/$authorId/$incidentId")({
  component: IncidentDetailRoute,
});

function IncidentDetailRoute() {
  const { authorId, incidentId } = Route.useParams();
  return <IncidentDetailPanel authorId={authorId} incidentId={incidentId} />;
}
