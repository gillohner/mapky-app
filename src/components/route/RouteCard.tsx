import { Link } from "@tanstack/react-router";
import { Bike, Car, Footprints, Mountain, Route as RouteIcon } from "lucide-react";
import type {
  PostTagDetails,
  RouteActivity,
  RouteDetails,
} from "@/types/mapky";
import { routeColor } from "@/components/map/RoutesIndexLayer";
import { CreatorBadge } from "@/components/discover/CreatorBadge";
import { RouteStats } from "./RouteStats";

interface RouteCardProps {
  route: RouteDetails;
  tags?: PostTagDetails[];
}

export function RouteCard({ route, tags = [] }: RouteCardProps) {
  const Icon = activityIcon(route.activity);
  const routeId = extractRouteId(route.id);
  const color = routeColor(route.author_id, routeId);
  const topTags = tags.slice(0, 3);
  const overflow = tags.length - topTags.length;
  return (
    <Link
      to="/route/$authorId/$routeId"
      params={{ authorId: route.author_id, routeId }}
      className="block overflow-hidden rounded-md border border-border bg-surface transition-colors hover:border-accent"
    >
      <div className="flex">
        <span
          aria-hidden
          className="w-1 flex-shrink-0"
          style={{ backgroundColor: color }}
        />
        <div className="min-w-0 flex-1 p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate text-sm font-medium text-foreground">
              {route.name || "Untitled route"}
            </h3>
            <span className="flex shrink-0 items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-[10px] uppercase text-muted">
              <Icon className="h-3 w-3" />
              {route.activity}
            </span>
          </div>
          {route.description && (
            <p className="mt-1 line-clamp-2 text-xs text-muted">
              {route.description}
            </p>
          )}
          <div className="mt-1.5">
            <RouteStats
              distance_m={route.distance_m}
              duration_s={route.estimated_duration_s}
              elevation_gain_m={route.elevation_gain_m}
              elevation_loss_m={route.elevation_loss_m}
              compact
            />
          </div>
          {topTags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {topTags.map((t) => (
                <span
                  key={t.label}
                  className="rounded-full bg-background px-1.5 py-0.5 text-[10px] text-muted"
                >
                  #{t.label}
                </span>
              ))}
              {overflow > 0 && (
                <span className="text-[10px] text-muted">+{overflow}</span>
              )}
            </div>
          )}
          <div className="mt-1.5">
            <CreatorBadge authorId={route.author_id} />
          </div>
        </div>
      </div>
    </Link>
  );
}

function extractRouteId(compoundId: string): string {
  // RouteDetails.id is "author_id:route_id"; split out just the route id
  // for use in the URL.
  const idx = compoundId.indexOf(":");
  return idx >= 0 ? compoundId.slice(idx + 1) : compoundId;
}

function activityIcon(activity: RouteActivity) {
  switch (activity) {
    case "cycling":
      return Bike;
    case "driving":
      return Car;
    case "hiking":
    case "skiing":
      return Mountain;
    case "walking":
    case "running":
      return Footprints;
    default:
      return RouteIcon;
  }
}
