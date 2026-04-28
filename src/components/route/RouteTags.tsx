import { useRouteTags } from "@/lib/api/hooks";
import { createRouteTag } from "@/lib/mapky-specs";
import { TagStrip } from "@/components/shared/TagStrip";

interface RouteTagsProps {
  authorId: string;
  routeId: string;
}

export function RouteTags({ authorId, routeId }: RouteTagsProps) {
  const { data: tags } = useRouteTags(authorId, routeId);
  return (
    <TagStrip
      tags={tags}
      queryKey={["mapky", "route", authorId, routeId, "tags"]}
      buildTag={(publicKey, label) =>
        createRouteTag(publicKey, authorId, routeId, label)
      }
      theme="violet"
      inputMode="free"
    />
  );
}
