import { MessageSquare, Layers } from "lucide-react";
import {
  useCaptureCreationStore,
  useIsBatch,
} from "@/stores/capture-creation-store";

const MAX_CAPTION = 300;
const MAX_SEQ_NAME = 200;

export function CaptionStep() {
  const caption = useCaptureCreationStore((s) => s.caption);
  const setCaption = useCaptureCreationStore((s) => s.setCaption);
  const sequenceName = useCaptureCreationStore((s) => s.sequenceName);
  const setSequenceName = useCaptureCreationStore((s) => s.setSequenceName);
  const sequenceDescription = useCaptureCreationStore(
    (s) => s.sequenceDescription,
  );
  const setSequenceDescription = useCaptureCreationStore(
    (s) => s.setSequenceDescription,
  );
  const items = useCaptureCreationStore((s) => s.items);
  const next = useCaptureCreationStore((s) => s.next);
  const isBatch = useIsBatch();

  const captionRemaining = MAX_CAPTION - caption.length;
  const tooLong = captionRemaining < 0;

  if (isBatch) {
    return (
      <div className="flex h-full flex-col gap-4 p-4">
        <div className="flex items-start gap-2 rounded-xl bg-sky-500/10 p-3 text-xs text-sky-700 dark:text-sky-300">
          <Layers className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Name your sequence of <strong>{items.length}</strong> captures.
            This is how it appears in listings and on the map.
          </span>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">
            Sequence name
          </label>
          <input
            type="text"
            value={sequenceName}
            onChange={(e) => setSequenceName(e.target.value)}
            placeholder="e.g. Walk along the Reuss river"
            maxLength={MAX_SEQ_NAME}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
          />
        </div>

        <div className="relative">
          <label className="mb-1 block text-xs font-medium text-foreground">
            Description <span className="text-muted">(optional)</span>
          </label>
          <textarea
            value={sequenceDescription}
            onChange={(e) => setSequenceDescription(e.target.value)}
            placeholder="What is this sequence about?"
            rows={3}
            maxLength={MAX_CAPTION + 50}
            className="w-full resize-none rounded-xl border border-border bg-background p-3 text-sm text-foreground placeholder:text-muted focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
          />
        </div>

        <button
          type="button"
          onClick={next}
          className="mt-auto w-full rounded-xl bg-sky-500 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-sky-600"
        >
          Continue
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-start gap-2 text-xs text-muted">
        <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Add a caption describing this capture. Visible when people open it.
        </span>
      </div>

      <div className="relative">
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Tell people about this place…"
          rows={6}
          maxLength={MAX_CAPTION + 50}
          className="w-full resize-none rounded-xl border border-border bg-background p-3 text-sm text-foreground placeholder:text-muted focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
        />
        <div
          className={`absolute bottom-2 right-3 text-[10px] tabular-nums ${
            tooLong ? "text-red-500" : "text-muted"
          }`}
        >
          {captionRemaining}
        </div>
      </div>

      <button
        type="button"
        disabled={tooLong}
        onClick={next}
        className="mt-auto w-full rounded-xl bg-sky-500 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-border disabled:text-muted"
      >
        {caption ? "Continue" : "Skip"}
      </button>
    </div>
  );
}
