import { createFileRoute } from "@tanstack/react-router";
import { CollectionList } from "@/components/collection/CollectionList";

export const Route = createFileRoute("/collections")({
  component: CollectionsRoute,
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab?: "mine" | "viewport" } => ({
    tab:
      search.tab === "mine" || search.tab === "viewport"
        ? search.tab
        : undefined,
  }),
});

function CollectionsRoute() {
  return <CollectionList />;
}
