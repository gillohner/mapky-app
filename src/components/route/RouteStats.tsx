import { Clock, MountainSnow, Route as RouteIcon } from "lucide-react";

interface RouteStatsProps {
  distance_m: number | null | undefined;
  duration_s: number | null | undefined;
  elevation_gain_m?: number | null;
  elevation_loss_m?: number | null;
  /** Compact layout for cards / inline use. */
  compact?: boolean;
}

export function RouteStats({
  distance_m,
  duration_s,
  elevation_gain_m,
  elevation_loss_m,
  compact,
}: RouteStatsProps) {
  if (distance_m == null && duration_s == null) {
    return null;
  }
  const hasElevation =
    (elevation_gain_m != null && elevation_gain_m > 0) ||
    (elevation_loss_m != null && elevation_loss_m > 0);
  return (
    <div
      className={
        compact
          ? "flex items-center gap-3 text-xs text-muted"
          : "flex flex-wrap items-center gap-4 rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
      }
    >
      {distance_m != null && (
        <Stat
          icon={<RouteIcon className="h-4 w-4" />}
          value={formatDistance(distance_m)}
          label="Distance"
        />
      )}
      {duration_s != null && (
        <Stat
          icon={<Clock className="h-4 w-4" />}
          value={formatDuration(duration_s)}
          label="Time"
        />
      )}
      {hasElevation && (
        <Stat
          icon={<MountainSnow className="h-4 w-4" />}
          value={`+${Math.round(elevation_gain_m ?? 0)} / -${Math.round(elevation_loss_m ?? 0)} m`}
          label="Elevation"
        />
      )}
    </div>
  );
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted">{icon}</span>
      <span className="font-medium">{value}</span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}

function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10_000 ? 2 : 1)} km`;
}

function formatDuration(s: number): string {
  const mins = Math.round(s / 60);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins ? `${hours} h ${remMins} min` : `${hours} h`;
}
