import { createFileRoute } from "@tanstack/react-router";
import { CollectionPanel } from "@/components/collection/CollectionPanel";
import { MobileMenuTrigger } from "@/components/sidebar/MobileMenuTrigger";

export const Route = createFileRoute("/collection/$authorId/$collectionId")({
  component: CollectionDetailRoute,
});

function CollectionDetailRoute() {
  const { authorId, collectionId } = Route.useParams();

  return (
    <>
      <MobileMenuTrigger />
      <CollectionPanel authorId={authorId} collectionId={collectionId} />
    </>
  );
}
