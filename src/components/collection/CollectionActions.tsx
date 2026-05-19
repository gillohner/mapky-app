import { useState, useRef } from "react";
import { Plus, X, Check, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/AuthProvider";
import { updateCollectionJson, makeOsmUrl } from "@/lib/mapky-specs";
import { ingestUserIntoNexus } from "@/lib/nexus/ingest";
import {
  pendingEntityFieldPatch,
  pendingSingleFieldPatch,
} from "@/lib/api/optimistic-overlay";
import { searchPlaces } from "@/lib/api/nominatim";
import { toast } from "sonner";
import type { CollectionDetails } from "@/types/mapky";

const sameItems = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

interface CollectionActionsProps {
  authorId: string;
  collectionId: string;
  collection?: CollectionDetails;
  /**
   * `editMode` and `confirmDelete` are owned by the parent panel so it
   * can wire them to header icon buttons. The Add-Place flow lives in
   * `<CollectionAddPlace />` and is rendered below the places list, not
   * here — keeps "edit / confirm delete" anchored visually to the title.
   */
  editMode: boolean;
  confirmDelete: boolean;
  onCloseEdit: () => void;
  onCloseConfirmDelete: () => void;
  onConfirmDelete: () => void;
}

export function CollectionActions({
  authorId,
  collectionId,
  collection,
  editMode,
  confirmDelete,
  onCloseEdit,
  onCloseConfirmDelete,
  onConfirmDelete,
}: CollectionActionsProps) {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: ["mapky", "collection", authorId, collectionId],
    });
    queryClient.invalidateQueries({
      queryKey: ["mapky", "collections", "user", authorId],
    });
  };

  if (editMode && collection) {
    return (
      <EditInline
        authorId={authorId}
        collectionId={collectionId}
        collection={collection}
        onClose={onCloseEdit}
        onSaved={invalidate}
      />
    );
  }

  if (confirmDelete) {
    return (
      <div className="space-y-3 rounded-lg border border-red-500/30 bg-surface p-3">
        <p className="text-sm text-foreground">
          Delete <span className="font-medium">{collection?.name}</span>? This
          cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCloseConfirmDelete}
            className="rounded-md border border-border px-3 py-1 text-xs text-muted hover:bg-background"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirmDelete}
            className="rounded-md bg-red-500 px-3 py-1 text-xs font-medium text-white hover:bg-red-600"
          >
            Delete
          </button>
        </div>
      </div>
    );
  }

  return null;
}

/**
 * Add-Place trigger + inline search form. Rendered below the Places
 * list so the workflow flows naturally: scroll past existing places,
 * see the prompt to add another. Owner-only.
 */
export function CollectionAddPlace({
  authorId,
  collectionId,
  collection,
}: {
  authorId: string;
  collectionId: string;
  collection?: CollectionDetails;
}) {
  const { publicKey } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const isOwner = publicKey === authorId;

  if (!isOwner || !collection) return null;

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: ["mapky", "collection", authorId, collectionId],
    });
    queryClient.invalidateQueries({
      queryKey: ["mapky", "collections", "user", authorId],
    });
  };

  if (open) {
    return (
      <AddPlaceInline
        authorId={authorId}
        collectionId={collectionId}
        collection={collection}
        onClose={() => setOpen(false)}
        onSaved={invalidate}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-accent"
    >
      <Plus className="h-3.5 w-3.5" />
      Add Place
    </button>
  );
}

function EditInline({
  collectionId,
  collection,
  onClose,
  onSaved,
}: {
  authorId: string;
  collectionId: string;
  collection: CollectionDetails;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { session, publicKey } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState(collection.name);
  const [description, setDescription] = useState(
    collection.description ?? "",
  );
  const [color, setColor] = useState(collection.color ?? "#3B82F6");
  const [submitting, setSubmitting] = useState(false);

  const handleSave = async () => {
    if (!session || !publicKey || !name.trim()) return;
    setSubmitting(true);
    try {
      const json = updateCollectionJson(
        name.trim(),
        description.trim() || undefined,
        collection.items,
        color,
      );
      const path = `/pub/mapky.app/posts/${collectionId}`;
      await session.storage.putText(path as `/pub/${string}`, json);

      await queryClient.cancelQueries({ queryKey: ["mapky", "collection", publicKey, collectionId] });
      await queryClient.cancelQueries({ queryKey: ["mapky", "collections", "user", publicKey] });

      queryClient.setQueryData<CollectionDetails>(
        ["mapky", "collection", publicKey, collectionId],
        (old) => old ? { ...old, name: name.trim(), description: description.trim() || null, color } : old,
      );
      queryClient.setQueryData<CollectionDetails[]>(
        ["mapky", "collections", "user", publicKey],
        (old) => old?.map((c) => {
          const [, id] = c.id.split(":");
          return id === collectionId ? { ...c, name: name.trim(), description: description.trim() || null, color } : c;
        }),
      );

      toast.success("Collection updated");
      onClose();

      ingestUserIntoNexus(publicKey).then(() => setTimeout(() => {
        onSaved();
      }, 5000));
    } catch {
      toast.error("Failed to update");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface p-3">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={100}
        placeholder="Collection name"
        autoFocus
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={1000}
        placeholder="Description (optional)"
        rows={3}
        className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
      />
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted">Map color</label>
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value.toUpperCase())}
          className="h-8 w-10 cursor-pointer rounded border border-border bg-background p-0.5"
        />
        <span className="text-xs font-mono text-muted">{color}</span>
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="rounded-md border border-border px-3 py-1 text-xs text-muted hover:bg-background disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!name.trim() || submitting}
          className="flex items-center gap-1 rounded-md bg-accent px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Check className="h-3 w-3" />
          )}
          Save
        </button>
      </div>
    </div>
  );
}

