import { AlertTriangle, X } from "lucide-react";

/**
 * Tailwind confirmation modal for destructive actions. Mirrors the
 * AddRegionDialog visual so the offline panel keeps one consistent
 * dialog idiom. `onConfirm` is called only when the user clicks the
 * primary button; closing via the X / Cancel / backdrop just
 * dismisses without firing.
 *
 * `tone="danger"` (default) paints the primary button red — used for
 * irreversible operations. `tone="primary"` is for benign confirms
 * (rare here).
 */
export interface ConfirmDialogProps {
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-lg border border-border bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <AlertTriangle
              className={
                tone === "danger"
                  ? "h-4 w-4 text-red-500"
                  : "h-4 w-4 text-amber-500"
              }
            />
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted hover:bg-surface hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="px-4 py-3 text-xs text-foreground">{body}</div>

        <footer className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface/60"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            className={
              tone === "danger"
                ? "rounded-md bg-red-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700"
                : "rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90"
            }
          >
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
