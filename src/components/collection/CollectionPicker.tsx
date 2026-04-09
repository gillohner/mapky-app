import { useState } from "react";
import {
  FolderHeart,
  Check,
  Plus,
  X,
  Loader2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/AuthProvider";
import { useUserCollections } from "@/lib/api/hooks";
import {
  createCollection,
  updateCollectionJson,
  makeOsmUrl,
} from "@/lib/mapky-specs";
import { ingestUserIntoNexus } from "@/lib/nexus/ingest";
import { toast } from "sonner";

interface CollectionPickerProps {
  osmType: string;
  osmId: number;
  onClose: () => void;
}

export function CollectionPicker({
  osmType,
  osmId,
  onClose,
}: CollectionPickerProps) {
  const { session, publicKey } = useAuth();
  const { data: collections, isLoading } = useUserCollections(publicKey);
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const osmUrl = makeOsmUrl(osmType, osmId);

  const togglePlace = async (collectionId: string) => {
    if (!session || !publicKey) return;
    const collection = collections?.find((c) => {
      const [, cId] = c.id.split(":");
      return cId === collectionId;
    });
    if (!collection) return;

    setBusy(collectionId);
    try {
      const [, cId] = collection.id.split(":");
      const hasPlace = collection.items.includes(osmUrl);
      const newItems = hasPlace
        ? collection.items.filter((i) => i !== osmUrl)
        : [...collection.items, osmUrl];

      const json = updateCollectionJson(
        collection.name,
        collection.description ?? undefined,
        newItems,
        collection.image_uri ?? undefined,
      );
      const path = `/pub/mapky.app/collections/${cId}`;
      await session.storage.putText(path as `/pub/${string}`, json);
      await ingestUserIntoNexus(publicKey);

      queryClient.invalidateQueries({
        queryKey: ["mapky", "collections", "user", publicKey],
      });
      queryClient.invalidateQueries({
        queryKey: ["mapky", "collection", publicKey, cId],
      });
      queryClient.invalidateQueries({
        queryKey: ["mapky", "collections", "place", osmType, osmId],
      });

      toast.success(
        hasPlace ? "Removed from collection" : "Added to collection",
      );
    } catch {
      toast.error("Failed to update collection");
    } finally {
      setBusy(null);
    }
  };

  const handleCreate = async () => {
    if (!session || !publicKey || !newName.trim()) return;
    setBusy("__new__");
    try {
      const result = createCollection(
        publicKey,
        newName.trim(),
        undefined,
        [osmUrl],
      );
      await session.storage.putText(
        result.path as `/pub/${string}`,
        result.json,
      );
      await ingestUserIntoNexus(publicKey);

      queryClient.invalidateQueries({
        queryKey: ["mapky", "collections", "user", publicKey],
      });
      queryClient.invalidateQueries({
        queryKey: ["mapky", "collections", "place", osmType, osmId],
      });

      toast.success(`Created "${newName.trim()}" with this place`);
      setNewName("");
      setCreating(false);
    } catch {
      toast.error("Failed to create collection");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">
          Add to collection
        </span>
        <button
          onClick={onClose}
          className="rounded p-1 text-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 py-2 text-xs text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading...
        </div>
      )}

      {!isLoading && collections && collections.length > 0 && (
        <div className="max-h-48 space-y-1 overflow-y-auto">
          {collections.map((c) => {
            const [, cId] = c.id.split(":");
            const hasPlace = c.items.includes(osmUrl);
            const isBusy = busy === cId;

            return (
              <button
                key={c.id}
                onClick={() => togglePlace(cId)}
                disabled={!!busy}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-background disabled:opacity-50"
              >
                <FolderHeart
                  className={`h-4 w-4 flex-shrink-0 ${
                    hasPlace ? "text-accent" : "text-muted"
                  }`}
                />
                <span className="flex-1 truncate text-foreground">
                  {c.name}
                </span>
                {isBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" />
                ) : hasPlace ? (
                  <Check className="h-3.5 w-3.5 text-accent" />
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      {!isLoading && (!collections || collections.length === 0) && (
        <p className="py-2 text-xs text-muted">No collections yet</p>
      )}

      <div className="border-t border-border pt-2">
        {creating ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="Collection name"
              maxLength={100}
              className="flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              autoFocus
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || !!busy}
              className="rounded-lg bg-accent px-2.5 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {busy === "__new__" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted hover:text-accent"
          >
            <Plus className="h-4 w-4" />
            New collection
          </button>
        )}
      </div>
    </div>
  );
}
