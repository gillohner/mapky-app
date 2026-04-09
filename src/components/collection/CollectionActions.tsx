import { useState, useRef } from "react";
import {
  TagIcon,
  Pencil,
  Plus,
  Share2,
  Trash2,
  X,
  Send,
  Check,
  Loader2,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  createCollectionTag,
  updateCollectionJson,
  makeOsmUrl,
} from "@/lib/mapky-specs";
import { ingestUserIntoNexus } from "@/lib/nexus/ingest";
import { searchPlaces } from "@/lib/api/nominatim";
import { toast } from "sonner";
import type { CollectionDetails, PostTagDetails } from "@/types/mapky";

interface CollectionActionsProps {
  authorId: string;
  collectionId: string;
  collection?: CollectionDetails;
}

type Mode = null | "tag" | "edit" | "add-place" | "confirm-delete";

export function CollectionActions({
  authorId,
  collectionId,
  collection,
}: CollectionActionsProps) {
  const { isAuthenticated, session, publicKey } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>(null);
  const isOwner = publicKey === authorId;

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: ["mapky", "collection", authorId, collectionId],
    });
    queryClient.invalidateQueries({
      queryKey: ["mapky", "collections", "user", authorId],
    });
  };

  const handleShare = () => {
    const url = `${window.location.origin}/collection/${authorId}/${collectionId}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied");
  };

  const handleDelete = async () => {
    if (!session || !collection) return;
    try {
      const path = `/pub/mapky.app/collections/${collectionId}`;
      await session.storage.delete(path as `/pub/${string}`);

      // Optimistic cache update — remove from user's collection list
      queryClient.setQueryData<CollectionDetails[]>(
        ["mapky", "collections", "user", authorId],
        (old) => old?.filter((c) => { const [, id] = c.id.split(":"); return id !== collectionId; }),
      );

      toast.success("Collection deleted");
      navigate({ to: "/collections" });

      // Background reconciliation — delay to let server finish indexing
      ingestUserIntoNexus(publicKey!).then(() => setTimeout(() => {
        invalidate();
      }, 5000));
    } catch {
      toast.error("Failed to delete");
    }
  };

  if (mode === "tag") {
    return (
      <TagInline
        authorId={authorId}
        collectionId={collectionId}
        onClose={() => setMode(null)}
      />
    );
  }

  if (mode === "edit" && collection) {
    return (
      <EditInline
        authorId={authorId}
        collectionId={collectionId}
        collection={collection}
        onClose={() => setMode(null)}
        onSaved={invalidate}
      />
    );
  }

  if (mode === "add-place" && collection) {
    return (
      <AddPlaceInline
        authorId={authorId}
        collectionId={collectionId}
        collection={collection}
        onClose={() => setMode(null)}
        onSaved={invalidate}
      />
    );
  }

  if (mode === "confirm-delete") {
    return (
      <div className="space-y-3 rounded-lg border border-red-500/30 bg-surface p-3">
        <p className="text-sm text-foreground">
          Delete <span className="font-medium">{collection?.name}</span>? This cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setMode(null)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:bg-background"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            className="rounded-lg bg-red-500 px-3 py-1.5 text-sm text-white hover:bg-red-600"
          >
            Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <ActionButton
        icon={<TagIcon className="h-4 w-4" />}
        label="Tag"
        disabled={!isAuthenticated}
        onClick={() => setMode("tag")}
      />
      {isOwner && (
        <>
          <ActionButton
            icon={<Plus className="h-4 w-4" />}
            label="Add Place"
            onClick={() => setMode("add-place")}
          />
          <ActionButton
            icon={<Pencil className="h-4 w-4" />}
            label="Edit"
            onClick={() => setMode("edit")}
          />
        </>
      )}
      <ActionButton
        icon={<Share2 className="h-4 w-4" />}
        label="Share"
        onClick={handleShare}
      />
      {isOwner && (
        <ActionButton
          icon={<Trash2 className="h-4 w-4" />}
          label="Delete"
          onClick={() => setMode("confirm-delete")}
          className="text-red-500 hover:border-red-500"
        />
      )}
    </div>
  );
}

function ActionButton({
  icon,
  label,
  disabled,
  onClick,
  className = "",
}: {
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background disabled:text-muted disabled:opacity-50 ${className}`}
    >
      {icon}
      {label}
    </button>
  );
}

