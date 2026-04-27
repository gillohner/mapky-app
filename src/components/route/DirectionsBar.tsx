import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bike,
  Car,
  ChevronDown,
  Footprints,
  Mountain,
  Plus,
  Settings2,
  X,
  ArrowUpDown,
} from "lucide-react";
import {
  slotToWaypoint,
  useRouteCreationStore,
  type WaypointSlot,
} from "@/stores/route-creation-store";
import type { RouteActivity } from "@/types/mapky";
import { requestRoute, RoutingError } from "@/lib/routing/valhalla";
import { profileForActivity } from "@/lib/routing/activity-costing";
import { effectivePreferences } from "@/lib/routing/preferences";
import { RouteActivityType as ActivityEnum } from "mapky-app-specs";
import { snapToComputed } from "@/stores/route-creation-store";
import type { RouteActivityKey } from "@/lib/mapky-specs";
import { WaypointInput } from "./WaypointInput";

interface ModeOption {
  key: RouteActivity;
  label: string;
  /** One-line description shown in the foot sub-picker. */
  description?: string;
  Icon: React.ComponentType<{ className?: string }>;
  enumValue: ActivityEnum;
}

// Walk / Run / Hike all use Valhalla's `pedestrian` costing, but with
// different `walking_speed` and `max_hiking_difficulty` (see
// activity-costing.ts). They live under a single "Foot" pill in the UI;
// the pill expands a sub-picker so users can pick which foot mode they
// actually mean. Run + Hike differ from Walk in real, route-affecting
// ways — speed for Run, trail tolerance for Hike.
const FOOT_MODES: ModeOption[] = [
  {
    key: "walking",
    label: "Walk",
    description: "Streets · 5 km/h",
    Icon: Footprints,
    enumValue: ActivityEnum.Walking,
  },
  {
    key: "running",
    label: "Run",
    description: "Streets · 10 km/h",
    Icon: Footprints,
    enumValue: ActivityEnum.Running,
  },
  {
    key: "hiking",
    label: "Hike",
    description: "Trails allowed · 4.5 km/h",
    Icon: Mountain,
    enumValue: ActivityEnum.Hiking,
  },
];

const VEHICLE_MODES: ModeOption[] = [
  { key: "cycling", label: "Bike", Icon: Bike, enumValue: ActivityEnum.Cycling },
  { key: "driving", label: "Drive", Icon: Car, enumValue: ActivityEnum.Driving },
];

const ALL_MODES = [...FOOT_MODES, ...VEHICLE_MODES];

// Skiing + Other are intentionally NOT exposed in the UI:
//   Skiing — Valhalla has no piste/lift profile, would just re-run
//   pedestrian routing with a misleading label.
//   Other  — vague, falls back to Walk semantics anyway.
// Both remain valid in the data model so legacy saved routes keep
// rendering; new routes can't be created with them.

const RECOMPUTE_DEBOUNCE_MS = 500;

