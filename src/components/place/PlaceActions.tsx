import { MessageSquarePlus, TagIcon } from "lucide-react";

export function PlaceActions() {
  return (
    <div className="flex gap-2">
      <button
        disabled
        className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm font-medium text-muted opacity-50"
        title="Coming soon"
      >
        <MessageSquarePlus className="h-4 w-4" />
        Write Review
      </button>
      <button
        disabled
        className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm font-medium text-muted opacity-50"
        title="Coming soon"
      >
        <TagIcon className="h-4 w-4" />
        Add Tag
      </button>
    </div>
  );
}
