import { useState, useRef, useEffect } from "react";
import { Send, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/AuthProvider";
import { createPlaceTag } from "@/lib/mapky-specs";
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
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const normalizedLabel = label.trim().toLowerCase().replace(/\s+/g, "-");
  const canSubmit = normalizedLabel.length >= 1 && normalizedLabel.length <= 20;

  const filtered = normalizedLabel
    ? SUGGESTED_TAGS.filter((t) => t.includes(normalizedLabel))
    : SUGGESTED_TAGS;

  // Reset selected index when filtered list changes
  useEffect(() => {
    setSelectedIndex(-1);
  }, [label]);

  const handleSubmit = async (tagLabel?: string) => {
    const finalLabel = tagLabel || normalizedLabel;
    if (!session || !publicKey || !finalLabel) return;
    setError(null);
    setSubmitting(true);
    setDropdownOpen(false);

    try {
      const result = createPlaceTag(publicKey, osmType, osmId, finalLabel);
      await session.storage.putText(result.path as `/pub/${string}`, result.json);
      await ingestUserIntoNexus(publicKey);

      queryClient.invalidateQueries({
        queryKey: ["mapky", "place", osmType, osmId, "tags"],
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!dropdownOpen || filtered.length === 0) {
      if (e.key === "Enter" && canSubmit) handleSubmit();
      if (e.key === "ArrowDown" && filtered.length > 0) {
        setDropdownOpen(true);
        setSelectedIndex(0);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((i) => (i <= 0 ? -1 : i - 1));
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < filtered.length) {
          handleSubmit(filtered[selectedIndex]);
        } else if (canSubmit) {
          handleSubmit();
        }
        break;
      case "Escape":
        setDropdownOpen(false);
        setSelectedIndex(-1);
        break;
    }
  };

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const item = listRef.current.children[selectedIndex] as HTMLElement;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

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

      <div className="relative">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              setDropdownOpen(true);
            }}
            onFocus={() => setDropdownOpen(true)}
            onBlur={() => {
              // Delay to allow click on dropdown item
              setTimeout(() => setDropdownOpen(false), 150);
            }}
            onKeyDown={handleKeyDown}
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

        {dropdownOpen && filtered.length > 0 && (
          <ul
            ref={listRef}
            className="absolute z-20 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-border bg-background shadow-lg"
          >
            {filtered.map((tag, i) => (
              <li
                key={tag}
                onMouseDown={() => handleSubmit(tag)}
                className={`cursor-pointer px-3 py-1.5 text-sm ${
                  i === selectedIndex
                    ? "bg-accent/10 text-accent"
                    : "text-foreground hover:bg-surface"
                }`}
              >
                {tag}
              </li>
            ))}
          </ul>
        )}
      </div>

      {normalizedLabel && normalizedLabel !== label.trim() && (
        <p className="text-xs text-muted">
          Will be saved as: <span className="font-mono">{normalizedLabel}</span>
        </p>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
