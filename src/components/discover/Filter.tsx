import { Search, X } from "lucide-react";

export type TagMode = "any" | "all";

export interface CategoryOption {
  value: string;
  label: string;
  /** Optional count badge after the label. */
  count?: number;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Active filter tags. Click a chip to remove. */
  activeTags?: string[];
  onRemoveTag?: (tag: string) => void;
  /** Suggested tag chips (from current list). Click to add. */
  suggestedTags?: string[];
  onAddTag?: (tag: string) => void;
  /**
   * Whether to require ALL active tags to match (default) or ANY
   * single match. When set, a small toggle is rendered next to the
   * tag chips.
   */
  tagMode?: TagMode;
  onTagModeChange?: (mode: TagMode) => void;
  /** Optional category chips above the search box (single-select). */
  categories?: CategoryOption[];
  /** Active category (null = "All"). */
  activeCategory?: string | null;
  onCategoryChange?: (value: string | null) => void;
}

/**
 * Compact filter strip used at the top of every discover list. Layers:
 *
 *   1. (optional) Category chips — single-select, "All" resets.
 *   2. Free-text search box — name / description / tag substring.
 *   3. Active-tag chips with optional ALL / ANY mode toggle.
 *   4. Suggested-tag chips ranked by frequency in the visible items.
 *
 * Presentation only — the list owns the actual filtering logic.
 */
export function DiscoverFilter({
  value,
  onChange,
  placeholder,
  activeTags = [],
  onRemoveTag,
  suggestedTags = [],
  onAddTag,
  tagMode,
  onTagModeChange,
  categories,
  activeCategory,
  onCategoryChange,
}: Props) {
  return (
    <div className="mb-3 space-y-1.5">
      {categories && categories.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <CategoryChip
            label="All"
            active={!activeCategory}
            onClick={() => onCategoryChange?.(null)}
          />
          {categories.map((c) => (
            <CategoryChip
              key={c.value}
              label={c.count != null ? `${c.label} ${c.count}` : c.label}
              active={activeCategory === c.value}
              onClick={() =>
                onCategoryChange?.(activeCategory === c.value ? null : c.value)
              }
            />
          ))}
        </div>
      )}

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
        <div className="flex flex-wrap items-center gap-1">
          {activeTags.map((t) => (
            <button
              key={t}
              onClick={() => onRemoveTag?.(t)}
              className="flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-white hover:bg-accent-hover"
              aria-label={`Remove tag ${t}`}
            >
              <span>{t}</span>
              <X className="h-3 w-3" />
            </button>
          ))}
          {tagMode && onTagModeChange && activeTags.length > 1 && (
            <button
              onClick={() =>
                onTagModeChange(tagMode === "all" ? "any" : "all")
              }
              title={
                tagMode === "all"
                  ? "Match places with ALL of these tags"
                  : "Match places with ANY of these tags"
              }
              className="ml-1 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] uppercase text-muted transition-colors hover:border-accent hover:text-foreground"
            >
              {tagMode === "all" ? "ALL" : "ANY"}
            </button>
          )}
        </div>
      )}

      {suggestedTags.length > 0 && (
        <div className="flex flex-wrap gap-1 overflow-x-auto">
          {suggestedTags.map((t) => (
            <button
              key={t}
              onClick={() => onAddTag?.(t)}
              className="rounded-full border border-border bg-background px-2.5 py-0.5 text-xs text-muted transition-colors hover:border-accent hover:text-foreground"
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-2 py-0.5 text-[10px] capitalize transition-colors ${
        active
          ? "border-accent bg-accent text-white"
          : "border-border bg-background text-muted hover:border-accent hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}
