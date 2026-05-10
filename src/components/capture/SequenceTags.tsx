import { useQueryClient } from "@tanstack/react-query";
import { useSequenceFullTags } from "@/lib/api/hooks";
import { createSequenceTag } from "@/lib/mapky-specs";
import { TagStrip } from "@/components/shared/TagStrip";
import type {
  PostTagDetails,
  SequenceFullResponse,
} from "@/types/mapky";

interface SequenceTagsProps {
  authorId: string;
  sequenceId: string;
}

/**
 * Tag strip on a sequence detail page. Reads + writes the composite
 * `/sequences/{author}/{id}/full` cache so opening the panel fires
 * one network round-trip total (no separate /tags request).
 *
 * Composite-aware via `mutate` + `refresh` callbacks (the same API
 * `PlaceTags` uses). The legacy per-endpoint `/tags` cache is also
 * mirrored on the optimistic write so any stand-alone consumer
 * (search-result rows, future tag chips) sees the change too.
 */
export function SequenceTags({ authorId, sequenceId }: SequenceTagsProps) {
  const { data: tags } = useSequenceFullTags(authorId, sequenceId);
  const queryClient = useQueryClient();
  const fullKey = ["mapky", "sequence-full", authorId, sequenceId] as const;

  return (
    <TagStrip
      tags={tags}
      buildTag={(publicKey, label) =>
        createSequenceTag(publicKey, authorId, sequenceId, label)
      }
      mutate={async (updater) => {
        await queryClient.cancelQueries({ queryKey: fullKey });
        queryClient.setQueryData<SequenceFullResponse>(fullKey, (old) => {
          if (!old) return old;
          const nextTags = updater(old.tags) ?? [];
          return { ...old, tags: nextTags };
        });
        queryClient.setQueryData<PostTagDetails[]>(
          ["mapky", "sequence", authorId, sequenceId, "tags"],
          (old) => updater(old),
        );
      }}
      refresh={() => {
        queryClient.invalidateQueries({ queryKey: fullKey });
        queryClient.invalidateQueries({
          queryKey: ["mapky", "sequence", authorId, sequenceId, "tags"],
        });
      }}
      theme="violet"
      inputMode="free"
      title="Tags"
    />
  );
}
