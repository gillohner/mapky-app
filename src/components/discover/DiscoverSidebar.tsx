import { ChevronLeft, X } from "lucide-react";
import { useSidebarPresence } from "@/hooks/use-sidebar-presence";
import { MobileBottomSheet, type SheetSnap } from "@/components/shared/MobileBottomSheet";

export interface DiscoverTab {
  id: string;
  label: string;
}

interface Props {
  title: string;
  /** Optional tab strip. Omit for single-mode lists (e.g. /my-posts). */
  tabs?: DiscoverTab[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  /**
   * Top-right X button. Always closes the sidebar entirely (typically
   * navigates to "/"). Detail panels also pass `onBack` for the
   * top-left back arrow that pops history.
   */
  onClose: () => void;
  /**
   * Optional top-left back button. Detail panels pass this to step
   * back to the parent list (history.back). When absent the title text
   * shows in its place — list views don't need a back arrow.
   */
  onBack?: () => void;
  /** Optional label for the back button (defaults to "Back"). */
  backLabel?: string;
  /** Right-side header slot for actions like "New" or visibility toggles. */
  rightHeaderSlot?: React.ReactNode;
  /** Free slot below tabs, above body — typically a search input. */
  toolbar?: React.ReactNode;
  /**
   * Mobile: detail panels (Place / Route / Capture / Collection) pass
   * `true` to start the sheet collapsed so the map stays visible by
   * default — the user can drag up when they want the full body.
   * Lists default to the middle snap so half-map / half-list is the
   * landing experience.
   */
  mobileCollapsible?: boolean;
  children: React.ReactNode;
}

/**
 * Shared shell for the discover surfaces: Routes / Collections / Places.
 * Desktop: 380px left-anchored full-height sidebar.
 * Mobile: draggable bottom sheet via `MobileBottomSheet` (3 snap
 * positions — collapsed / middle / expanded), unified with Search
 * and Directions so every panel feels the same.
 *
 * Each list provides its own tabs + toolbar + body. Header layout, close
 * button, and sheet chrome are unified here so the three resources look
 * identical aside from their content.
 */
export function DiscoverSidebar({
  title,
  tabs,
  activeTab,
  onTabChange,
  onClose,
  onBack,
  backLabel,
  rightHeaderSlot,
  toolbar,
  mobileCollapsible = false,
  children,
}: Props) {
  useSidebarPresence();

  const tabStrip = tabs && tabs.length > 0 && (
    <div className="flex flex-wrap items-center gap-1.5">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onTabChange?.(t.id)}
          className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
            activeTab === t.id
              ? "border-accent bg-accent text-white"
              : "border-border bg-surface text-foreground hover:border-accent"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );

  // Mobile header (handle is rendered by MobileBottomSheet). We keep
  // the exact same controls as the desktop header — title, back, close,
  // tabs, toolbar — collapsed into the always-visible peek so the user
  // can navigate even when the sheet is at its smallest snap.
  const mobileHeader = (
    <div className="flex-shrink-0 px-4 pb-3">
      <div className="flex items-center justify-between gap-2">
        {onBack ? (
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-xs font-medium text-muted transition-colors hover:text-foreground"
            aria-label="Back"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {backLabel ?? "Back"}
          </button>
        ) : (
          <span className="text-sm font-medium text-foreground">{title}</span>
        )}
        <div className="flex items-center gap-1">
          {rightHeaderSlot}
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      {(tabStrip || toolbar) && (
        <div className="mt-2 space-y-2">
          {tabStrip}
          {toolbar}
        </div>
      )}
    </div>
  );

  const mobileDefault: SheetSnap = mobileCollapsible ? "collapsed" : "middle";

  return (
    <>
      {/* Desktop: left-anchored full-height sidebar */}
      <div className="pointer-events-auto absolute inset-y-0 left-12 z-10 hidden w-[380px] flex-col border-r border-border bg-background shadow-xl md:flex">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          {onBack ? (
            <button
              onClick={onBack}
              className="flex items-center gap-1 text-xs font-medium text-muted transition-colors hover:text-foreground"
              aria-label="Back"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              {backLabel ?? "Back"}
            </button>
          ) : (
            <span className="text-xs font-medium uppercase tracking-wide text-muted">
              {title}
            </span>
          )}
          <div className="flex items-center gap-1">
            {rightHeaderSlot}
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-muted transition-colors hover:bg-surface hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        {(tabStrip || toolbar) && (
          <div className="space-y-2 border-b border-border/60 px-4 py-2">
            {tabStrip}
            {toolbar}
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
      </div>

      {/* Mobile: shared draggable bottom sheet */}
      <MobileBottomSheet defaultSnap={mobileDefault} header={mobileHeader}>
        <div className="border-t border-border px-4 py-3">{children}</div>
      </MobileBottomSheet>
    </>
  );
}