function TagInline({
  authorId,
  collectionId,
  onClose,
}: {
  authorId: string;
  collectionId: string;
  onClose: () => void;
}) {
  const { session, publicKey } = useAuth();
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const normalized = label.trim().toLowerCase().replace(/\s+/g, "-");

  const handleSubmit = async () => {
    if (!session || !publicKey || !normalized) return;
    setSubmitting(true);
    try {
      const result = createCollectionTag(
        publicKey,
        authorId,
        collectionId,
        normalized,
      );
      await session.storage.putText(
        result.path as `/pub/${string}`,
        result.json,
      );

      // Cancel in-flight fetches so they don't overwrite optimistic data
      await queryClient.cancelQueries({ queryKey: ["mapky", "collection", authorId, collectionId, "tags"] });

      // Optimistic cache update
      queryClient.setQueryData<PostTagDetails[]>(
        ["mapky", "collection", authorId, collectionId, "tags"],
        (old) => {
          const entry = { label: normalized, taggers: [publicKey], taggers_count: 1 };
          if (!old) return [entry];
          const existing = old.find((t) => t.label === normalized);
          if (existing) {
            if (existing.taggers.includes(publicKey)) return old;
            return old.map((t) =>
              t.label === normalized
                ? { ...t, taggers: [...t.taggers, publicKey], taggers_count: t.taggers_count + 1 }
                : t,
            );
          }
          return [...old, entry];
        },
      );

      toast.success(`Tagged with "${normalized}"`);
      onClose();

      // Background reconciliation — delay to let server finish indexing
      ingestUserIntoNexus(publicKey).then(() => setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["mapky", "collection", authorId, collectionId, "tags"] });
        queryClient.invalidateQueries({ queryKey: ["mapky", "collection", authorId, collectionId] });
      }, 5000));
    } catch {
      toast.error("Failed to tag");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">
          Tag this collection
        </span>
        <button
          onClick={onClose}
          className="rounded p-1 text-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="e.g. restaurants, favorites"
          maxLength={20}
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <button
          onClick={handleSubmit}
          disabled={!normalized || submitting}
          className="rounded-lg bg-accent px-3 py-2 text-white disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
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
        collection.image_uri ?? undefined,
        color,
      );
      const path = `/pub/mapky.app/collections/${collectionId}`;
      await session.storage.putText(path as `/pub/${string}`, json);

      // Cancel in-flight fetches so they don't overwrite optimistic data
      await queryClient.cancelQueries({ queryKey: ["mapky", "collection", publicKey, collectionId] });
      await queryClient.cancelQueries({ queryKey: ["mapky", "collections", "user", publicKey] });

      // Optimistic cache update
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

      // Background reconciliation — delay to let server finish indexing
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
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">
          Edit collection
        </span>
        <button
          onClick={onClose}
          className="rounded p-1 text-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={100}
        placeholder="Name"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={300}
        placeholder="Description (optional)"
        rows={2}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none resize-none"
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
          onClick={onClose}
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:bg-background"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!name.trim() || submitting}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
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
        collection.image_uri ?? undefined,
        collection.color ?? undefined,
      );
      const path = `/pub/mapky.app/collections/${collectionId}`;
      await session.storage.putText(path as `/pub/${string}`, json);

      // Cancel in-flight fetches so they don't overwrite optimistic data
      await queryClient.cancelQueries({ queryKey: ["mapky", "collection", publicKey, collectionId] });
      await queryClient.cancelQueries({ queryKey: ["mapky", "collections", "user", publicKey] });

      // Optimistic cache update
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

      toast.success("Place added");
      onClose();

      // Background reconciliation — delay to let server finish indexing
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
