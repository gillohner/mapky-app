import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePlaceFullTags } from "@/lib/api/hooks";
import { fetchOsmResourceTags } from "@/lib/api/mapky";
import { createPlaceTag, makeOsmUrl } from "@/lib/mapky-specs";
import { TagStrip } from "@/components/shared/TagStrip";
import type {
  PlaceDetails,
  PlaceFullResponse,
  PostTagDetails,
} from "@/types/mapky";

interface PlaceTagsProps {
  osmType: string;
  osmId: number;
}

function emptyPlaceFull(osmType: string, osmId: number): PlaceFullResponse {
  return {
    detail: {
      osm_canonical: makeOsmUrl(osmType, osmId),
      osm_type: osmType,
      osm_id: osmId,
      lat: 0,
      lon: 0,
      geocoded: false,
      review_count: 0,
      avg_rating: 0,
      tag_count: 0,
      photo_count: 0,
      indexed_at: Math.floor(Date.now() / 1000),
      name: null,
    },
    reviews: [],
    posts: [],
    tags: [],
    routes: [],
  };
}

/**
 * Tag chip strip on a place panel. Reads + writes the composite
 * place-detail cache (`/place/{type}/{id}/full`) so opening a place
 * fires ONE network round-trip total instead of one for the panel
 * envelope plus a second for the dedicated `/tags` endpoint.
 *
 * The composite cache holds tags as a slice of `PlaceFullResponse`
 * rather than as a top-level `PostTagDetails[]`, so we hand TagStrip
 * `mutate` + `refresh` callbacks (composite-aware) instead of the
 * usual `queryKey`. The caller-side updater patches the slice; the
  * legacy per-endpoint cache is mirrored in `onCountDelta` so any
  * non-PlacePanel surface (`SelectedPlaceMarker`, `PlaceDirectionsButton`)
  * that still reads the legacy cache stays in sync on tag_count.
 */
export function PlaceTags({ osmType, osmId }: PlaceTagsProps) {
  const { data: placeFullTags } = usePlaceFullTags(osmType, osmId);
  const queryClient = useQueryClient();
  const fullKey = ["mapky", "place-full", osmType, osmId] as const;
  const resourceTagsKey = ["mapky", "place", osmType, osmId, "resource-tags"] as const;
  const { data: resourceTags } = useQuery({
    queryKey: resourceTagsKey,
    queryFn: () => fetchOsmResourceTags(osmType, osmId),
    enabled: !!osmType && !!osmId && (!placeFullTags || placeFullTags.length === 0),
    retry: false,
  });
  const tags = placeFullTags && placeFullTags.length > 0 ? placeFullTags : resourceTags;

  return (
    <TagStrip
      tags={tags}
      buildTag={(publicKey, label) =>
        createPlaceTag(publicKey, osmType, osmId, label)
      }
      mutate={async (updater) => {
        await queryClient.cancelQueries({ queryKey: fullKey });
        queryClient.setQueryData<PlaceFullResponse>(fullKey, (old) => {
          const base = old ?? emptyPlaceFull(osmType, osmId);
          const nextTags = updater(base.tags) ?? [];
          return { ...base, tags: nextTags };
        });
        // Also feed the legacy per-endpoint /tags cache so any non-
        // composite consumer (e.g. PlaceList row tag chips) sees the
        // optimistic state too.
        queryClient.setQueryData<PostTagDetails[]>(
          ["mapky", "place", osmType, osmId, "tags"],
          (old) => updater(old),
        );
        queryClient.setQueryData<PostTagDetails[]>(resourceTagsKey, (old) =>
          updater(old),
        );
      }}
      refresh={() => {
        queryClient.invalidateQueries({ queryKey: fullKey });
        queryClient.invalidateQueries({ queryKey: resourceTagsKey });
        queryClient.invalidateQueries({
          queryKey: ["mapky", "place", osmType, osmId, "tags"],
        });
      }}
      theme="accent"
      inputMode="free"
      title="Tags"
      onCountDelta={(delta) => {
        // Mirror tag_count into both detail caches so the place
        // panel header AND non-PlacePanel surfaces stay in sync.
        queryClient.setQueryData<PlaceDetails>(
          ["mapky", "place", osmType, osmId],
          (old) => (old ? { ...old, tag_count: old.tag_count + delta } : old),
        );
        queryClient.setQueryData<PlaceFullResponse>(fullKey, (old) =>
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
