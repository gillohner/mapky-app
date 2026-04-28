import { useGeoCaptureTags } from "@/lib/api/hooks";
import { createGeoCaptureTag } from "@/lib/mapky-specs";
import { TagStrip } from "@/components/shared/TagStrip";

interface CaptureTagsProps {
  authorId: string;
  captureId: string;
}

export function CaptureTags({ authorId, captureId }: CaptureTagsProps) {
  const { data: tags } = useGeoCaptureTags(authorId, captureId);
  return (
    <TagStrip
      tags={tags}
      queryKey={["mapky", "geo_capture", authorId, captureId, "tags"]}
      buildTag={(publicKey, label) =>
        createGeoCaptureTag(publicKey, authorId, captureId, label)
      }
      theme="sky"
      inputMode="free"
    />
  );
}
