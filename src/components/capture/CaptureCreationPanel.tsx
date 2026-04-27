import { useEffect } from "react";
import { ArrowLeft, X } from "lucide-react";
import { useCaptureCreationStore, CAPTURE_STEPS, type CaptureStep } from "@/stores/capture-creation-store";
import { PickStep } from "./steps/PickStep";
import { PlaceStep } from "./steps/PlaceStep";
import { CaptionStep } from "./steps/CaptionStep";
import { TagStep } from "./steps/TagStep";
import { ReviewStep } from "./steps/ReviewStep";

const STEP_TITLES: Record<CaptureStep, string> = {
  pick: "Pick your capture",
  place: "Place & aim on the map",
  caption: "Add a caption",
  tag: "Tag this capture",
  review: "Review & publish",
};

export function CaptureCreationPanel() {
  const isOpen = useCaptureCreationStore((s) => s.isOpen);
  const step = useCaptureCreationStore((s) => s.step);
  const close = useCaptureCreationStore((s) => s.close);
  const prev = useCaptureCreationStore((s) => s.prev);
  const isPublishing = useCaptureCreationStore((s) => s.isPublishing);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPublishing) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, isPublishing, close]);

  if (!isOpen) return null;

  const stepIdx = CAPTURE_STEPS.indexOf(step);
  const canGoBack = stepIdx > 0 && !isPublishing;

  return (
    <>
      {/* Interactive place step needs the map visible — skip backdrop */}
      {step !== "place" && (
        <div
          className="pointer-events-auto fixed inset-0 z-40 bg-black/30 backdrop-blur-sm md:hidden"
          onClick={() => {
            if (!isPublishing) close();
          }}
        />
      )}

      {/* Panel: bottom sheet on mobile, right sidebar on desktop.
          Interactive map step renders a compact sheet so the map stays usable. */}
      <div
        className={`pointer-events-auto fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl border-t border-border bg-background shadow-2xl md:inset-y-0 md:right-0 md:left-auto md:w-[28rem] md:rounded-none md:rounded-l-2xl md:border-l md:border-t-0 ${
          step === "place"
            ? "max-h-[50dvh] md:max-h-none"
            : "max-h-[90dvh] md:max-h-none"
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="capture-panel-title"
      >
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-2 md:hidden">
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            {canGoBack ? (
              <button
                type="button"
                onClick={prev}
                className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-foreground"
                aria-label="Back"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            ) : (
              <div className="w-7" />
            )}
            <h2
              id="capture-panel-title"
              className="truncate text-base font-semibold text-foreground"
            >
              {STEP_TITLES[step]}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!isPublishing) close();
            }}
            disabled={isPublishing}
            className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-foreground disabled:opacity-30"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 border-b border-border px-4 py-2">
          {CAPTURE_STEPS.map((s, i) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all ${
                i === stepIdx
                  ? "w-6 bg-sky-500"
                  : i < stepIdx
                    ? "w-1.5 bg-sky-500/60"
                    : "w-1.5 bg-border"
              }`}
            />
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {step === "pick" && <PickStep />}
          {step === "place" && <PlaceStep />}
          {step === "caption" && <CaptionStep />}
          {step === "tag" && <TagStep />}
          {step === "review" && <ReviewStep />}
        </div>
      </div>
    </>
  );
}
