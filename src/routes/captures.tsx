import { createFileRoute } from "@tanstack/react-router";
import { CaptureList } from "@/components/capture/CaptureList";

export const Route = createFileRoute("/captures")({
  component: CaptureList,
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab?: "mine" | "viewport" } => ({
    tab:
      search.tab === "mine" || search.tab === "viewport"
        ? search.tab
        : undefined,
  }),
});
