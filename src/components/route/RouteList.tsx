import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Route as RoutesIndexRoute } from "@/routes/routes/index";
import { Plus, Loader2 } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useUserRoutes, useViewportRoutes } from "@/lib/api/hooks";
import {
  readySlotCount,
  useRouteCreationStore,
} from "@/stores/route-creation-store";
import { useViewportBounds } from "@/hooks/use-viewport-bounds";
import { useAutoFocusLayer } from "@/hooks/use-auto-focus-layer";
import { DiscoverSidebar, type DiscoverTab } from "@/components/discover/DiscoverSidebar";
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
  const draftCount = readySlotCount(slots);

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

  return (
    <>
      {/* Render every visible route as a polyline + start marker on
          the map. Bodies are fetched in parallel (TanStack useQueries),
          same cache as the detail view's useRouteBody, so opening any
          route's detail page is instant. */}
      <RoutesIndexLayer routes={list.data} />

      <DiscoverSidebar
      title="Routes"
      tabs={tabs}
      activeTab={tab}
      onTabChange={(id) => setTab(id as Tab)}
      onClose={close}
      rightHeaderSlot={rightHeader}
    >
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
      {list.data && list.data.length === 0 && (
        <p className="text-xs text-muted">
          {tab === "mine"
            ? "You haven't saved any routes yet."
            : "No routes in this area yet."}
        </p>
      )}
      <div className="space-y-1.5">
        {list.data?.map((r) => <RouteCard key={r.id} route={r} />)}
      </div>
    </DiscoverSidebar>
    </>
  );
}
