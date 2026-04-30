import { Search, X } from "lucide-react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Active filter tags. Click a chip to remove it. */
  activeTags?: string[];
  onRemoveTag?: (tag: string) => void;
  /** Suggested tag chips (from current list) — clicking adds to active set. */
  suggestedTags?: string[];
  onAddTag?: (tag: string) => void;
}

/**
 * Compact filter strip used at the top of every discover list. A free-
 * text search box, plus optional active-tag chips and a horizontally
 * scrollable suggestion strip pulled from the visible items. The list
 * does the actual filtering — this component is presentation only.
 */
export function DiscoverFilter({
  value,
  onChange,
  placeholder,
  activeTags = [],
  onRemoveTag,
  suggestedTags = [],
  onAddTag,
}: Props) {
  return (
    <div className="mb-3 space-y-1.5">
      <div className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1.5">
        <Search className="h-3.5 w-3.5 flex-shrink-0 text-muted" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "Filter…"}
          className="w-full bg-transparent text-xs text-foreground placeholder:text-muted focus:outline-none"
        />
        {value && (
          <button
            onClick={() => onChange("")}
            className="flex-shrink-0 text-muted hover:text-foreground"
            aria-label="Clear filter"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {activeTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {activeTags.map((t) => (
            <button
              key={t}
              onClick={() => onRemoveTag?.(t)}
              className="flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-white hover:bg-accent-hover"
              aria-label={`Remove tag ${t}`}
            >
              <span>#{t}</span>
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}

      {suggestedTags.length > 0 && (
        <div className="flex flex-wrap gap-1 overflow-x-auto">
          {suggestedTags.map((t) => (
            <button
              key={t}
              onClick={() => onAddTag?.(t)}
              className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-muted transition-colors hover:border-accent hover:text-foreground"
            >
              #{t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
