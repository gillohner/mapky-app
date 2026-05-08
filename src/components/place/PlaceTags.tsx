import { useQueryClient } from "@tanstack/react-query";
import { usePlaceTags } from "@/lib/api/hooks";
import { createPlaceTag } from "@/lib/mapky-specs";
import { TagStrip } from "@/components/shared/TagStrip";
import type { PlaceDetails, PlaceFullResponse } from "@/types/mapky";

interface PlaceTagsProps {
  osmType: string;
  osmId: number;
}

export function PlaceTags({ osmType, osmId }: PlaceTagsProps) {
  // Reads from the per-endpoint /tags cache rather than the
  // composite-place slice so TagStrip's optimistic-update path
  // (`setQueryData<PostTagDetails[]>(queryKey, ...)`) keeps writing
  // to a `PostTagDetails[]`-shaped value. Migrating the read path
  // would require teaching TagStrip how to slice a `PlaceFullResponse`
  // shape — out of scope for this round; tracked in BACKLOG.md.
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
      // Mirror tag_count into both caches: the legacy place-detail
      // cache (still used by SelectedPlaceMarker, CollectionPlaces,
      // PlaceDirectionsButton) AND the composite cache that
      // PlacePanel/PlaceHeader read from.
      onCountDelta={(delta) => {
        queryClient.setQueryData<PlaceDetails>(
          ["mapky", "place", osmType, osmId],
          (old) => (old ? { ...old, tag_count: old.tag_count + delta } : old),
        );
        queryClient.setQueryData<PlaceFullResponse>(
          ["mapky", "place-full", osmType, osmId],
          (old) =>
            old
              ? {
                  ...old,
                  detail: {
                    ...old.detail,
                    tag_count: old.detail.tag_count + delta,
                  },
                }
              : old,
        );
      }}
    />
  );
}
