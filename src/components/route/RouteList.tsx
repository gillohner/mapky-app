import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plus, Loader2 } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useUserRoutes, useViewportRoutes } from "@/lib/api/hooks";
import {
  readySlotCount,
  useRouteCreationStore,
} from "@/stores/route-creation-store";
import { useViewportBounds } from "@/hooks/use-viewport-bounds";
import { DiscoverSidebar, type DiscoverTab } from "@/components/discover/DiscoverSidebar";
import { DiscoverSearchInput } from "@/components/discover/SearchInput";
import { RouteCard } from "./RouteCard";
import type { RouteDetails } from "@/types/mapky";

type Tab = "mine" | "viewport" | "search";

/**
 * Routes discover sidebar. Mirrors CollectionList / PlaceList shape via
 * DiscoverSidebar so all three feel identical aside from row content.
 *
 * Search tab: client-side filter against the viewport routes (server-side
 * route search by name/tag is a backend follow-up). Surfaces routes that
 * are visible in the current map view, narrowed by the typed query.
 */
export function RouteList() {
  const navigate = useNavigate();
  const { publicKey } = useAuth();
  const reset = useRouteCreationStore((s) => s.reset);
  const slots = useRouteCreationStore((s) => s.slots);
  const draftCount = readySlotCount(slots);

  const [tab, setTab] = useState<Tab>(publicKey ? "mine" : "viewport");
  const [query, setQuery] = useState("");

  const bbox = useViewportBounds();

  const userRoutes = useUserRoutes(tab === "mine" ? publicKey : null);
  const viewportRoutes = useViewportRoutes(
    tab === "viewport" || tab === "search" ? bbox : null,
  );

  const tabs: DiscoverTab[] = useMemo(() => {
    const list: DiscoverTab[] = [];
    if (publicKey) list.push({ id: "mine", label: "Mine" });
    list.push({ id: "viewport", label: "In this area" });
    list.push({ id: "search", label: "Search" });
    return list;
  }, [publicKey]);

  const handleCreate = () => {
    reset();
    navigate({ to: "/directions" });
  };

  const close = () => navigate({ to: "/" });

  // Resolve which list + state to render for the current tab.
  const list =
    tab === "mine"
      ? userRoutes
      : tab === "search"
        ? filterRoutes(viewportRoutes.data ?? null, query)
        : viewportRoutes;

  const rightHeader = (
    <button
      onClick={handleCreate}
      className="flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-xs font-medium text-white hover:bg-accent-hover"
      title="Plan a new route"
    >
      <Plus className="h-3.5 w-3.5" />
      New
    </button>
  );

  const toolbar =
    tab === "search" ? (
      <DiscoverSearchInput
        value={query}
        onChange={setQuery}
        placeholder="Filter routes in view…"
      />
    ) : undefined;

  return (
    <DiscoverSidebar
      title="Routes"
      tabs={tabs}
      activeTab={tab}
      onTabChange={(id) => setTab(id as Tab)}
      onClose={close}
      rightHeaderSlot={rightHeader}
      toolbar={toolbar}
    >
      {draftCount > 0 && (
        <button
          onClick={() => navigate({ to: "/directions" })}
          className="mb-3 w-full rounded-md border border-dashed border-accent bg-accent/10 px-2 py-1.5 text-left text-xs text-accent hover:bg-accent/20"
        >
          Resume draft ({draftCount} waypoints)
        </button>
      )}

      <RouteListBody
        list={list}
        emptyText={
          tab === "mine"
            ? "You haven't saved any routes yet."
            : tab === "search"
              ? query
                ? "No routes match that name in this area."
                : "Type to filter routes in the current view."
              : "No routes in this area yet."
        }
        showLoader={tab !== "search" || query.length > 0}
      />
    </DiscoverSidebar>
  );
}

function RouteListBody({
  list,
  emptyText,
  showLoader,
}: {
  list: ListLike<RouteDetails> | RouteDetails[];
  emptyText: string;
  showLoader: boolean;
}) {
  // Normalize so callers can pass either a TanStack-Query result or a
  // pre-filtered array (search tab).
  const isLoading = "isLoading" in list ? list.isLoading : false;
  const error = "error" in list ? (list.error as Error | null) : null;
  const data = "data" in list ? list.data : list;

  if (isLoading && showLoader) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading…
      </p>
    );
  }
  if (error) {
    return <p className="text-xs text-red-500">{error.message}</p>;
  }
  if (!data || data.length === 0) {
    return <p className="text-xs text-muted">{emptyText}</p>;
  }

  return (
    <div className="space-y-1.5">
      {data.map((r) => (
        <RouteCard key={r.id} route={r} />
      ))}
    </div>
  );
}

interface ListLike<T> {
  data: T[] | undefined;
  isLoading: boolean;
  error: unknown;
}

function filterRoutes(
  routes: RouteDetails[] | null,
  q: string,
): RouteDetails[] {
  if (!routes) return [];
  if (!q.trim()) return routes;
  const needle = q.toLowerCase();
  return routes.filter(
    (r) =>
      (r.name ?? "").toLowerCase().includes(needle) ||
      (r.description ?? "").toLowerCase().includes(needle),
  );
}

