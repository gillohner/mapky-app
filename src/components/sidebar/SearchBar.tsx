import { useState, useRef, useEffect } from "react";
import { Search, X, MapPin, Tag, FolderHeart, MessageSquare } from "lucide-react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useNominatimSearch, useTagSearch, useOsmLookup } from "@/lib/api/hooks";
import { useMapStore } from "@/stores/map-store";
import { useUiStore } from "@/stores/ui-store";
import type { NominatimSearchResult } from "@/lib/api/nominatim";
import type { PlaceDetails, PostDetails } from "@/types/mapky";
import { parseOsmCanonical } from "@/lib/map/osm-url";

type SearchMode = "places" | "tags";

export function SearchBar() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [mode, setMode] = useState<SearchMode>("places");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const map = useMapStore((s) => s.map);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const searchParams = useRouterState({ select: (s) => s.location.search });
  const isOnSearchRoute = currentPath === "/search";

  const { data: placeResults, isLoading: placesLoading } =
    useNominatimSearch(mode === "places" ? query : "");
  const { data: tagResults, isLoading: tagsLoading } = useTagSearch(
    mode === "tags" ? query : "",
  );

  const isLoading = mode === "places" ? placesLoading : tagsLoading;

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

  // Sync SearchBar input with /search route query param
  useEffect(() => {
    if (isOnSearchRoute && typeof searchParams === "object" && searchParams !== null) {
      const sp = searchParams as Record<string, unknown>;
      const q = sp.q ? String(sp.q) : "";
      const m = sp.mode === "tags" ? "tags" : "places";
      if (q && q !== input) setInput(q);
      if (m !== mode) setMode(m as SearchMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnSearchRoute, searchParams]);

  const handleSelectPlace = (result: NominatimSearchResult) => {
    setInput("");
    setQuery("");
    setShowResults(false);

    if (map) {
      map.flyTo({ center: [result.lon, result.lat], zoom: 17, duration: 1500 });
    }

    navigate({
      to: "/place/$osmType/$osmId",
      params: {
        osmType: result.osm_type,
        osmId: String(result.osm_id),
      },
      search: { lat: result.lat, lon: result.lon },
    });
  };

  const handleSelectTagPlace = (osmType: string, osmId: number) => {
    setInput("");
    setQuery("");
    setShowResults(false);

    navigate({
      to: "/place/$osmType/$osmId",
      params: { osmType, osmId: String(osmId) },
    });
  };

  const handleSelectCollection = (authorId: string, collectionId: string) => {
    setInput("");
    setQuery("");
    setShowResults(false);

    navigate({
      to: "/collection/$authorId/$collectionId",
      params: { authorId, collectionId },
    });
  };

  const handleSelectPost = (post: PostDetails) => {
    setInput("");
    setQuery("");
    setShowResults(false);

    // Parse osm_canonical to navigate to the place
    const parsed = parseOsmCanonical(post.osm_canonical);
    if (!parsed) return;

    navigate({
      to: "/place/$osmType/$osmId",
      params: {
        osmType: parsed.osmType,
        osmId: String(parsed.osmId),
      },
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setShowResults(false);
      inputRef.current?.blur();
    }
    if (e.key === "Enter" && input.length >= 2) {
      setShowResults(false);
      navigate({ to: "/search", search: { q: input, mode } });
    }
  };

  const switchMode = (newMode: SearchMode) => {
    setMode(newMode);
    // Re-trigger search with existing input in the new mode
    setQuery(input.length >= 2 ? input : "");
    inputRef.current?.focus();
  };

  const hasResults =
    mode === "places"
      ? placeResults && placeResults.length > 0
      : tagResults &&
        ((tagResults.places?.length ?? 0) > 0 ||
          (tagResults.collections?.length ?? 0) > 0 ||
          (tagResults.posts?.length ?? 0) > 0);

  return (
    <div
      ref={containerRef}
      className={`pointer-events-auto absolute top-3 z-20 left-14 right-3 md:right-auto md:w-[380px] transition-[left] duration-300 ${
        sidebarOpen ? "md:left-[440px]" : "md:left-14"
      }`}
    >
      {/* Search input */}
      <div className="flex items-center gap-1.5 rounded-xl border border-border bg-background/90 px-2 py-2 shadow-lg backdrop-blur">
        {/* Mode toggle */}
        <div className="flex flex-shrink-0 rounded-lg bg-surface p-0.5">
          <button
            onClick={() => switchMode("places")}
            className={`rounded-md p-1.5 transition-colors ${
              mode === "places"
                ? "bg-background text-accent shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
            title="Search places"
          >
            <MapPin className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => switchMode("tags")}
            className={`rounded-md p-1.5 transition-colors ${
              mode === "tags"
                ? "bg-background text-accent shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
            title="Search by tag"
          >
            <Tag className="h-3.5 w-3.5" />
          </button>
        </div>

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
          placeholder={
            mode === "places" ? "Search places..." : "Search by tag..."
          }
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
      {showResults && query.length >= 2 && !isOnSearchRoute && (
        <div className="mt-1 max-h-[60vh] overflow-y-auto rounded-xl border border-border bg-background shadow-xl">
          {isLoading && (
            <div className="px-4 py-3 text-sm text-muted">Searching...</div>
          )}

          {!isLoading && !hasResults && (
            <div className="px-4 py-3 text-sm text-muted">No results found</div>
          )}

          {/* Places mode results */}
          {mode === "places" &&
            placeResults?.map((result) => {
              const typeLabel = result.type?.replace(/_/g, " ") || "";
              const categoryLabel = result.category?.replace(/_/g, " ") || "";
              const badge =
                typeLabel === "yes" || typeLabel === "unclassified"
                  ? categoryLabel
                  : typeLabel;

              return (
                <button
                  key={`${result.osm_type}-${result.osm_id}`}
                  onClick={() => handleSelectPlace(result)}
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
                    <p className="text-xs leading-relaxed text-muted">
                      {result.display_name}
                    </p>
                  </div>
                </button>
              );
            })}

          {/* Tags mode results */}
          {mode === "tags" && tagResults && (
            <>
              {tagResults.places?.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                    Places
                  </div>
                  {tagResults.places.map((p) => (
                    <TagPlaceResult
                      key={`${p.osm_type}-${p.osm_id}`}
                      place={p}
                      onSelect={() =>
                        handleSelectTagPlace(p.osm_type, p.osm_id)
                      }
                    />
                  ))}
                </div>
              )}

              {tagResults.collections?.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                    Collections
                  </div>
                  {tagResults.collections.map((c) => {
                    const [authorId, collectionId] = c.id.split(":");
                    return (
                      <button
                        key={c.id}
                        onClick={() =>
                          handleSelectCollection(authorId, collectionId)
                        }
                        className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface"
                      >
                        <FolderHeart className="h-4 w-4 flex-shrink-0 text-accent" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {c.name}
                          </p>
                          <p className="text-xs text-muted">
                            {c.items.length} places
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {tagResults.posts?.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                    Posts
                  </div>
                  {tagResults.posts.map((post) => (
                    <button
                      key={`${post.author_id}-${post.id}`}
                      onClick={() => handleSelectPost(post)}
                      className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface"
                    >
                      <MessageSquare className="h-4 w-4 flex-shrink-0 text-accent" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-foreground">
                          {post.content
                            ? post.content.slice(0, 80) +
                              (post.content.length > 80 ? "..." : "")
                            : post.kind === "review"
                              ? "Review"
                              : "Post"}
                        </p>
                        <p className="text-xs text-muted">
                          {post.kind === "review" && post.rating
                            ? `${(post.rating / 2).toFixed(1)} stars · `
                            : ""}
                          {post.osm_canonical}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TagPlaceResult({
  place,
  onSelect,
}: {
  place: PlaceDetails;
  onSelect: () => void;
}) {
  const { data: nominatim } = useOsmLookup(
    place.osm_type,
    place.osm_id,
    true,
  );

  const name =
    nominatim?.name ||
    nominatim?.display_name?.split(",")[0] ||
    place.osm_canonical;

  const typeLabel =
    nominatim?.type?.replace(/_/g, " ") ?? "";

  return (
    <button
      onClick={onSelect}
      className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface"
    >
      <MapPin className="h-4 w-4 flex-shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm text-foreground">{name}</p>
          {typeLabel && typeLabel !== "yes" && (
            <span className="flex-shrink-0 rounded bg-surface px-1.5 py-0.5 text-[10px] capitalize text-muted">
              {typeLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          {place.tag_count > 0 && <span>{place.tag_count} tags</span>}
          {place.review_count > 0 && (
            <span>{place.review_count} reviews</span>
          )}
        </div>
      </div>
    </button>
  );
}
