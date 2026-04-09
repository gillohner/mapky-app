import { createFileRoute } from "@tanstack/react-router";
import { CollectionList } from "@/components/collection/CollectionList";
import { MobileMenuTrigger } from "@/components/sidebar/MobileMenuTrigger";

export const Route = createFileRoute("/collections")({
  component: CollectionsRoute,
});

function CollectionsRoute() {
  return (
    <>
      <MobileMenuTrigger />
      <CollectionList />
    </>
  );
}
