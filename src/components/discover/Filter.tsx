import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";

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
        <CategoryDropdown
          categories={categories}
          activeCategory={activeCategory ?? null}
          onChange={(v) => onCategoryChange?.(v)}
        />
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

/**
 * Keyboard-friendly dropdown for the single-select category filter.
 * Same shape as `TagForm`'s autocomplete: button toggles a listbox,
 * ArrowUp/Down moves the highlight, Enter selects, Escape closes.
 * Click-outside closes too. Replaces a native `<select>` so the
 * styling matches the rest of the discover sidebar.
 */
function CategoryDropdown({
  categories,
  activeCategory,
  onChange,
}: {
  categories: CategoryOption[];
  activeCategory: string | null;
  onChange: (value: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  // -1 = "All types" row, 0..n-1 = category indices.
  const [highlight, setHighlight] = useState<number>(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const active = categories.find((c) => c.value === activeCategory);
  const selectedLabel = active
    ? active.count != null
      ? `${active.label} (${active.count})`
      : active.label
    : "All types";

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // Reset highlight to the active row whenever the dropdown opens.
  useEffect(() => {
    if (!open) return;
    const idx = categories.findIndex((c) => c.value === activeCategory);
    setHighlight(idx);
  }, [open, activeCategory, categories]);

  // Scroll the highlighted item into view (offset by 1 because the
  // first <li> is the "All types" row).
  useEffect(() => {
    if (!open || highlight < 0 || !listRef.current) return;
    const el = listRef.current.children[highlight + 1] as
      | HTMLElement
      | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  const choose = (value: string | null) => {
    onChange(value);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      if (open) {
        setOpen(false);
        e.preventDefault();
      }
      return;
    }
    if (
      !open &&
      (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")
    ) {
      setOpen(true);
      e.preventDefault();
      return;
    }
    if (!open) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlight((i) => Math.min(i + 1, categories.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlight((i) => Math.max(i - 1, -1));
        break;
      case "Home":
        e.preventDefault();
        setHighlight(-1);
        break;
      case "End":
        e.preventDefault();
        setHighlight(categories.length - 1);
        break;
      case "Enter":
        e.preventDefault();
        choose(highlight < 0 ? null : categories[highlight].value);
        break;
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex w-full items-center justify-between gap-2 rounded-md border bg-surface px-2 py-1.5 text-xs capitalize transition-colors focus:outline-none ${
          open
            ? "border-accent text-foreground"
            : "border-border text-foreground hover:border-accent"
        }`}
      >
        <span className={active ? "" : "text-muted"}>{selectedLabel}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 flex-shrink-0 text-muted transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-background shadow-lg"
        >
          <li
            role="option"
            aria-selected={activeCategory === null}
            onMouseDown={(e) => {
              e.preventDefault();
              choose(null);
            }}
            onMouseEnter={() => setHighlight(-1)}
            className={`cursor-pointer px-2 py-1.5 text-xs capitalize ${
              highlight === -1
                ? "bg-accent/10 text-accent"
                : activeCategory === null
                  ? "text-foreground"
                  : "text-muted hover:bg-surface"
            }`}
          >
            All types
          </li>
          {categories.map((c, i) => {
            const isActive = c.value === activeCategory;
            const isHi = highlight === i;
            return (
              <li
                key={c.value}
                role="option"
                aria-selected={isActive}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(c.value);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={`cursor-pointer px-2 py-1.5 text-xs capitalize ${
                  isHi
                    ? "bg-accent/10 text-accent"
                    : isActive
                      ? "text-foreground"
                      : "text-muted hover:bg-surface"
                }`}
              >
                {c.count != null ? `${c.label} (${c.count})` : c.label}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

