import { useEffect, useRef, useState } from "react";
import {
  FolderHeart,
  LogIn,
  LogOut,
  MapPin,
  MessageSquare,
  Moon,
  Plus,
  Route as RouteIcon,
  Sun,
  User,
} from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useCaptureCreationStore } from "@/stores/capture-creation-store";
import { useAuth } from "@/components/auth/AuthProvider";
import { useMapStore } from "@/stores/map-store";
import {
  getPubkyAvatarUrl,
  getInitials,
  truncatePublicKey,
} from "@/lib/api/user";
import { useUserProfile } from "@/lib/api/hooks";

function RailButton({
  onClick,
  title,
  active,
  children,
}: {
  onClick: () => void;
  title: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
        active
          ? "bg-accent/10 text-accent"
          : "text-muted hover:bg-surface hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Always-visible left rail. Hosts navigation, theme toggle, capture
 * creation, and an avatar button that opens a small profile popover
 * with sign-in / sign-out. There used to be a separate full-height
 * Menu drawer on top of this rail; everything it carried lives here
 * now, so the slim rail is the single navigation surface on every
 * breakpoint.
 */
export function IconRail() {
  const { isAuthenticated, publicKey, logout } = useAuth();
  const navigate = useNavigate();
  const openCapture = useCaptureCreationStore((s) => s.open);
  const captureIsOpen = useCaptureCreationStore((s) => s.isOpen);
  const theme = useMapStore((s) => s.theme);
  const setTheme = useMapStore((s) => s.setTheme);

  const [profileOpen, setProfileOpen] = useState(false);
  const [imgError, setImgError] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hoverCloseTimerRef = useRef<number | null>(null);

  const cancelHoverClose = () => {
    if (hoverCloseTimerRef.current !== null) {
      window.clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
  };
  const scheduleHoverClose = () => {
    cancelHoverClose();
    hoverCloseTimerRef.current = window.setTimeout(() => {
      setProfileOpen(false);
      hoverCloseTimerRef.current = null;
    }, 150);
  };
  useEffect(() => cancelHoverClose, []);

  const profile = useUserProfile(publicKey);
  const hasAvatar = Boolean(profile.data?.image);
  const avatarUrl =
    isAuthenticated && publicKey && hasAvatar
      ? getPubkyAvatarUrl(publicKey)
      : null;

  useEffect(() => {
    if (!profileOpen) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setProfileOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setProfileOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [profileOpen]);

  const handleThemeToggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  const handleLogout = () => {
    logout();
    setProfileOpen(false);
    toast.success("Signed out");
    navigate({ to: "/" });
  };

  const initials = getInitials(profile.data?.name);
  const displayName =
    profile.data?.name ||
    (publicKey ? truncatePublicKey(publicKey, 8) : "");

  return (
    <div className="pointer-events-auto absolute left-0 top-0 z-30 flex h-full w-12 flex-col items-center gap-1 border-r border-border bg-background/80 py-3 backdrop-blur">
      {/* Avatar / profile popover trigger */}
      <button
        ref={triggerRef}
        onClick={() => setProfileOpen((v) => !v)}
        onMouseEnter={() => {
          cancelHoverClose();
          setProfileOpen(true);
        }}
        onMouseLeave={scheduleHoverClose}
        onFocus={() => setProfileOpen(true)}
        title={isAuthenticated ? "Account" : "Sign in"}
        aria-label="Account"
        className="flex h-10 w-10 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-foreground"
      >
        {avatarUrl && !imgError ? (
          <img
            src={avatarUrl}
            alt=""
            className="h-8 w-8 rounded-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : isAuthenticated ? (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-subtle text-xs font-semibold text-accent">
            {initials || <User className="h-4 w-4" />}
          </span>
        ) : (
          <User className="h-5 w-5" />
        )}
      </button>

      <div className="my-1 w-6 border-t border-border" />

      <RailButton
        onClick={handleThemeToggle}
        title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      >
        {theme === "dark" ? (
          <Sun className="h-5 w-5" />
        ) : (
          <Moon className="h-5 w-5" />
        )}
      </RailButton>

      <RailButton
        onClick={() => navigate({ to: "/places" })}
        title="Places"
      >
        <MapPin className="h-5 w-5" />
      </RailButton>

      {isAuthenticated && (
        <RailButton
          onClick={() => navigate({ to: "/collections" })}
          title="Collections"
        >
          <FolderHeart className="h-5 w-5" />
        </RailButton>
      )}

      <RailButton
        onClick={() => navigate({ to: "/routes" })}
        title="Routes"
      >
        <RouteIcon className="h-5 w-5" />
      </RailButton>

      {isAuthenticated && (
        <RailButton
          onClick={() => navigate({ to: "/my-posts" })}
          title="My Posts"
        >
          <MessageSquare className="h-5 w-5" />
        </RailButton>
      )}

      {isAuthenticated && !captureIsOpen && (
        <>
          <div className="my-1 w-6 border-t border-border" />
          <RailButton onClick={openCapture} title="New capture">
            <Plus className="h-5 w-5" />
          </RailButton>
        </>
      )}

      {profileOpen && (
        <div
          ref={popoverRef}
          onMouseEnter={cancelHoverClose}
          onMouseLeave={scheduleHoverClose}
          className="absolute left-12 top-2 z-30 ml-1 w-64 rounded-lg border border-border bg-background/95 shadow-xl backdrop-blur"
        >
          {isAuthenticated ? (
            <>
              <div className="flex items-center gap-3 p-3">
                <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-accent-subtle">
                  {avatarUrl && !imgError ? (
                    <img
                      src={avatarUrl}
                      alt=""
                      className="h-full w-full object-cover"
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
                  {profile.data?.name && publicKey && (
                    <p className="truncate font-mono text-[11px] text-muted">
                      {truncatePublicKey(publicKey, 8)}
                    </p>
                  )}
                </div>
              </div>
              <div className="border-t border-border p-1.5">
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface"
                >
                  <LogOut className="h-4 w-4 text-muted" />
                  Sign out
                </button>
              </div>
            </>
          ) : (
            <Link
              to="/login"
              onClick={() => setProfileOpen(false)}
              className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover m-2"
            >
              <LogIn className="h-4 w-4" />
              Sign in
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
