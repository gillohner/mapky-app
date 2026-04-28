import { useEffect, useState } from "react";
import { X, ChevronUp, ChevronDown } from "lucide-react";
import { useUiStore } from "@/stores/ui-store";

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
  onClose: () => void;
  /** Right-side header slot for actions like "New" or visibility toggles. */
  rightHeaderSlot?: React.ReactNode;
  /** Free slot below tabs, above body — typically a search input. */
  toolbar?: React.ReactNode;
  /** Mobile sheet collapsed by default; user expands with the chevron. */
  mobileCollapsible?: boolean;
  children: React.ReactNode;
}

/**
 * Shared shell for the discover surfaces: Routes / Collections / Places.
 * Desktop: 380px left-anchored full-height sidebar.
 * Mobile: rounded-top bottom sheet (max 85vh, optionally collapsible).
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
  rightHeaderSlot,
  toolbar,
  mobileCollapsible = false,
  children,
}: Props) {
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);

  useEffect(() => {
    setSidebarOpen(true);
    return () => setSidebarOpen(false);
  }, [setSidebarOpen]);

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

  return (
    <>
      {/* Desktop: left-anchored full-height sidebar */}
      <div className="pointer-events-auto absolute inset-y-0 left-12 z-10 hidden w-[380px] flex-col border-r border-border bg-background shadow-xl md:flex">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            {title}
          </span>
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

      {/* Mobile: bottom sheet */}
      <MobileSheet
        title={title}
        onClose={onClose}
        rightHeaderSlot={rightHeaderSlot}
        tabStrip={tabStrip}
        toolbar={toolbar}
        collapsible={mobileCollapsible}
      >
        {children}
      </MobileSheet>
    </>
  );
}

function MobileSheet({
  title,
  onClose,
  rightHeaderSlot,
  tabStrip,
  toolbar,
  collapsible,
  children,
}: {
  title: string;
  onClose: () => void;
  rightHeaderSlot?: React.ReactNode;
  tabStrip?: React.ReactNode;
  toolbar?: React.ReactNode;
  collapsible: boolean;
  children: React.ReactNode;
}) {
  // Collapsible sheets default expanded for discovery (the body is the
  // point); detail panels can pass collapsible=true and start collapsed.
  // Routes/Collections/Places lists pass collapsible=false → fixed max-h.
  const [expanded, setExpanded] = useState(!collapsible);

  return (
    <div
      className={`pointer-events-auto absolute bottom-0 left-12 right-0 z-10 flex flex-col rounded-t-2xl border-t border-l border-border bg-background shadow-2xl transition-[max-height] duration-300 ease-out md:hidden ${
        expanded ? "max-h-[85vh]" : "max-h-[120px]"
      }`}
    >
      <div className="flex-shrink-0 px-4 pt-2 pb-3">
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border" />
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-foreground">{title}</span>
          <div className="flex items-center gap-1">
            {rightHeaderSlot}
            {collapsible && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface hover:text-foreground"
                aria-label={expanded ? "Collapse" : "Expand"}
              >
                {expanded ? (
                  <ChevronDown className="h-5 w-5" />
                ) : (
                  <ChevronUp className="h-5 w-5" />
                )}
              </button>
            )}
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
      {expanded && (
        <div className="flex-1 overflow-y-auto border-t border-border px-4 py-3">
          {children}
        </div>
      )}
    </div>
  );
}

