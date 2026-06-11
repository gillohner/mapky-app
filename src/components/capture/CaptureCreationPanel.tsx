import { useEffect } from "react";
import {
  useCaptureCreationStore,
  useIsBatch,
  CAPTURE_STEPS,
  type CaptureStep,
} from "@/stores/capture-creation-store";
import { DiscoverSidebar } from "@/components/discover/DiscoverSidebar";
import { PickStep } from "./steps/PickStep";
import { PlaceStep } from "./steps/PlaceStep";
import { CaptionStep } from "./steps/CaptionStep";
import { TagStep } from "./steps/TagStep";
import { ReviewStep } from "./steps/ReviewStep";

const SINGLE_STEP_TITLES: Record<CaptureStep, string> = {
  pick: "Pick your capture",
  place: "Place & aim on the map",
  caption: "Add a caption",
  tag: "Tag this capture",
  review: "Review & publish",
};

const NEW_SEQUENCE_STEP_TITLES: Record<CaptureStep, string> = {
  pick: "Pick your captures",
  place: "Place & aim each capture",
  caption: "Name the sequence",
  tag: "Tag the sequence",
  review: "Review & publish",
};

const APPEND_STEP_TITLES: Record<CaptureStep, string> = {
  pick: "Pick captures to add",
  place: "Place & aim each capture",
  caption: "Sequence details",
  tag: "Tag the new captures",
  review: "Review & add",
};

/**
 * Capture creation wizard. Lives in the same shared shell every other
 * action surface uses (`<DiscoverSidebar />`):
 *
 *   - **Desktop**: 380px left-anchored sidebar past the IconRail —
 *     same slot as Places / Captures / Routes lists.
 *   - **Mobile**: draggable bottom sheet (`<MobileBottomSheet />`)
 *     with the standard 3 snap positions. The "place" step starts
 *     COLLAPSED so the map is fully visible while the user is
 *     placing the marker; other steps default to the middle snap.
 *
 * Wizard navigation maps cleanly onto DiscoverSidebar's slots: the
 * step title becomes the panel title, the per-step "back" arrow uses
 * `onBack` (only when `canGoBack`), the "X" closes the wizard, and
 * the progress dots ride the `toolbar` slot.
 */
export function CaptureCreationPanel() {
  const isOpen = useCaptureCreationStore((s) => s.isOpen);
  const step = useCaptureCreationStore((s) => s.step);
  const close = useCaptureCreationStore((s) => s.close);
  const prev = useCaptureCreationStore((s) => s.prev);
  const isPublishing = useCaptureCreationStore((s) => s.isPublishing);
  const targetSequence = useCaptureCreationStore((s) => s.targetSequence);
  const isBatch = useIsBatch();

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

  const onBack = canGoBack ? prev : undefined;
  const onClose = () => {
    if (!isPublishing) close();
  };

  const titles = targetSequence
    ? APPEND_STEP_TITLES
    : isBatch
      ? NEW_SEQUENCE_STEP_TITLES
      : SINGLE_STEP_TITLES;

  return (
    <DiscoverSidebar
      title={titles[step]}
      onClose={onClose}
      onBack={onBack}
      // Place step needs the map visible — start the mobile sheet
      // collapsed so the user can drop a marker without dragging the
      // sheet out of the way first.
      mobileCollapsible={step === "place"}
      toolbar={
        <div
          className="flex items-center justify-center gap-1.5"
          aria-label={`Step ${stepIdx + 1} of ${CAPTURE_STEPS.length}`}
        >
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
      }
    >
      {step === "pick" && <PickStep />}
      {step === "place" && <PlaceStep />}
      {step === "caption" && <CaptionStep />}
      {step === "tag" && <TagStep />}
      {step === "review" && <ReviewStep />}
    </DiscoverSidebar>
  );
}
