import type { MapkyResourceType } from "@/lib/api/mapky";
import { ReplyThread } from "./ReplyThread";

interface ResourceDiscussionProps {
  resourceType: MapkyResourceType;
  authorId: string;
  resourceId: string;
  /** Short label shown above the composer when starting a top-level thread. */
  parentPreview?: string;
  /** Section heading. Default "Discussion" — call sites can override. */
  title?: string;
}

/**
 * Drop-in section that wraps `ReplyThread` with a heading.
 *
 * Mount on any MapKy resource detail panel (route, collection, geo-capture,
 * sequence, incident, review) to give users threaded `:MapkyAppPost`
 * comments anchored to that resource via `[:REPLY_TO]`.
 */
export function ResourceDiscussion({
  resourceType,
  authorId,
  resourceId,
  parentPreview,
  title = "Discussion",
}: ResourceDiscussionProps) {
  return (
    <div className="border-t border-border pt-4">
      <h3 className="mb-2 text-sm font-medium text-foreground">{title}</h3>
      <ReplyThread
        resourceType={resourceType}
        authorId={authorId}
        resourceId={resourceId}
        parentPreview={parentPreview}
      />
    </div>
  );
}
