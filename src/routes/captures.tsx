import { createFileRoute } from "@tanstack/react-router";
import { CaptureList } from "@/components/capture/CaptureList";

export const Route = createFileRoute("/captures")({
  component: CaptureList,
});
