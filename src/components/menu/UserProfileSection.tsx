import { User, LogIn } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/components/auth/AuthProvider";
import { useUserProfile } from "@/lib/api/hooks";
import { useUiStore } from "@/stores/ui-store";
import {
  getPubkyAvatarUrl,
  getInitials,
  truncatePublicKey,
} from "@/lib/api/user";
import { useState } from "react";

export function UserProfileSection() {
  const { isAuthenticated, publicKey } = useAuth();
  const { data: profile } = useUserProfile(
    isAuthenticated ? publicKey : null,
  );
  const [imgError, setImgError] = useState(false);

  if (!isAuthenticated) {
    return (
      <div className="p-4">
        <Link
          to="/login"
          onClick={() => useUiStore.getState().setMenuOpen(false)}
          className="flex items-center gap-3 rounded-lg bg-accent px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          <LogIn className="h-5 w-5" />
          Sign in
        </Link>
      </div>
    );
  }

  const avatarUrl = publicKey ? getPubkyAvatarUrl(publicKey) : null;
  const initials = getInitials(profile?.name);
  const displayName = profile?.name || truncatePublicKey(publicKey, 8);

  return (
    <div className="p-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-accent-subtle">
          {avatarUrl && !imgError ? (
            <img
              src={avatarUrl}
              alt={profile?.name || "Avatar"}
              className="h-full w-full object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-accent">
              {initials || <User className="h-5 w-5" />}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {displayName}
          </p>
          {profile?.name && publicKey && (
            <p className="truncate font-mono text-xs text-muted">
              {truncatePublicKey(publicKey, 8)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
