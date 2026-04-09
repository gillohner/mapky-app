import { createFileRoute } from "@tanstack/react-router";
import { PlacePanel } from "@/components/place/PlacePanel";
import { MobileMenuTrigger } from "@/components/sidebar/MobileMenuTrigger";

export const Route = createFileRoute("/place/$osmType/$osmId")({
  component: PlaceDetailRoute,
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    lat?: number;
    lon?: number;
    name?: string;
    kind?: string;
    from?: string;
    fromAuthor?: string;
    fromCollection?: string;
    fromSearchQuery?: string;
    fromSearchMode?: string;
  } => ({
    lat: search.lat ? Number(search.lat) : undefined,
    lon: search.lon ? Number(search.lon) : undefined,
    name: search.name ? String(search.name) : undefined,
    kind: search.kind ? String(search.kind) : undefined,
    from: search.from ? String(search.from) : undefined,
    fromAuthor: search.fromAuthor ? String(search.fromAuthor) : undefined,
    fromCollection: search.fromCollection ? String(search.fromCollection) : undefined,
    fromSearchQuery: search.fromSearchQuery ? String(search.fromSearchQuery) : undefined,
    fromSearchMode: search.fromSearchMode ? String(search.fromSearchMode) : undefined,
  }),
});

function PlaceDetailRoute() {
  const { osmType, osmId } = Route.useParams();
  const { lat, lon, name, kind, from, fromAuthor, fromCollection, fromSearchQuery, fromSearchMode } = Route.useSearch();

  return (
    <>
      <MobileMenuTrigger />
      <PlacePanel
        osmType={osmType}
        osmId={Number(osmId)}
        fallbackLat={lat}
        fallbackLon={lon}
        tileName={name}
        tileKind={kind}
        fromCollection={from === "collection" ? fromCollection : undefined}
        fromAuthor={from === "collection" ? fromAuthor : undefined}
        fromSearchQuery={from === "search" ? fromSearchQuery : undefined}
        fromSearchMode={from === "search" ? fromSearchMode : undefined}
      />
    </>
  );
}
