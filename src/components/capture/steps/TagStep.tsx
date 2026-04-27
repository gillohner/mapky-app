import { useState } from "react";
import { Tag, X, Plus } from "lucide-react";
import { useCaptureCreationStore } from "@/stores/capture-creation-store";

const SUGGESTED_TAGS = [
  "streetview",
  "landmark",
  "hidden-gem",
  "nature",
  "architecture",
  "graffiti",
  "skyline",
  "sunset",
  "needs-review",
];

export function TagStep() {
  const pendingTags = useCaptureCreationStore((s) => s.pendingTags);
  const addTag = useCaptureCreationStore((s) => s.addTag);
  const removeTag = useCaptureCreationStore((s) => s.removeTag);
  const next = useCaptureCreationStore((s) => s.next);

  const [label, setLabel] = useState("");
  const normalized = label.trim().toLowerCase().replace(/\s+/g, "-");

  const commit = (value?: string) => {
    const v = (value ?? normalized).trim();
    if (!v || v.length > 20) return;
    addTag(v);
    setLabel("");
  };

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-start gap-2 text-xs text-muted">
        <Tag className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Tags help others discover your capture. Add up to a handful — they'll
          be published as separate events after the capture.
        </span>
      </div>

      {/* Selected tags */}
      {pendingTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {pendingTags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-700 dark:text-sky-300"
            >
              {t}
              <button
                type="button"
                onClick={() => removeTag(t)}
                className="rounded-full p-0.5 hover:bg-sky-500/20"
                aria-label={`Remove ${t}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-500/20">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          placeholder="Add a tag…"
          maxLength={20}
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted focus:outline-none"
        />
        <button
          type="button"
          onClick={() => commit()}
          disabled={!normalized}
          className="rounded-lg p-1 text-sky-600 hover:bg-sky-500/10 disabled:opacity-30"
          aria-label="Add tag"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Suggestions */}
      <div>
        <div className="mb-2 text-[10px] uppercase tracking-wide text-muted">
          Suggestions
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTED_TAGS.filter((t) => !pendingTags.includes(t)).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => commit(t)}
              className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted transition-all hover:border-sky-500/60 hover:bg-sky-500/5 hover:text-sky-700 dark:hover:text-sky-300"
            >
              + {t}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={next}
        className="mt-auto w-full rounded-xl bg-sky-500 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-sky-600"
      >
        {pendingTags.length > 0 ? "Continue" : "Skip"}
      </button>
    </div>
  );
}
