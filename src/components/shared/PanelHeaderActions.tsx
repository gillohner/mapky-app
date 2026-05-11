import { Loader2, Pencil, Share2, Trash2 } from "lucide-react";

interface ActionSpec {
  onClick: () => void;
  /** Icon button is hidden when undefined. */
  enabled?: boolean;
  loading?: boolean;
  title?: string;
}

interface Props {
  share?: ActionSpec;
  edit?: ActionSpec;
  /** Delete is rendered with a danger hover variant. */
  remove?: ActionSpec;
}

/**
 * Standard right-side header for detail panels — Share, Edit, Delete
 * as small icon buttons rendered into `DiscoverSidebar`'s
 * `rightHeaderSlot`. The X close button is owned by `DiscoverSidebar`
 * and sits to the right of these.
 *
 * Each action is optional. Pass `undefined` to omit, or set
 * `enabled: false` to disable. `Edit` and `Delete` are owner-only by
 * convention; the consumer decides whether to pass them.
 */
export function PanelHeaderActions({ share, edit, remove }: Props) {
  return (
    <>
      {share && (
        <IconButton
          ariaLabel="Share"
          title={share.title ?? "Copy share link"}
          onClick={share.onClick}
          disabled={share.enabled === false}
        >
          <Share2 className="h-4 w-4" />
        </IconButton>
      )}
      {edit && (
        <IconButton
          ariaLabel="Edit"
          title={edit.title ?? "Edit"}
          onClick={edit.onClick}
          disabled={edit.enabled === false || edit.loading}
        >
          {edit.loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Pencil className="h-4 w-4" />
          )}
        </IconButton>
      )}
      {remove && (
        <IconButton
          ariaLabel="Delete"
          title={remove.title ?? "Delete"}
          onClick={remove.onClick}
          disabled={remove.enabled === false || remove.loading}
          tone="danger"
        >
          {remove.loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </IconButton>
      )}
    </>
  );
}

function IconButton({
  ariaLabel,
  title,
  onClick,
  disabled,
  tone = "neutral",
  children,
}: {
  ariaLabel: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "neutral" | "danger";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "danger"
      ? "hover:bg-red-500/10 hover:text-red-500"
      : "hover:bg-surface hover:text-foreground";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
      className={`rounded-lg p-1 text-muted transition-colors disabled:opacity-50 ${toneClass}`}
    >
      {children}
    </button>
  );
}
