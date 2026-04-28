import { createFileRoute } from "@tanstack/react-router";
import { SearchPanel } from "@/components/search/SearchPanel";

export const Route = createFileRoute("/search")({
  component: SearchRoute,
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    q?: string;
    mode?: "places" | "tags";
  } => ({
    q: search.q ? String(search.q) : undefined,
    mode: search.mode === "tags" ? "tags" : "places",
  }),
});

function SearchRoute() {
  const { q, mode } = Route.useSearch();

  return (
    <>
      <SearchPanel query={q ?? ""} mode={mode ?? "places"} />
    </>
  );
}
