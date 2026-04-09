import { useEffect, useRef } from "react";
import { X, ChevronUp, ChevronDown, ChevronLeft } from "lucide-react";
import { useState } from "react";
import type { CollectionOverlayEntry } from "@/stores/ui-store";
import { useNavigate } from "@tanstack/react-router";
import { useCollection } from "@/lib/api/hooks";
import { useUiStore } from "@/stores/ui-store";
import { CollectionHeader } from "./CollectionHeader";
import { CollectionActions } from "./CollectionActions";
import { CollectionTags } from "./CollectionTags";
import { CollectionPlaces } from "./CollectionPlaces";

interface CollectionPanelProps {
  authorId: string;
  collectionId: string;
  fromSearchQuery?: string;
  fromSearchMode?: string;
  fromPlaceType?: string;
  fromPlaceId?: number;
}

export function CollectionPanel({ authorId, collectionId, fromSearchQuery, fromSearchMode, fromPlaceType, fromPlaceId }: CollectionPanelProps) {
  const navigate = useNavigate();
  const { data: collection, isLoading } = useCollection(authorId, collectionId);
  const [expanded, setExpanded] = useState(false);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const addOverlay = useUiStore((s) => s.addCollectionOverlay);

  useEffect(() => {
    setSidebarOpen(true);
    return () => setSidebarOpen(false);
  }, [setSidebarOpen]);

  // On mount: save current state, hide everything, show only this collection.
  // On unmount: restore previous state.
  const savedOverlays = useRef<Map<string, CollectionOverlayEntry> | null>(null);
  const savedPlacesVisible = useRef<boolean>(true);

  useEffect(() => {
    const store = useUiStore.getState();

    // Save current state
    savedOverlays.current = new Map(store.activeCollectionOverlays);
    savedPlacesVisible.current = store.placesLayerVisible;

    // Hide everything
    store.clearAllCollectionOverlays();
    if (store.placesLayerVisible) store.setPlacesLayerVisible(false);

    // Show only this collection
    store.addCollectionOverlay(authorId, collectionId, collection?.color ?? undefined);

    return () => {
      // Restore previous state
      const s = useUiStore.getState();
      s.clearAllCollectionOverlays();
      if (savedOverlays.current) {
        for (const entry of savedOverlays.current.values()) {
          s.addCollectionOverlay(entry.authorId, entry.collectionId, entry.color);
        }
      }
      if (savedPlacesVisible.current) s.setPlacesLayerVisible(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorId, collectionId]);

  // Keep overlay forced on if color updates from API
  useEffect(() => {
    if (collection?.color) {
      addOverlay(authorId, collectionId, collection.color);
    }
  }, [collection?.color, authorId, collectionId, addOverlay]);

  const close = () => navigate({ to: "/" });
  const back = () => {
    if (fromPlaceType && fromPlaceId) {
      navigate({
        to: "/place/$osmType/$osmId",
        params: { osmType: fromPlaceType, osmId: String(fromPlaceId) },
      });
    } else if (fromSearchQuery) {
      navigate({
        to: "/search",
        search: { q: fromSearchQuery, mode: (fromSearchMode as "places" | "tags") ?? "places" },
      });
    } else {
      navigate({ to: "/collections" });
    }
  };
  const backLabel = fromPlaceType ? "Place" : fromSearchQuery ? "Search results" : "Collections";

  return (
    <>
      {/* Desktop sidebar */}
      <div className="pointer-events-auto absolute inset-y-0 left-12 z-10 hidden w-[380px] flex-col border-r border-border bg-background shadow-xl md:flex">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <button
            onClick={back}
            className="flex items-center gap-1 text-xs font-medium text-muted transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {backLabel}
          </button>
          <button
            onClick={close}
            className="rounded-lg p-1 text-muted transition-colors hover:bg-surface hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {isLoading && <LoadingSkeleton />}
          {!isLoading && (
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
                <h3 className="mb-2 text-sm font-medium text-foreground">
                  Places
                </h3>
                <CollectionPlaces
                  items={collection?.items ?? []}
                  authorId={authorId}
                  collectionId={collectionId}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile bottom sheet */}
      <div
        className={`pointer-events-auto absolute bottom-0 left-0 right-0 z-10 flex flex-col rounded-t-2xl border-t border-border bg-background shadow-2xl transition-[max-height] duration-300 ease-out md:hidden ${
          expanded ? "max-h-[85vh]" : "max-h-[200px]"
        }`}
      >
        <div className="flex-shrink-0 px-4 pt-2 pb-3">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border" />
          <button
            onClick={back}
            className="mb-1 flex items-center gap-1 text-xs text-muted hover:text-foreground"
          >
            <ChevronLeft className="h-3 w-3" />
            {backLabel}
          </button>
          {isLoading && <LoadingSkeleton />}
          {!isLoading && (
            <CollectionHeader collection={collection ?? undefined} authorId={authorId} />
          )}
          <div className="absolute right-2 top-2 flex items-center gap-1">
            <button
              onClick={() => setExpanded((v) => !v)}
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface hover:text-foreground"
            >
              {expanded ? (
                <ChevronDown className="h-5 w-5" />
              ) : (
                <ChevronUp className="h-5 w-5" />
              )}
            </button>
            <button
              onClick={close}
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {expanded && (
          <div className="flex-1 overflow-y-auto border-t border-border px-4 py-3">
            <div className="space-y-4">
              <CollectionActions
                authorId={authorId}
                collectionId={collectionId}
                collection={collection ?? undefined}
              />
              <CollectionTags authorId={authorId} collectionId={collectionId} />
              <div className="border-t border-border pt-4">
                <h3 className="mb-2 text-sm font-medium text-foreground">
                  Places
                </h3>
                <CollectionPlaces
                  items={collection?.items ?? []}
                  authorId={authorId}
                  collectionId={collectionId}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
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
