import { useEffect, useMemo, useRef, useState } from "react";
import { FolderHeart, MapPin, Eye, EyeOff, Loader2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Route as CollectionsRoute } from "@/routes/collections";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  useUserCollections,
  useViewportCollections,
} from "@/lib/api/hooks";
import { useUiStore, type CollectionOverlayEntry } from "@/stores/ui-store";
import { useViewportBounds } from "@/hooks/use-viewport-bounds";
import { useAutoFocusLayer } from "@/hooks/use-auto-focus-layer";
import { DiscoverSidebar, type DiscoverTab } from "@/components/discover/DiscoverSidebar";
import { DiscoverNewButton } from "@/components/discover/NewButton";
import { CreateCollectionForm } from "./CreateCollectionForm";
import type { CollectionDetails } from "@/types/mapky";

/** Cap auto-pinned overlays to the OVERLAY_COLORS palette length so
 * each collection gets a distinct hue. */
const AUTO_PIN_LIMIT = 7;

type Tab = "mine" | "viewport";

/**
 * Collections discover sidebar — Mine / In this area feed. Search lives
 * in the global top SearchBar. Viewport tab ships disabled with a
 * "Coming soon" note pending the /v0/mapky/collections/viewport
 * backend endpoint.
 */
export function CollectionList() {
  const navigate = useNavigate();
  const search = CollectionsRoute.useSearch();
  const { isAuthenticated, publicKey } = useAuth();
  const { data: collections, isLoading } = useUserCollections(publicKey);
  const [creating, setCreating] = useState(false);

  // Tab lives in the URL so reload + history-back from a collection
  // detail land the user back on the same tab they were browsing.
  // Default depends on auth state — signed-in users start on "Mine",
  // signed-out users start on the public "In this area" tab.
  const tab: Tab = search.tab ?? (publicKey ? "mine" : "viewport");
  const setTab = (next: Tab) => {
    navigate({ to: "/collections", search: { tab: next }, replace: true });
  };

  // Browsing collections → fade Mapky places + captures so the
  // collection overlays pop. Cleared on unmount by useAutoFocusLayer.
  useAutoFocusLayer("collections");

  // Public viewport: backed by the indexer's
  // /v0/mapky/collections/viewport endpoint, which returns every
  // collection (any author) with at least one place inside the bbox.
  const bbox = useViewportBounds(tab === "viewport");
  const viewportQuery = useViewportCollections(
    tab === "viewport" ? bbox : null,
  );

  // Auto-pin every visible collection so its member places show up as
  // colored POIs without the user having to flip eye icons one-by-one.
  // Saves the user's pre-existing overlays on mount and restores them
  // on unmount so closing the sidebar leaves the map exactly as it was.
  const savedOverlaysRef = useRef<Map<string, CollectionOverlayEntry> | null>(null);
  useEffect(() => {
    savedOverlaysRef.current = new Map(useUiStore.getState().activeCollectionOverlays);
    return () => {
      const s = useUiStore.getState();
      s.clearAllCollectionOverlays();
      if (savedOverlaysRef.current) {
        for (const e of savedOverlaysRef.current.values()) {
          s.addCollectionOverlay(e.authorId, e.collectionId, e.color);
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const targetCollections =
    tab === "mine" ? collections : viewportQuery.data;
  useEffect(() => {
    if (!targetCollections) return;
    const top = targetCollections.slice(0, AUTO_PIN_LIMIT);
    const s = useUiStore.getState();
    s.clearAllCollectionOverlays();
    for (const c of top) {
      const [authorId, collectionId] = c.id.split(":");
      s.addCollectionOverlay(authorId, collectionId, c.color ?? undefined);
    }
  }, [targetCollections]);

  const tabs: DiscoverTab[] = useMemo(() => {
    const list: DiscoverTab[] = [];
    if (publicKey) list.push({ id: "mine", label: "Mine" });
    list.push({ id: "viewport", label: "In this area" });
    return list;
  }, [publicKey]);

  const close = () => navigate({ to: "/" });

  return (
    <DiscoverSidebar
      title="Collections"
      tabs={tabs}
      activeTab={tab}
      onTabChange={(id) => setTab(id as Tab)}
      onClose={close}
    >
      {tab === "viewport" ? (
        <ViewportCollections query={viewportQuery} />
      ) : !isAuthenticated ? (
        <p className="py-8 text-center text-sm text-muted">
          Sign in to create and view collections
        </p>
      ) : creating ? (
        <CreateCollectionForm onClose={() => setCreating(false)} />
      ) : (
        <div className="space-y-3">
          <DiscoverNewButton
            onClick={() => setCreating(true)}
            label="New collection"
          />

          {isLoading && <LoadingSkeleton />}

          {!isLoading && (collections?.length ?? 0) === 0 && (
            <p className="py-8 text-center text-sm text-muted">
              You don't have any collections yet
            </p>
          )}

          {collections?.map((c) => (
            <CollectionCard key={c.id} collection={c} />
          ))}
        </div>
      )}
    </DiscoverSidebar>
  );
}

function ViewportCollections({
  query,
}: {
  query: ReturnType<typeof useViewportCollections>;
}) {
  if (query.isLoading) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading…
      </p>
    );
  }
  if (query.error) {
    return (
      <p className="text-xs text-red-500">{(query.error as Error).message}</p>
    );
  }
  if (!query.data || query.data.length === 0) {
    return (
      <p className="text-xs text-muted">
        No collections in this area yet. Pan or zoom out to find more.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {query.data.map((c) => (
        <CollectionCard key={c.id} collection={c} />
      ))}
    </div>
  );
}

function CollectionCard({ collection }: { collection: CollectionDetails }) {
  const navigate = useNavigate();
  const overlays = useUiStore((s) => s.activeCollectionOverlays);
  const toggleOverlay = useUiStore((s) => s.toggleCollectionOverlay);
  const [authorId, collectionId] = collection.id.split(":");

  const overlay = overlays.get(collectionId);
  const isVisible = !!overlay;

  return (
    <div className="flex items-start gap-2 rounded-lg border border-border p-3 transition-colors hover:bg-surface">
      <button
        onClick={() =>
          navigate({
            to: "/collection/$authorId/$collectionId",
            params: { authorId, collectionId },
          })
        }
        className="flex min-w-0 flex-1 items-start gap-3 text-left"
      >
        <FolderHeart className="mt-0.5 h-5 w-5 flex-shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{collection.name}</p>
          {collection.description && (
            <p className="mt-0.5 text-xs text-muted line-clamp-2">
              {collection.description}
            </p>
          )}
          <div className="mt-1 flex items-center gap-1 text-xs text-muted">
            <MapPin className="h-3 w-3" />
            {collection.items.length} places
          </div>
        </div>
      </button>

      {collection.items.length > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleOverlay(authorId, collectionId, collection.color ?? undefined);
          }}
          title={isVisible ? "Hide on map" : "Show on map"}
          className="flex-shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:bg-background hover:text-foreground"
        >
          {isVisible ? (
            <Eye className="h-4 w-4" style={{ color: overlay.color }} />
          ) : (
            <EyeOff className="h-4 w-4" />
          )}
        </button>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-20 animate-pulse rounded-lg bg-border" />
      ))}
    </div>
  );
}
