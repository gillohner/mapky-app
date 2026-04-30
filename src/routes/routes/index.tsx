import { createFileRoute } from "@tanstack/react-router";
import { RouteList } from "@/components/route/RouteList";

export const Route = createFileRoute("/routes/")({
  component: RoutesIndexRoute,
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab?: "mine" | "viewport" } => ({
    tab:
      search.tab === "mine" || search.tab === "viewport"
        ? search.tab
        : undefined,
  }),
});

function RoutesIndexRoute() {
  return <RouteList />;
}
