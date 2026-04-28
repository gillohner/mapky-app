import { createFileRoute } from "@tanstack/react-router";
import { PlaceList } from "@/components/place/PlaceList";

export const Route = createFileRoute("/places")({
  component: PlaceList,
});
