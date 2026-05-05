import { useCallback, useEffect, useRef } from "react";
import type { CollectionOverlayEntry } from "@/stores/ui-store";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useCollection } from "@/lib/api/hooks";
import { useUiStore } from "@/stores/ui-store";
import { useAuth } from "@/components/auth/AuthProvider";
import { useAutoFocusLayer } from "@/hooks/use-auto-focus-layer";
import { useBackOr } from "@/hooks/use-back-or";
import { DiscoverSidebar } from "@/components/discover/DiscoverSidebar";
import { CollectionHeader } from "./CollectionHeader";
import { CollectionActions } from "./CollectionActions";
import { CollectionTags } from "./CollectionTags";
import { CollectionPlaces } from "./CollectionPlaces";
import { updateCollectionJson } from "@/lib/mapky-specs";
import { ingestUserIntoNexus } from "@/lib/nexus/ingest";
import { parseOsmCanonical } from "@/lib/map/osm-url";
import { toast } from "sonner";
import type { CollectionDetails } from "@/types/mapky";
import { ResourceDiscussion } from "@/components/posts/ResourceDiscussion";

interface CollectionPanelProps {
  authorId: string;
  collectionId: string;
  fromSearchQuery?: string;
  fromSearchMode?: string;
  fromPlaceType?: string;
  fromPlaceId?: number;
}

