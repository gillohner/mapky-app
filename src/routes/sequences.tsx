import { createFileRoute } from "@tanstack/react-router";
import { SequenceList } from "@/components/capture/SequenceList";

export const Route = createFileRoute("/sequences")({
  component: SequenceList,
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab?: "mine" | "viewport" } => ({
    tab:
      search.tab === "mine" || search.tab === "viewport"
        ? search.tab
        : undefined,
  }),
});
