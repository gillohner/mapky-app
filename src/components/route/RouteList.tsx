import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Route as RoutesIndexRoute } from "@/routes/routes/index";
import { Loader2 } from "lucide-react";
import { DiscoverFilter } from "@/components/discover/Filter";
import { useAuth } from "@/components/auth/AuthProvider";
import { useUserRoutes, useViewportRoutes } from "@/lib/api/hooks";
import {
  readySlotCount,
  useRouteCreationStore,
} from "@/stores/route-creation-store";
import { useViewportBounds } from "@/hooks/use-viewport-bounds";
import { useAutoFocusLayer } from "@/hooks/use-auto-focus-layer";
import { DiscoverSidebar, type DiscoverTab } from "@/components/discover/DiscoverSidebar";
import { DiscoverNewButton } from "@/components/discover/NewButton";
import { RoutesIndexLayer } from "@/components/map/RoutesIndexLayer";
import { RouteCard } from "./RouteCard";

type Tab = "mine" | "viewport";

/**
 * Routes discover sidebar — Mine / In this area feed. Search lives in
 * the global top SearchBar (places / tags / routes modes), so this list
 * is a clean preview-of-routes with no in-panel filter UI.
 */
export function RouteList() {
  const navigate = useNavigate();
  const search = RoutesIndexRoute.useSearch();
  const { publicKey } = useAuth();
  const reset = useRouteCreationStore((s) => s.reset);
  const slots = useRouteCreationStore((s) => s.slots);
  const mode = useRouteCreationStore((s) => s.mode);
  // Only treat populated slots as a "draft" when we're in create mode.
  // Viewing a saved route (loadFromExisting) sets mode to "edit" and
  // hydrates the slots — that's not a draft, it's the saved route's
  // waypoints, so the resume banner shouldn't appear.
  const draftCount = mode === "create" ? readySlotCount(slots) : 0;

  // Browsing routes → fade Mapky places + captures so route markers pop.
  useAutoFocusLayer("routes");

  const tab: Tab = search.tab ?? (publicKey ? "mine" : "viewport");
  const setTab = (next: Tab) => {
    navigate({ to: "/routes", search: { tab: next }, replace: true });
  };

  const bbox = useViewportBounds();

  const userRoutes = useUserRoutes(tab === "mine" ? publicKey : null);
  const viewportRoutes = useViewportRoutes(tab === "viewport" ? bbox : null);

  const tabs: DiscoverTab[] = useMemo(() => {
    const list: DiscoverTab[] = [];
    if (publicKey) list.push({ id: "mine", label: "Mine" });
    list.push({ id: "viewport", label: "In this area" });
    return list;
  }, [publicKey]);

  const handleCreate = () => {
    reset();
    navigate({ to: "/directions" });
  };

  const close = () => navigate({ to: "/" });

  const list = tab === "mine" ? userRoutes : viewportRoutes;

  const [filter, setFilter] = useState("");
  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return list.data ?? [];
    return (list.data ?? []).filter((r) =>
      [r.name, r.description, r.activity]
        .filter((v): v is string => !!v)
        .some((v) => v.toLowerCase().includes(needle)),
    );
  }, [list.data, filter]);

  return (
    <>
      {/* Render every visible route as a polyline + start marker on
          the map. Bodies are fetched in parallel (TanStack useQueries),
          same cache as the detail view's useRouteBody, so opening any
          route's detail page is instant. */}
      <RoutesIndexLayer routes={filtered} />

      <DiscoverSidebar
      title="Routes"
      tabs={tabs}
      activeTab={tab}
      onTabChange={(id) => setTab(id as Tab)}
      onClose={close}
    >
      <DiscoverNewButton onClick={handleCreate} label="Plan a new route" />
      <DiscoverFilter
        value={filter}
        onChange={setFilter}
        placeholder="Filter by name, activity…"
      />

      {draftCount > 0 && (
        <button
          onClick={() => navigate({ to: "/directions" })}
          className="mb-3 w-full rounded-md border border-dashed border-accent bg-accent/10 px-2 py-1.5 text-left text-xs text-accent hover:bg-accent/20"
        >
          Resume draft ({draftCount} waypoints)
        </button>
      )}

      {list.isLoading && (
        <p className="flex items-center gap-2 text-xs text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading…
        </p>
      )}
      {list.error && (
        <p className="text-xs text-red-500">{(list.error as Error).message}</p>
      )}
      {list.data && filtered.length === 0 && (
        <p className="text-xs text-muted">
          {filter
            ? "No routes match your filter."
            : tab === "mine"
              ? "You haven't saved any routes yet."
              : "No routes in this area yet."}
        </p>
      )}
      <div className="space-y-1.5">
        {filtered.map((r) => <RouteCard key={r.id} route={r} />)}
      </div>
    </DiscoverSidebar>
    </>
  );
}