function AddPlaceInline({
  collectionId,
  collection,
  onClose,
  onSaved,
}: {
  authorId: string;
  collectionId: string;
  collection: CollectionDetails;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { session, publicKey } = useAuth();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    Array<{ name: string; osmType: string; osmId: number; display: string }>
  >([]);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleInput = (val: string) => {
    setQuery(val);
    clearTimeout(debounceRef.current);
    if (val.length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await searchPlaces(val);
        setResults(
          data.map((r) => ({
            name: r.name,
            osmType: r.osm_type,
            osmId: r.osm_id,
            display: r.display_name,
          })),
        );
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  };

  const handleAdd = async (osmType: string, osmId: number) => {
    if (!session || !publicKey) return;
    const osmUrl = makeOsmUrl(osmType, osmId);
    if (collection.items.includes(osmUrl)) {
      toast.info("Already in collection");
      return;
    }
    setSubmitting(true);
    try {
      const newItems = [...collection.items, osmUrl];
      const json = updateCollectionJson(
        collection.name,
        collection.description ?? undefined,
        newItems,
        collection.color ?? undefined,
      );
      const path = `/pub/mapky.app/posts/${collectionId}`;
      await session.storage.putText(path as `/pub/${string}`, json);

      await queryClient.cancelQueries({ queryKey: ["mapky", "collection", publicKey, collectionId] });
      await queryClient.cancelQueries({ queryKey: ["mapky", "collections", "user", publicKey] });

      queryClient.setQueryData<CollectionDetails>(
        ["mapky", "collection", publicKey, collectionId],
        (old) => (old ? { ...old, items: newItems } : old),
      );
      queryClient.setQueryData<CollectionDetails[]>(
        ["mapky", "collections", "user", publicKey],
        (old) => old?.map((c) => {
          const [, id] = c.id.split(":");
          return id === collectionId ? { ...c, items: newItems } : c;
        }),
      );

      const patchOpId = `coll-items:${collectionId}`;
      pendingSingleFieldPatch<CollectionDetails, string[]>({
        queryKey: ["mapky", "collection", publicKey, collectionId],
        opId: patchOpId,
        field: "items",
        value: newItems,
        matches: sameItems,
      });
      pendingEntityFieldPatch<CollectionDetails, string[]>({
        queryKey: ["mapky", "collections", "user", publicKey],
        opId: patchOpId,
        entityId: collection.id,
        getEntityId: (c) => c.id,
        field: "items",
        value: newItems,
        matches: sameItems,
      });

      toast.success("Place added");
      onClose();

      ingestUserIntoNexus(publicKey).then(() => setTimeout(() => {
        onSaved();
      }, 5000));
    } catch {
      toast.error("Failed to add place");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">Add a place</span>
        <button
          onClick={onClose}
          className="rounded p-1 text-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <input
        type="text"
        value={query}
        onChange={(e) => handleInput(e.target.value)}
        placeholder="Search for a place..."
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
      />
      {searching && (
        <p className="text-xs text-muted">Searching...</p>
      )}
      {results.length > 0 && (
        <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-background">
          {results.map((r) => {
            const alreadyIn = collection.items.includes(
              makeOsmUrl(r.osmType, r.osmId),
            );
            return (
              <button
                key={`${r.osmType}-${r.osmId}`}
                onClick={() => handleAdd(r.osmType, r.osmId)}
                disabled={alreadyIn || submitting}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5 flex-shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-foreground">{r.name}</p>
                  <p className="truncate text-xs text-muted">{r.display}</p>
                </div>
                {alreadyIn && (
                  <Check className="h-3.5 w-3.5 flex-shrink-0 text-accent" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
