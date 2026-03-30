import { createFileRoute } from "@tanstack/react-router";
import { PlacePanel } from "@/components/place/PlacePanel";
import { MobileMenuTrigger } from "@/components/sidebar/MobileMenuTrigger";

export const Route = createFileRoute("/place/$osmType/$osmId")({
  component: PlaceDetailRoute,
  validateSearch: (
    search: Record<string, unknown>,
  ): { lat?: number; lon?: number; name?: string; kind?: string } => ({
    lat: search.lat ? Number(search.lat) : undefined,
    lon: search.lon ? Number(search.lon) : undefined,
    name: search.name ? String(search.name) : undefined,
    kind: search.kind ? String(search.kind) : undefined,
  }),
});

function PlaceDetailRoute() {
  const { osmType, osmId } = Route.useParams();
  const { lat, lon, name, kind } = Route.useSearch();

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
      />
    </>
  );
}
