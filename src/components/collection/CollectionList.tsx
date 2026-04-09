import { useState, useEffect, useMemo } from "react";
import { X, Plus, FolderHeart, MapPin, Eye, EyeOff, Layers } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/components/auth/AuthProvider";
import { useUserCollections } from "@/lib/api/hooks";
import { useUiStore } from "@/stores/ui-store";
import { CreateCollectionForm } from "./CreateCollectionForm";
import type { CollectionDetails } from "@/types/mapky";

export function CollectionList() {
  const navigate = useNavigate();
  const { isAuthenticated, publicKey } = useAuth();
  const { data: collections, isLoading } = useUserCollections(publicKey);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const overlays = useUiStore((s) => s.activeCollectionOverlays);
  const addOverlay = useUiStore((s) => s.addCollectionOverlay);
  const clearAllOverlays = useUiStore((s) => s.clearAllCollectionOverlays);
  const [creating, setCreating] = useState(false);

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

  useEffect(() => {
    setSidebarOpen(true);
    return () => setSidebarOpen(false);
  }, [setSidebarOpen]);

  const close = () => navigate({ to: "/" });

  return (
    <>
      {/* Desktop sidebar */}
      <div className="pointer-events-auto absolute inset-y-0 left-12 z-10 hidden w-[380px] flex-col border-r border-border bg-background shadow-xl md:flex">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            Collections
          </span>
          <div className="flex items-center gap-1">
            {collections && collections.length > 0 && (
              <button
                onClick={toggleAll}
                title={anyVisible ? "Hide all on map" : "Show all on map"}
                className="rounded-lg p-1 text-muted transition-colors hover:bg-surface hover:text-foreground"
              >
                {anyVisible ? (
                  <Layers className="h-4 w-4 text-accent" />
                ) : (
                  <Layers className="h-4 w-4" />
                )}
              </button>
            )}
            <button
              onClick={close}
              className="rounded-lg p-1 text-muted transition-colors hover:bg-surface hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {!isAuthenticated ? (
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

              {!isLoading && collections?.length === 0 && (
                <p className="py-8 text-center text-sm text-muted">
                  You don't have any collections yet
                </p>
              )}

              {collections?.map((c) => (
                <CollectionCard key={c.id} collection={c} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mobile: same content in bottom sheet */}
      <div className="pointer-events-auto absolute bottom-0 left-0 right-0 z-10 flex max-h-[85vh] flex-col rounded-t-2xl border-t border-border bg-background shadow-2xl md:hidden">
        <div className="flex-shrink-0 px-4 pt-2 pb-3">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border" />
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">
              Collections
            </span>
            <button
              onClick={close}
              className="rounded-lg p-1.5 text-muted hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto border-t border-border px-4 py-3">
          {!isAuthenticated ? (
            <p className="py-4 text-center text-sm text-muted">
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

              {!isLoading && collections?.length === 0 && (
                <p className="py-4 text-center text-sm text-muted">
                  No collections yet
                </p>
              )}

              {collections?.map((c) => (
                <CollectionCard key={c.id} collection={c} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
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