export function CollectionPanel({
  authorId,
  collectionId,
  fromSearchQuery,
  fromSearchMode,
  fromPlaceType,
  fromPlaceId,
}: CollectionPanelProps) {
  const navigate = useNavigate();
  const { session, publicKey } = useAuth();
  const queryClient = useQueryClient();
  const { data: collection, isLoading } = useCollection(authorId, collectionId);
  const addOverlay = useUiStore((s) => s.addCollectionOverlay);
  const isOwner = publicKey === authorId;

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["mapky", "collection", authorId, collectionId] });
    queryClient.invalidateQueries({ queryKey: ["mapky", "collections", "user", authorId] });
  }, [queryClient, authorId, collectionId]);

  const handleRemovePlace = useCallback(async (url: string) => {
    if (!session || !publicKey || !collection) return;
    const newItems = collection.items.filter((item) => item !== url);
    const removed = parseOsmCanonical(url);
    try {
      const json = updateCollectionJson(
        collection.name,
        collection.description ?? undefined,
        newItems,
        collection.image_uri ?? undefined,
        collection.color ?? undefined,
      );
      const path = `/pub/mapky.app/collections/${collectionId}`;
      await session.storage.putText(path as `/pub/${string}`, json);

      await Promise.all([
        queryClient.cancelQueries({ queryKey: ["mapky", "collection", publicKey, collectionId] }),
        queryClient.cancelQueries({ queryKey: ["mapky", "collections", "user", publicKey] }),
        removed && queryClient.cancelQueries({ queryKey: ["mapky", "collections", "place", removed.osmType, removed.osmId] }),
      ].filter(Boolean) as Promise<void>[]);

      queryClient.setQueryData<CollectionDetails>(
        ["mapky", "collection", publicKey, collectionId],
        (old) => old ? { ...old, items: newItems } : old,
      );
      queryClient.setQueryData<CollectionDetails[]>(
        ["mapky", "collections", "user", publicKey],
        (old) => old?.map((c) => {
          const [, id] = c.id.split(":");
          return id === collectionId ? { ...c, items: newItems } : c;
        }),
      );
      // Drop this collection from the per-place "in collection" list so
      // the bookmark indicator on the place panel updates immediately.
      if (removed) {
        queryClient.setQueryData<CollectionDetails[]>(
          ["mapky", "collections", "place", removed.osmType, removed.osmId],
          (old) => old?.filter((c) => {
            const [, id] = c.id.split(":");
            return id !== collectionId;
          }),
        );
      }

      toast.success("Place removed");
      ingestUserIntoNexus(publicKey).then(() => setTimeout(() => {
        invalidate();
        if (removed) {
          queryClient.invalidateQueries({ queryKey: ["mapky", "collections", "place", removed.osmType, removed.osmId] });
        }
      }, 5000));
    } catch (err) {
      console.error("Failed to remove place from collection:", err);
      toast.error("Failed to remove place");
    }
  }, [session, publicKey, collection, collectionId, queryClient, invalidate]);

  // Dim the always-on Mapky data layers so this collection's overlay
  // owns the visual focus.
  // Hide places + captures entirely — this collection's overlay owns
  // the map, same rule the collections list uses.
  useAutoFocusLayer("collections", { hide: true });

  // On mount: save the user's pinned overlays, swap to ONLY this
  // collection's overlay so the focused detail isn't visually competing
  // with everything else they had pinned. Restore on unmount.
  const savedOverlays = useRef<Map<string, CollectionOverlayEntry> | null>(null);
  useEffect(() => {
    const store = useUiStore.getState();
    savedOverlays.current = new Map(store.activeCollectionOverlays);
    store.clearAllCollectionOverlays();
    store.addCollectionOverlay(authorId, collectionId, collection?.color ?? undefined);

    return () => {
      const s = useUiStore.getState();
      s.clearAllCollectionOverlays();
      if (savedOverlays.current) {
        for (const entry of savedOverlays.current.values()) {
          s.addCollectionOverlay(entry.authorId, entry.collectionId, entry.color);
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorId, collectionId]);

  // Keep overlay forced on if color updates from API.
  useEffect(() => {
    if (collection?.color) {
      addOverlay(authorId, collectionId, collection.color);
    }
  }, [collection?.color, authorId, collectionId, addOverlay]);

  // Top-right X always closes the entire sidebar back to the map.
  const close = () => navigate({ to: "/" });

  // Top-left back arrow steps back through history. If the user came
  // from a place panel, search results, or the collections list, that
  // surface is one history pop away with its tab + scroll preserved.
  // The fallback covers deep links: pick the best parent based on the
  // back-context query params we received.
  const fallback = () => {
    if (fromPlaceType && fromPlaceId) {
      navigate({
        to: "/place/$osmType/$osmId",
        params: { osmType: fromPlaceType, osmId: String(fromPlaceId) },
      });
    } else if (fromSearchQuery) {
      navigate({
        to: "/search",
        search: {
          q: fromSearchQuery,
          mode: (fromSearchMode as "places" | "tags") ?? "places",
        },
      });
    } else {
      navigate({ to: "/collections" });
    }
  };
  const back = useBackOr(fallback);
  const backLabel = fromPlaceType
    ? "Place"
    : fromSearchQuery
      ? "Search results"
      : "Collections";

  return (
    <DiscoverSidebar
      title="Collection"
      onClose={close}
      onBack={back}
      backLabel={backLabel}
      mobileCollapsible
    >
      {isLoading ? (
        <LoadingSkeleton />
      ) : (
        <div className="space-y-4">
          <CollectionHeader collection={collection ?? undefined} authorId={authorId} />
          <div className="border-t border-border pt-4">
            <CollectionActions
              authorId={authorId}
              collectionId={collectionId}
              collection={collection ?? undefined}
            />
          </div>
          <CollectionTags authorId={authorId} collectionId={collectionId} />
          <div className="border-t border-border pt-4">
            <h3 className="mb-2 text-sm font-medium text-foreground">Places</h3>
            <CollectionPlaces
              items={collection?.items ?? []}
              authorId={authorId}
              collectionId={collectionId}
              isOwner={isOwner}
              onRemove={handleRemovePlace}
            />
          </div>
          <ResourceDiscussion
            resourceType="collections"
            authorId={authorId}
            resourceId={collectionId}
            parentPreview={collection?.name ?? "Collection"}
          />
        </div>
      )}
    </DiscoverSidebar>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-2">
      <div className="h-5 w-48 animate-pulse rounded bg-border" />
      <div className="h-4 w-32 animate-pulse rounded bg-border" />
      <div className="h-4 w-64 animate-pulse rounded bg-border" />
    </div>
  );
}
