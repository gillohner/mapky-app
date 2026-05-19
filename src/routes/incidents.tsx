import { createFileRoute } from "@tanstack/react-router";
import { IncidentList } from "@/components/incident/IncidentList";

export const Route = createFileRoute("/incidents")({
  component: IncidentsRoute,
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab?: "mine" | "viewport" } => ({
    tab:
      search.tab === "mine" || search.tab === "viewport"
        ? search.tab
        : undefined,
  }),
});

function IncidentsRoute() {
  return <IncidentList />;
}