export function DirectionsBar() {
  const isOpen = useRouteCreationStore((s) => s.isOpen);
  const slots = useRouteCreationStore((s) => s.slots);
  const activity = useRouteCreationStore((s) => s.activity);
  const setActivity = useRouteCreationStore((s) => s.setActivity);
  const addStop = useRouteCreationStore((s) => s.addStop);
  const swapEndpoints = useRouteCreationStore((s) => s.swapEndpoints);
  const close = useRouteCreationStore((s) => s.close);
  const computeNonce = useRouteCreationStore((s) => s.computeNonce);
  const setComputedBundle = useRouteCreationStore((s) => s.setComputedBundle);
  const setComputing = useRouteCreationStore((s) => s.setComputing);
  const setComputeError = useRouteCreationStore((s) => s.setComputeError);
  const isComputing = useRouteCreationStore((s) => s.isComputing);
  const preferences = useRouteCreationStore((s) => s.preferences);
  const setPreferences = useRouteCreationStore((s) => s.setPreferences);

  const [moreOpen, setMoreOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);

  const inFlightAbort = useRef<AbortController | null>(null);

  // Auto-snap whenever the slots / activity change. Mirrors the behavior of
  // the previous panel but reads typed slots instead of raw waypoints.
  useEffect(() => {
    if (!isOpen) return;
    const wps = slots
      .map((s) => slotToWaypoint(s))
      .filter((w): w is NonNullable<ReturnType<typeof slotToWaypoint>> =>
        w !== null,
      );
    if (wps.length < 2) {
      setComputedBundle(null, []);
      setComputeError(null);
      return;
    }
    const handle = setTimeout(async () => {
      inFlightAbort.current?.abort();
      const ac = new AbortController();
      inFlightAbort.current = ac;

      // Invalidate the previous result before firing the new snap. If we
      // didn't, switching from a successful drive to a too-long walk would
      // show the stale drive distance/time/polyline alongside the error
      // message — confusing and incorrect. The brief loading state is
      // preferable to misleading stats.
      setComputedBundle(null, []);
      setComputing(true);
      setComputeError(null);
      try {
        const enumValue =
          ALL_MODES.find((m) => m.key === activity)?.enumValue ??
          ActivityEnum.Hiking;
        const profile = profileForActivity(enumValue);
        const bundle = await requestRoute(wps, profile.costing, {
          signal: ac.signal,
          preferences,
          activityOptions: profile.options,
          alternates: 2,
        });
        if (!ac.signal.aborted) {
          setComputedBundle(
            snapToComputed(bundle.primary),
            bundle.alternates.map(snapToComputed),
          );
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        // Belt-and-braces: ensure no stale primary/alternates are visible
        // alongside the error. setComputedBundle was already called above
        // pre-fetch, but explicit clearing here makes the contract clear.
        setComputedBundle(null, []);
        if (err instanceof RoutingError) {
          setComputeError(err.message, err.hint ?? null);
        } else {
          setComputeError(
            err instanceof Error ? err.message : "Routing failed",
          );
        }
      } finally {
        if (!ac.signal.aborted) setComputing(false);
      }
    }, RECOMPUTE_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [
    isOpen,
    computeNonce,
    slots,
    activity,
    preferences,
    setComputedBundle,
    setComputing,
    setComputeError,
  ]);

  const usable = useMemo(
    () => slots.filter((s) => s.kind !== "empty"),
    [slots],
  );
  const total = usable.length;

  if (!isOpen) return null;

  return (
    <div className="border-b border-border bg-background p-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted">
          Directions
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={swapEndpoints}
            className="rounded-md p-1.5 text-muted hover:bg-surface hover:text-foreground"
            title="Swap origin and destination"
            aria-label="Swap origin and destination"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => {
              close();
            }}
            className="rounded-md p-1.5 text-muted hover:bg-surface hover:text-foreground"
            aria-label="Close directions"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        {slots.map((slot, i) => {
          const visualIdx = visualIndexOf(slots, i);
          const total2 = total;
          return (
            <WaypointInput
              key={slot.id}
              index={i}
              slot={slot}
              pinLabel={pinLabel(visualIdx, total2, slot)}
              pinColor={pinColor(visualIdx, total2, slot)}
              placeholder={placeholderFor(i, slots.length)}
              removable={i !== 0 && i !== slots.length - 1}
            />
          );
        })}

        <button
          onClick={() => addStop()}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-2 py-1.5 text-xs text-muted transition-colors hover:border-accent hover:text-accent"
        >
          <Plus className="h-3.5 w-3.5" />
          Add stop
        </button>
      </div>

      <div className="mt-2 flex items-center gap-1">
        {/* Foot pill — single button covering Walk/Run/Hike, with a
            chevron that opens a sub-picker for the specific foot mode. */}
        <FootPill
          activity={activity}
          onSelect={(key) => {
            setActivity(key);
            setMoreOpen(false);
          }}
          open={moreOpen}
          setOpen={setMoreOpen}
        />
        {VEHICLE_MODES.map((m) => (
          <ModeButton
            key={m.key}
            mode={m}
            active={activity === m.key}
            onClick={() => setActivity(m.key)}
          />
        ))}

        <div className="flex-1" />

        {isComputing && (
          <span className="text-[10px] text-muted">snapping…</span>
        )}

        <div className="relative">
          <button
            onClick={() => setPrefsOpen((v) => !v)}
            className={`rounded-md p-1.5 text-xs transition-colors ${
              prefsOpen
                ? "bg-surface text-foreground"
                : "text-muted hover:bg-surface hover:text-foreground"
            }`}
            title="Route options"
            aria-label="Route options"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
          {prefsOpen && (
            <div
              className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-border bg-background p-2 shadow-lg"
              onMouseLeave={() => setPrefsOpen(false)}
            >
              <p className="mb-1.5 px-1 text-[10px] uppercase tracking-wide text-muted">
                Avoid
              </p>
              {(() => {
                const enumVal =
                  ALL_MODES.find((m) => m.key === activity)?.enumValue ??
                  ActivityEnum.Hiking;
                const costing = profileForActivity(enumVal).costing;
                const eff = effectivePreferences(costing, preferences);
                const isFoot = costing === "pedestrian";
                return (
                  <>
                    <PrefRow
                      label="Ferries"
                      checked={eff.avoidFerries}
                      isDefault={preferences.avoidFerries === null}
                      onToggle={(v) => setPreferences({ avoidFerries: v })}
                    />
                    <PrefRow
                      label="Tolls"
                      checked={eff.avoidTolls}
                      isDefault={preferences.avoidTolls === null}
                      disabled={isFoot}
                      onToggle={(v) => setPreferences({ avoidTolls: v })}
                    />
                    <PrefRow
                      label="Highways"
                      checked={eff.avoidHighways}
                      isDefault={preferences.avoidHighways === null}
                      disabled={isFoot}
                      onToggle={(v) => setPreferences({ avoidHighways: v })}
                    />
                  </>
                );
              })()}
              <p className="mt-2 border-t border-border px-1 pt-1.5 text-[10px] text-muted">
                Defaults adapt to your travel mode.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PrefRow({
  label,
  checked,
  isDefault,
  disabled,
  onToggle,
}: {
  label: string;
  checked: boolean;
  isDefault: boolean;
  disabled?: boolean;
  onToggle: (v: boolean | null) => void;
}) {
  return (
    <div
      className={`flex items-center justify-between rounded-md px-1.5 py-1.5 ${
        disabled ? "opacity-50" : "hover:bg-surface"
      }`}
    >
      <label className="flex flex-1 items-center gap-2 text-xs text-foreground">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-border accent-accent"
        />
        {label}
        {isDefault && (
          <span className="text-[9px] uppercase text-muted">default</span>
        )}
      </label>
      {!isDefault && (
        <button
          onClick={() => onToggle(null)}
          className="text-[10px] text-muted hover:text-foreground"
          title="Reset to default"
        >
          reset
        </button>
      )}
    </div>
  );
}

function ModeButton({
  mode,
  active,
  onClick,
}: {
  mode: ModeOption;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = mode.Icon;
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-xs transition-colors ${
        active
          ? "bg-accent text-white"
          : "text-muted hover:bg-surface hover:text-foreground"
      }`}
      title={mode.label}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{mode.label}</span>
    </button>
  );
}

function FootPill({
  activity,
  onSelect,
  open,
  setOpen,
}: {
  activity: RouteActivity;
  onSelect: (k: RouteActivity) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  // Show the active foot sub-mode if one is selected; otherwise default
  // visual state is the "Walk" (most common) icon. The pill stays the same
  // width on all foot modes so the row doesn't reflow when sub-mode
  // changes.
  const current =
    FOOT_MODES.find((m) => m.key === activity) ?? FOOT_MODES[0];
  const isFootActive = FOOT_MODES.some((m) => m.key === activity);
  const Icon = current.Icon;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-xs transition-colors ${
          isFootActive
            ? "bg-accent text-white"
            : "text-muted hover:bg-surface hover:text-foreground"
        }`}
        title={current.label}
        aria-label="Foot travel modes"
        aria-expanded={open}
      >
        <Icon className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">
          {isFootActive ? current.label : "Foot"}
        </span>
        <ChevronDown className="h-3 w-3 opacity-70" />
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded-lg border border-border bg-background p-1 shadow-lg"
          onMouseLeave={() => setOpen(false)}
        >
          {FOOT_MODES.map((m) => {
            const ItemIcon = m.Icon;
            return (
              <button
                key={m.key}
                onClick={() => onSelect(m.key)}
                className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                  activity === m.key
                    ? "bg-accent/10 text-accent"
                    : "text-foreground hover:bg-surface"
                }`}
              >
                <ItemIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium leading-tight">{m.label}</p>
                  {m.description && (
                    <p className="text-[10px] leading-tight text-muted">
                      {m.description}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function visualIndexOf(slots: WaypointSlot[], i: number): number {
  let v = 0;
  for (let k = 0; k < i; k++) if (slots[k].kind !== "empty") v++;
  return v;
}

function pinLabel(visualIdx: number, total: number, slot: WaypointSlot) {
  if (slot.kind === "empty") return "·";
  if (visualIdx === 0) return "A";
  if (visualIdx === total - 1) return "B";
  return String(visualIdx);
}

function pinColor(visualIdx: number, total: number, slot: WaypointSlot) {
  if (slot.kind === "empty") return "#9ca3af";
  if (visualIdx === 0) return "#10B981";
  if (visualIdx === total - 1) return "#EF4444";
  return "#3B82F6";
}

function placeholderFor(i: number, total: number) {
  if (i === 0) return "Choose starting point…";
  if (i === total - 1) return "Choose destination…";
  return "Add stop…";
}

// Re-export the activity key type so other files can import from one place.
export type { RouteActivityKey };
