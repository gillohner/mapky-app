import { createFileRoute } from "@tanstack/react-router";
import { SequenceDetailPanel } from "@/components/capture/SequenceDetailPanel";

export const Route = createFileRoute("/sequence/$authorId/$sequenceId")({
  component: SequenceDetailRoute,
});

function SequenceDetailRoute() {
  const { authorId, sequenceId } = Route.useParams();
  return <SequenceDetailPanel authorId={authorId} sequenceId={sequenceId} />;
}
