import { useState } from "react";
import { Tag, X, Plus, Layers, Image as ImageIcon } from "lucide-react";
import {
  useCaptureCreationStore,
  useIsBatch,
} from "@/stores/capture-creation-store";

export function TagStep() {
  const pendingTags = useCaptureCreationStore((s) => s.pendingTags);
  const addTag = useCaptureCreationStore((s) => s.addTag);
  const removeTag = useCaptureCreationStore((s) => s.removeTag);
  const targetSequence = useCaptureCreationStore((s) => s.targetSequence);
  const items = useCaptureCreationStore((s) => s.items);
  const isBatch = useIsBatch();
  const next = useCaptureCreationStore((s) => s.next);

  const [label, setLabel] = useState("");
  const normalized = label.trim().toLowerCase().replace(/\s+/g, "-");

  const commit = (value?: string) => {
    const v = (value ?? normalized).trim();
    if (!v || v.length > 20) return;
    addTag(v);
    setLabel("");
  };

  // Three distinct targets:
  //   - new single capture → tag rides the capture URI
  //   - new batch (sequence) → tag rides the sequence URI
  //   - append-to-existing-sequence → tag rides each NEW capture URI
  //     (the sequence's own tags belong to the sequence detail panel)
  const targetCopy = targetSequence
    ? {
        icon: ImageIcon,
        title: `Tagging ${items.length} new capture${items.length === 1 ? "" : "s"}`,
        body: `These tags ride only the capture${items.length === 1 ? "" : "s"} you're adding. The sequence's own tags stay as they are.`,
      }
    : isBatch
      ? {
          icon: Layers,
          title: "Tagging the sequence",
          body: "Tags target the sequence as a whole — discovery by tag will surface this whole sequence, not individual members.",
        }
      : {
          icon: Tag,
          title: "Tagging this capture",
          body: "Tags help others discover your capture. They publish as separate records after the capture itself.",
        };
  const Icon = targetCopy.icon;

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-start gap-2 rounded-xl bg-sky-500/10 p-3 text-xs text-sky-700 dark:text-sky-300">
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <div>
          <div className="font-medium">{targetCopy.title}</div>
          <div className="mt-0.5 text-sky-700/80 dark:text-sky-300/80">
            {targetCopy.body}
          </div>
        </div>
      </div>

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
