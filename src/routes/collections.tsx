import { createFileRoute } from "@tanstack/react-router";
import { CollectionList } from "@/components/collection/CollectionList";

export const Route = createFileRoute("/collections")({
  component: CollectionsRoute,
});

function CollectionsRoute() {
  return (
    <>
      <CollectionList />
    </>
  );
}
