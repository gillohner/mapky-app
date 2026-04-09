import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/AuthProvider";
import { createCollection } from "@/lib/mapky-specs";
import { ingestUserIntoNexus } from "@/lib/nexus/ingest";
import { toast } from "sonner";

interface CreateCollectionFormProps {
  onClose: () => void;
}

export function CreateCollectionForm({ onClose }: CreateCollectionFormProps) {
  const { session, publicKey } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = name.trim().length > 0;

  const handleSubmit = async () => {
    if (!session || !publicKey || !canSubmit) return;
    setSubmitting(true);
    try {
      const result = createCollection(
        publicKey,
        name.trim(),
        description.trim() || undefined,
      );
      await session.storage.putText(
        result.path as `/pub/${string}`,
        result.json,
      );
      await ingestUserIntoNexus(publicKey);
      queryClient.invalidateQueries({
        queryKey: ["mapky", "collections", "user", publicKey],
      });
      toast.success("Collection created");

      // Extract collection ID from the path
      const collectionId = result.path.split("/").pop()!;
      navigate({
        to: "/collection/$authorId/$collectionId",
        params: { authorId: publicKey, collectionId },
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create collection",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">New Collection</h3>
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
        placeholder="Collection name"
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
        autoFocus
      />

      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={300}
        placeholder="Description (optional)"
        rows={2}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none resize-none"
      />

      <button
        onClick={handleSubmit}
        disabled={!canSubmit || submitting}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        Create
      </button>
    </div>
  );
}
