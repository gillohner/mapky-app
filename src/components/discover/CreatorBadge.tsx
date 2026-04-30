import { User } from "lucide-react";
import { useUserProfile } from "@/lib/api/hooks";
import {
  getInitials,
  getPubkyAvatarUrl,
  truncatePublicKey,
} from "@/lib/api/user";

interface Props {
  authorId: string;
  /** Visual size — `xs` for inline footers, `sm` for primary creator labels. */
  size?: "xs" | "sm";
  /** Falsy hides the name string and shows just the avatar. */
  showName?: boolean;
  className?: string;
}

/**
 * Small "made by …" badge used at the bottom of every discover card
 * (Routes, Collections, Captures). Pulls the user's profile via
 * useUserProfile (TanStack Query, 5-min stale, retries idempotent
 * 404s) and falls back to a truncated public key when no profile is
 * available.
 */
export function CreatorBadge({
  authorId,
  size = "xs",
  showName = true,
  className,
}: Props) {
  const { data } = useUserProfile(authorId);
  const name = data?.name || truncatePublicKey(authorId, 6);
  const avatarUrl = data?.image ? getPubkyAvatarUrl(authorId) : null;
  const dim = size === "sm" ? "h-5 w-5" : "h-4 w-4";
  const text = size === "sm" ? "text-xs" : "text-[10px]";
  const initialFont = size === "sm" ? "text-[9px]" : "text-[7px]";

  return (
    <div className={`flex items-center gap-1.5 ${className ?? ""}`}>
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className={`${dim} flex-shrink-0 rounded-full object-cover`}
          loading="lazy"
        />
      ) : (
        <span
          className={`${dim} flex flex-shrink-0 items-center justify-center rounded-full bg-accent-subtle font-semibold text-accent ${initialFont}`}
          aria-hidden
        >
          {getInitials(data?.name) || <User className="h-2.5 w-2.5" />}
        </span>
      )}
      {showName && (
        <span className={`truncate ${text} text-muted`}>{name}</span>
      )}
    </div>
  );
}
