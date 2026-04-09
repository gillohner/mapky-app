import { createFileRoute } from "@tanstack/react-router";
import { CollectionPanel } from "@/components/collection/CollectionPanel";
import { MobileMenuTrigger } from "@/components/sidebar/MobileMenuTrigger";

export const Route = createFileRoute("/collection/$authorId/$collectionId")({
  component: CollectionDetailRoute,
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    fromSearchQuery?: string;
    fromSearchMode?: string;
    fromPlaceType?: string;
    fromPlaceId?: number;
  } => ({
    fromSearchQuery: search.fromSearchQuery ? String(search.fromSearchQuery) : undefined,
    fromSearchMode: search.fromSearchMode ? String(search.fromSearchMode) : undefined,
    fromPlaceType: search.fromPlaceType ? String(search.fromPlaceType) : undefined,
    fromPlaceId: search.fromPlaceId ? Number(search.fromPlaceId) : undefined,
  }),
});

function CollectionDetailRoute() {
  const { authorId, collectionId } = Route.useParams();
  const { fromSearchQuery, fromSearchMode, fromPlaceType, fromPlaceId } = Route.useSearch();

  return (
    <>
      <MobileMenuTrigger />
      <CollectionPanel
        authorId={authorId}
        collectionId={collectionId}
        fromSearchQuery={fromSearchQuery}
        fromSearchMode={fromSearchMode}
        fromPlaceType={fromPlaceType}
        fromPlaceId={fromPlaceId}
      />
    </>
  );
}
