import { useMemo, useState } from "react";
import { Plus, FolderHeart, MapPin, Eye, EyeOff, Layers } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/components/auth/AuthProvider";
import { useUserCollections, useViewportPlaces } from "@/lib/api/hooks";
import { useUiStore } from "@/stores/ui-store";
import { useViewportBounds } from "@/hooks/use-viewport-bounds";
import { DiscoverSidebar, type DiscoverTab } from "@/components/discover/DiscoverSidebar";
import { CreateCollectionForm } from "./CreateCollectionForm";
import type { CollectionDetails } from "@/types/mapky";

type Tab = "mine" | "viewport";

/**
 * Collections discover sidebar — Mine / In this area feed. Search lives
 * in the global top SearchBar. Viewport tab ships disabled with a
 * "Coming soon" note pending the /v0/mapky/collections/viewport
 * backend endpoint.
 */
export function CollectionList() {
  const navigate = useNavigate();
  const { isAuthenticated, publicKey } = useAuth();
  const { data: collections, isLoading } = useUserCollections(publicKey);
  const overlays = useUiStore((s) => s.activeCollectionOverlays);
  const addOverlay = useUiStore((s) => s.addCollectionOverlay);
  const clearAllOverlays = useUiStore((s) => s.clearAllCollectionOverlays);
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<Tab>(publicKey ? "mine" : "viewport");

  // Viewport-filtered collections: intersect each collection's `items`
  // (OSM canonical URLs) with the OSM URLs of indexed places currently
  // in view. A public-collections viewport endpoint is the proper fix
  // (mapky-nexus-plugin todo); until then, this surfaces my own
  // collections that are relevant to where I'm looking.
  const bbox = useViewportBounds(tab === "viewport");
  const { data: viewportPlaces } = useViewportPlaces(
    tab === "viewport" ? bbox : null,
  );
  const viewportCanonicals = useMemo(
    () => new Set((viewportPlaces ?? []).map((p) => p.osm_canonical)),
    [viewportPlaces],
  );
  const viewportCollections = useMemo(() => {
    if (!collections) return [];
    if (viewportCanonicals.size === 0) return [];
    return collections.filter((c) =>
      c.items.some((u) => viewportCanonicals.has(u)),
    );
  }, [collections, viewportCanonicals]);

  const tabs: DiscoverTab[] = useMemo(() => {
    const list: DiscoverTab[] = [];
    if (publicKey) list.push({ id: "mine", label: "Mine" });
    list.push({ id: "viewport", label: "In this area" });
    return list;
  }, [publicKey]);

  const anyVisible = overlays.size > 0;
  const toggleAll = () => {
    if (anyVisible) {
      clearAllOverlays();
    } else if (collections) {
      for (const c of collections) {
        const [authorId, collectionId] = c.id.split(":");
        addOverlay(authorId, collectionId, c.color ?? undefined);
      }
    }
  };

  const close = () => navigate({ to: "/" });

  const rightHeader =
    collections && collections.length > 0 ? (
      <button
        onClick={toggleAll}
        title={anyVisible ? "Hide all on map" : "Show all on map"}
        className="rounded-lg p-1 text-muted transition-colors hover:bg-surface hover:text-foreground"
      >
        <Layers
          className={`h-4 w-4 ${anyVisible ? "text-accent" : ""}`}
        />
      </button>
    ) : undefined;

  return (
    <DiscoverSidebar
      title="Collections"
      tabs={tabs}
      activeTab={tab}
      onTabChange={(id) => setTab(id as Tab)}
      onClose={close}
      rightHeaderSlot={rightHeader}
    >
      {tab === "viewport" ? (
        <ViewportCollections
          collections={viewportCollections}
          isAuthenticated={isAuthenticated}
        />
      ) : !isAuthenticated ? (
        <p className="py-8 text-center text-sm text-muted">
          Sign in to create and view collections
        </p>
      ) : creating ? (
        <CreateCollectionForm onClose={() => setCreating(false)} />
      ) : (
        <div className="space-y-3">
          <button
            onClick={() => setCreating(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted transition-colors hover:border-accent hover:text-accent"
          >
            <Plus className="h-4 w-4" />
            New Collection
          </button>

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
  collections,
  isAuthenticated,
}: {
  collections: CollectionDetails[];
  isAuthenticated: boolean;
}) {
  if (!isAuthenticated) {
    return (
      <p className="py-8 text-center text-sm text-muted">
        Sign in to see your collections that intersect the map view.
      </p>
    );
  }
  if (collections.length === 0) {
    return (
      <p className="text-xs text-muted">
        None of your collections have places in this area. Pan or zoom out
        to find them.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {collections.map((c) => (
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
