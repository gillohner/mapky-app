import { Route as RouteIcon } from "lucide-react";
import { usePlaceFullRoutes } from "@/lib/api/hooks";
import { RouteCard } from "@/components/route/RouteCard";

interface PlaceRoutesProps {
  osmType: string;
  osmId: number;
}

/**
 * "Routes near here" — surfaces public routes whose bounding box covers
 * the selected place. Helps users discover walks/rides/drives that pass
 * through a spot they're looking at. Hidden when the indexer returns no
 * matches so the panel doesn't have an empty state every time.
 */
export function PlaceRoutes({ osmType, osmId }: PlaceRoutesProps) {
  const { data: routes, isLoading } = usePlaceFullRoutes(osmType, osmId);

  if (isLoading) {
    return (
      <div className="space-y-1.5">
        <h4 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <RouteIcon className="h-3.5 w-3.5" />
          Routes near here
        </h4>
        <div className="space-y-1.5">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-md border border-border bg-surface"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!routes || routes.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        <RouteIcon className="h-3.5 w-3.5" />
        Routes near here
        <span className="text-[10px] font-normal text-muted">
          {routes.length}
        </span>
      </h4>
      <div className="space-y-1.5">
        {routes.map((r) => (
          <RouteCard key={r.id} route={r} />
        ))}
      </div>
    </div>
  );
}
