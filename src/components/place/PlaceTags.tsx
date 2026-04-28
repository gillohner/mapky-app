import { useQueryClient } from "@tanstack/react-query";
import { usePlaceTags } from "@/lib/api/hooks";
import { createPlaceTag } from "@/lib/mapky-specs";
import { TagStrip } from "@/components/shared/TagStrip";
import type { PlaceDetails } from "@/types/mapky";

interface PlaceTagsProps {
  osmType: string;
  osmId: number;
}

export function PlaceTags({ osmType, osmId }: PlaceTagsProps) {
  const { data: tags } = usePlaceTags(osmType, osmId);
  const queryClient = useQueryClient();

  return (
    <TagStrip
      tags={tags}
      queryKey={["mapky", "place", osmType, osmId, "tags"]}
      buildTag={(publicKey, label) =>
        createPlaceTag(publicKey, osmType, osmId, label)
      }
      theme="accent"
      inputMode="none"
      title="Tags"
      // Keep PlaceDetails.tag_count consistent with the chip strip — used
      // by other surfaces that show the badge before they refetch.
      onCountDelta={(delta) =>
        queryClient.setQueryData<PlaceDetails>(
          ["mapky", "place", osmType, osmId],
          (old) => (old ? { ...old, tag_count: old.tag_count + delta } : old),
        )
      }
    />
  );
}
