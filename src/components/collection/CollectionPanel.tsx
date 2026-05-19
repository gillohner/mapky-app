import { useCallback, useEffect, useRef, useState } from "react";
import type { CollectionOverlayEntry } from "@/stores/ui-store";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useCollection } from "@/lib/api/hooks";
import { useUiStore } from "@/stores/ui-store";
import { useAuth } from "@/components/auth/AuthProvider";
import { useAutoFocusLayer } from "@/hooks/use-auto-focus-layer";
import { useBackOr } from "@/hooks/use-back-or";
import { useShareLink } from "@/lib/hooks/use-share-link";
import { DiscoverSidebar } from "@/components/discover/DiscoverSidebar";
import { PanelHeaderActions } from "@/components/shared/PanelHeaderActions";
import { CollectionHeader } from "./CollectionHeader";
import { CollectionActions, CollectionAddPlace } from "./CollectionActions";
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
  const [editMode, setEditMode] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const share = useShareLink({ kind: "collection", authorId, resourceId: collectionId });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["mapky", "collection", authorId, collectionId] });
    queryClient.invalidateQueries({ queryKey: ["mapky", "collections", "user", authorId] });
  }, [queryClient, authorId, collectionId]);

  const handleDelete = useCallback(async () => {
    if (!session || !collection) return;
    try {
      const path = `/pub/mapky.app/posts/${collectionId}`;
      await session.storage.delete(path as `/pub/${string}`);

      await queryClient.cancelQueries({ queryKey: ["mapky", "collections", "user", authorId] });
      await queryClient.cancelQueries({ queryKey: ["mapky", "collection", authorId, collectionId] });

      queryClient.setQueryData<CollectionDetails[]>(
        ["mapky", "collections", "user", authorId],
        (old) => old?.filter((c) => { const [, id] = c.id.split(":"); return id !== collectionId; }),
      );
      queryClient.removeQueries({ queryKey: ["mapky", "collection", authorId, collectionId] });

      toast.success("Collection deleted");
      navigate({ to: "/collections" });

      ingestUserIntoNexus(publicKey!).then(() => setTimeout(() => {
        invalidate();
      }, 5000));
    } catch {
      toast.error("Failed to delete");
    }
  }, [session, collection, collectionId, authorId, publicKey, queryClient, invalidate, navigate]);

  const handleRemovePlace = useCallback(async (url: string) => {
    if (!session || !publicKey || !collection) return;
    const newItems = collection.items.filter((item) => item !== url);
    const removed = parseOsmCanonical(url);
    try {
      const json = updateCollectionJson(
        collection.name,
        collection.description ?? undefined,
        newItems,
        collection.color ?? undefined,
      );
      const path = `/pub/mapky.app/posts/${collectionId}`;
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

  useAutoFocusLayer("collections", { hide: true });

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

  useEffect(() => {
    if (collection?.color) {
      addOverlay(authorId, collectionId, collection.color);
    }
  }, [collection?.color, authorId, collectionId, addOverlay]);

  const close = () => navigate({ to: "/" });

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

  const headerActions = (
    <PanelHeaderActions
      share={{ onClick: share }}
      edit={isOwner ? { onClick: () => setEditMode(true) } : undefined}
      remove={isOwner ? { onClick: () => setConfirmDelete(true) } : undefined}
    />
  );

  return (
    <DiscoverSidebar
      title={collection?.name?.trim() || "Collection"}
      onClose={close}
      onBack={back}
      backLabel={backLabel}
      rightHeaderSlot={headerActions}
      mobileCollapsible
    >
      {isLoading ? (
        <LoadingSkeleton />
      ) : (
        <div className="space-y-4">
          <CollectionHeader collection={collection ?? undefined} authorId={authorId} />
          {(editMode || confirmDelete) && (
            <CollectionActions
              authorId={authorId}
              collectionId={collectionId}
              collection={collection ?? undefined}
              editMode={editMode}
              confirmDelete={confirmDelete}
              onCloseEdit={() => setEditMode(false)}
              onCloseConfirmDelete={() => setConfirmDelete(false)}
              onConfirmDelete={() => {
                setConfirmDelete(false);
                handleDelete();
              }}
            />
          )}
          {!editMode && collection?.description && (
            <p className="whitespace-pre-wrap text-sm text-foreground">
              {collection.description}
            </p>
          )}
          <CollectionTags authorId={authorId} collectionId={collectionId} />
          <div className="space-y-2 border-t border-border pt-4">
            <h3 className="text-sm font-medium text-foreground">Places</h3>
            <CollectionPlaces
              items={collection?.items ?? []}
              authorId={authorId}
              collectionId={collectionId}
              isOwner={isOwner}
              onRemove={handleRemovePlace}
            />
            <CollectionAddPlace
              authorId={authorId}
              collectionId={collectionId}
              collection={collection ?? undefined}
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
