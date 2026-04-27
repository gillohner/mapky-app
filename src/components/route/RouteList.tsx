import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plus, Loader2 } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useUserRoutes, useViewportRoutes } from "@/lib/api/hooks";
import { useMapStore } from "@/stores/map-store";
import {
  readySlotCount,
  useRouteCreationStore,
} from "@/stores/route-creation-store";
import { RouteCard } from "./RouteCard";

type Tab = "mine" | "viewport";

export function RouteList() {
  const navigate = useNavigate();
  const { publicKey } = useAuth();
  const map = useMapStore((s) => s.map);
  const reset = useRouteCreationStore((s) => s.reset);
  const slots = useRouteCreationStore((s) => s.slots);
  const draftCount = readySlotCount(slots);

  const [tab, setTab] = useState<Tab>(publicKey ? "mine" : "viewport");
  const bbox = map ? boundsOf(map) : null;
  const userRoutes = useUserRoutes(tab === "mine" ? publicKey : null);
  const viewportRoutes = useViewportRoutes(tab === "viewport" ? bbox : null);

  const list = tab === "mine" ? userRoutes : viewportRoutes;

  const handleCreate = () => {
    reset();
    navigate({ to: "/directions" });
  };

  return (
    <div className="pointer-events-auto fixed inset-x-2 bottom-2 z-30 max-h-[60vh] overflow-y-auto rounded-lg border border-border bg-background/95 p-3 shadow-lg backdrop-blur-sm sm:inset-x-auto sm:right-2 sm:top-2 sm:bottom-auto sm:w-96">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {publicKey && (
            <TabButton
              active={tab === "mine"}
              onClick={() => setTab("mine")}
              label="My routes"
            />
          )}
          <TabButton
            active={tab === "viewport"}
            onClick={() => setTab("viewport")}
            label="In this area"
          />
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-xs font-medium text-white hover:bg-accent-hover"
          title="Plan a new route"
        >
          <Plus className="h-3.5 w-3.5" />
          New
        </button>
      </div>

      {draftCount > 0 && (
        <button
          onClick={() => navigate({ to: "/directions" })}
          className="mb-2 w-full rounded-md border border-dashed border-accent bg-accent/10 px-2 py-1.5 text-left text-xs text-accent hover:bg-accent/20"
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
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
        active
          ? "border-accent bg-accent text-white"
          : "border-border bg-surface text-foreground hover:border-accent"
      }`}
    >
      {label}
    </button>
  );
}

function boundsOf(map: maplibregl.Map): {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
} {
  const b = map.getBounds();
  return {
    minLat: b.getSouth(),
    minLon: b.getWest(),
    maxLat: b.getNorth(),
    maxLon: b.getEast(),
  };
}
