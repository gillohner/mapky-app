import { useState } from "react";
import { Send, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/AuthProvider";
import { createPlaceTag, makeOsmUrl } from "@/lib/mapky-specs";
import { ingestUserIntoNexus } from "@/lib/nexus/ingest";
import { toast } from "sonner";

interface TagFormProps {
  osmType: string;
  osmId: number;
  onClose: () => void;
}

const SUGGESTED_TAGS = [
  "bitcoin",
  "wheelchair-accessible",
  "vegan",
  "outdoor-seating",
  "wifi",
  "family-friendly",
  "pet-friendly",
  "parking",
  "open-late",
  "cozy",
];

export function TagForm({ osmType, osmId, onClose }: TagFormProps) {
  const { session, publicKey } = useAuth();
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedLabel = label.trim().toLowerCase().replace(/\s+/g, "-");
  const canSubmit = normalizedLabel.length >= 1 && normalizedLabel.length <= 20;

  const handleSubmit = async (tagLabel?: string) => {
    const finalLabel = tagLabel || normalizedLabel;
    if (!session || !publicKey || !finalLabel) return;
    setError(null);
    setSubmitting(true);

    try {
      const result = createPlaceTag(publicKey, osmType, osmId, finalLabel);
      await session.storage.putText(result.path as `/pub/${string}`, result.json);
      await ingestUserIntoNexus(publicKey);

      const uri = makeOsmUrl(osmType, osmId);
      queryClient.invalidateQueries({
        queryKey: ["resource", "tags", uri],
      });
      queryClient.invalidateQueries({
        queryKey: ["mapky", "place", osmType, osmId],
      });

      toast.success(`Tagged with "${finalLabel}"`);
      setLabel("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-foreground">Tag this place</h4>
        <button
          onClick={onClose}
          className="rounded p-1 text-muted transition-colors hover:bg-background hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canSubmit) handleSubmit();
          }}
          placeholder="e.g. bitcoin, cozy, wifi"
          maxLength={20}
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <button
          onClick={() => handleSubmit()}
          disabled={!canSubmit || submitting}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>

      {normalizedLabel && normalizedLabel !== label.trim() && (
        <p className="text-xs text-muted">
          Will be saved as: <span className="font-mono">{normalizedLabel}</span>
        </p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {SUGGESTED_TAGS.map((tag) => (
          <button
            key={tag}
            onClick={() => handleSubmit(tag)}
            disabled={submitting}
            className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {tag}
          </button>
        ))}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
