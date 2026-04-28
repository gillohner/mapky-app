import { Search as SearchIcon, X } from "lucide-react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

/**
 * Compact search input used in the toolbar slot of `DiscoverSidebar`.
 * Smaller than the global `SearchBar` since it sits inside a 380px panel.
 */
export function DiscoverSearchInput({ value, onChange, placeholder }: Props) {
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1">
      <SearchIcon className="h-3.5 w-3.5 flex-shrink-0 text-muted" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent text-xs text-foreground placeholder:text-muted focus:outline-none"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="flex-shrink-0 text-muted hover:text-foreground"
          aria-label="Clear"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
