import { createFileRoute } from "@tanstack/react-router";
import { CaptureDetailPanel } from "@/components/capture/CaptureDetailPanel";

export const Route = createFileRoute("/capture/$authorId/$captureId")({
  component: CaptureDetailRoute,
});

function CaptureDetailRoute() {
  const { authorId, captureId } = Route.useParams();
  return <CaptureDetailPanel authorId={authorId} captureId={captureId} />;
}
