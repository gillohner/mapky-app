import { useReviewTags } from "@/lib/api/hooks";
import { createReviewTag } from "@/lib/mapky-specs";
import { TagStrip } from "@/components/shared/TagStrip";

interface ReviewTagsProps {
  authorId: string;
  reviewId: string;
}

export function ReviewTags({ authorId, reviewId }: ReviewTagsProps) {
  const { data: tags } = useReviewTags(authorId, reviewId);
  return (
    <TagStrip
      tags={tags}
      queryKey={["mapky", "reviews", authorId, reviewId, "tags"]}
      buildTag={(publicKey, label) =>
        createReviewTag(publicKey, authorId, reviewId, label)
      }
      theme="accent"
      inputMode="free"
    />
  );
}
