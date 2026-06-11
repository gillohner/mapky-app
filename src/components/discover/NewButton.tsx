import { Plus } from "lucide-react";

interface Props {
  onClick: () => void;
  /** Label shown next to the plus icon (e.g. "New Route"). */
  label: string;
}

/**
 * Standard "create new …" button used at the top of every discover
 * list body (Routes / Captures). Full-width, dashed
 * border, muted by default, accent on hover — matches the
 * "secondary action" feel of the lists. Replaces the small
 * top-right corner buttons we used to have on Routes/Captures.
 */
export function DiscoverNewButton({ onClick, label }: Props) {
  return (
    <button
      onClick={onClick}
      className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted transition-colors hover:border-accent hover:text-accent"
    >
      <Plus className="h-4 w-4" />
      {label}
    </button>
  );
}
