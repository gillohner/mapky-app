import { useState, useRef, useEffect } from "react";
import { Search, X, MapPin } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useNominatimSearch } from "@/lib/api/hooks";
import { useMapStore } from "@/stores/map-store";
import { useUiStore } from "@/stores/ui-store";
import type { NominatimSearchResult } from "@/lib/api/nominatim";

export function SearchBar() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const map = useMapStore((s) => s.map);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);

  const { data: results, isLoading } = useNominatimSearch(query);

  // Debounce input → query
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (input.length < 2) {
      setQuery("");
      return;
    }
    debounceRef.current = setTimeout(() => setQuery(input), 300);
    return () => clearTimeout(debounceRef.current);
  }, [input]);

  // Close dropdown on click outside
  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const handleSelect = (result: NominatimSearchResult) => {
    setInput("");
    setQuery("");
    setShowResults(false);

    // Fly map to result
    if (map) {
      map.flyTo({ center: [result.lon, result.lat], zoom: 17, duration: 1500 });
    }

    // Navigate to place detail
    navigate({
      to: "/place/$osmType/$osmId",
      params: {
        osmType: result.osm_type,
        osmId: String(result.osm_id),
      },
      search: { lat: result.lat, lon: result.lon },
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setShowResults(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div
      ref={containerRef}
      className={`pointer-events-auto absolute top-3 z-20 left-14 right-3 md:right-auto md:w-[340px] transition-[left] duration-300 ${
        sidebarOpen ? "md:left-[440px]" : "md:left-14"
      }`}
    >
      {/* Search input */}
      <div className="flex items-center gap-2 rounded-xl border border-border bg-background/90 px-3 py-2 shadow-lg backdrop-blur">
        <Search className="h-4 w-4 flex-shrink-0 text-muted" />
        <input
          ref={inputRef}
          id="mapky-search-input"
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowResults(true);
          }}
          onFocus={() => setShowResults(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search places..."
          className="w-full bg-transparent text-sm text-foreground placeholder:text-muted focus:outline-none"
        />
        {input && (
          <button
            onClick={() => {
              setInput("");
              setQuery("");
              setShowResults(false);
            }}
            className="flex-shrink-0 text-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Results dropdown */}
      {showResults && query.length >= 2 && (
        <div className="mt-1 max-h-[60vh] overflow-y-auto rounded-xl border border-border bg-background shadow-xl">
          {isLoading && (
            <div className="px-4 py-3 text-sm text-muted">Searching...</div>
          )}

          {!isLoading && results && results.length === 0 && (
            <div className="px-4 py-3 text-sm text-muted">No results found</div>
          )}

          {results?.map((result) => {
            const typeLabel = result.type?.replace(/_/g, " ") || "";
            const categoryLabel = result.category?.replace(/_/g, " ") || "";
            const badge =
              typeLabel === "yes" || typeLabel === "unclassified"
                ? categoryLabel
                : typeLabel;

            return (
              <button
                key={`${result.osm_type}-${result.osm_id}`}
                onClick={() => handleSelect(result)}
                className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface"
              >
                <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">
                      {result.name}
                    </p>
                    {badge && (
                      <span className="flex-shrink-0 rounded bg-surface px-1.5 py-0.5 text-[10px] capitalize text-muted">
                        {badge}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted">
                    {result.display_name}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
