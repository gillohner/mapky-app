import { useUiStore } from "@/stores/ui-store";
import { CollectionOverlay } from "./CollectionOverlay";

export function CollectionOverlays() {
  const overlays = useUiStore((s) => s.activeCollectionOverlays);

  return (
    <>
      {Array.from(overlays.values()).map((entry) => (
        <CollectionOverlay
          key={entry.collectionId}
          authorId={entry.authorId}
          collectionId={entry.collectionId}
          color={entry.color}
        />
      ))}
    </>
  );
}
