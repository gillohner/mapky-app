import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LogIn,
  LogOut,
  Moon,
  Sun,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth/AuthProvider";
import { useUiStore } from "@/stores/ui-store";
import { useMapStore } from "@/stores/map-store";
import { useUserProfile } from "@/lib/api/hooks";
import {
  getInitials,
  getPubkyAvatarUrl,
  truncatePublicKey,
} from "@/lib/api/user";
import { MAIN_NAV, navMatch, type NavTarget } from "./nav-items";

/**
 * Mobile-only slide-in nav drawer. Replaces the persistent `IconRail`
 * below the `md:` breakpoint so the map can occupy the full viewport
 * width. Tapping the hamburger button (`MobileMenuTrigger`) opens it;
 * tapping the backdrop, pressing Escape, or navigating to a new route
 * closes it.
 *
 * The drawer also pulls the account block (sign-in / sign-out) and
 * theme toggle out of the rail's popover, since the full-width drawer
 * has the room to render them as first-class rows instead.
 */
export function MobileNavDrawer() {
  const open = useUiStore((s) => s.mobileNavOpen);
  const setMobileNavOpen = useUiStore((s) => s.setMobileNavOpen);

  const { isAuthenticated, publicKey, logout } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const theme = useMapStore((s) => s.theme);
  const setTheme = useMapStore((s) => s.setTheme);
  const profile = useUserProfile(publicKey);

  // Auto-close on route change. Tapping a nav item navigates and
  // this effect closes the drawer in the next tick — no manual close
  // call inside each item.
  useEffect(() => {
    if (open) setMobileNavOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Escape closes; lock body scroll while open so the drawer doesn't
  // scroll the (absolutely-positioned) map underneath.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, setMobileNavOpen]);

  const navTo = (to: NavTarget) => {
    const matchPrefix = navMatch(to);
    if (pathname.startsWith(matchPrefix)) navigate({ to: "/" });
    else navigate({ to });
  };
  const isActive = (to: NavTarget) => pathname.startsWith(navMatch(to));

  const handleThemeToggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  const handleLogout = () => {
    logout();
    setMobileNavOpen(false);
    toast.success("Signed out");
    navigate({ to: "/" });
  };

  const initials = getInitials(profile.data?.name);
  const displayName =
    profile.data?.name || (publicKey ? truncatePublicKey(publicKey, 8) : "");
  const hasAvatar = Boolean(profile.data?.image);
  const avatarUrl =
    isAuthenticated && publicKey && hasAvatar
      ? getPubkyAvatarUrl(publicKey)
      : null;

  // Render to the body so the drawer stacks above the map regardless
  // of where it's mounted in the React tree, and unmount when closed
  // to remove its event listeners + DOM weight from the page.
  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      className="fixed inset-0 z-40 md:hidden"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close menu"
        onClick={() => setMobileNavOpen(false)}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />

      {/* Panel */}
      <aside className="absolute left-0 top-0 flex h-full w-[80%] max-w-[320px] flex-col border-r border-border bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-3 py-3">
          <span className="text-sm font-semibold text-foreground">Menu</span>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close menu"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Account block */}
        <div className="border-b border-border p-3">
          {isAuthenticated ? (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-accent-subtle">
                  {avatarUrl ? (
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
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface"
              >
                <LogOut className="h-4 w-4 text-muted" />
                Sign out
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="flex items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
            >
              <LogIn className="h-4 w-4" />
              Sign in
            </Link>
          )}
        </div>

        {/* Main nav */}
        <nav className="flex-1 overflow-y-auto py-1">
          {MAIN_NAV.map((item) => {
            if (item.requiresAuth && !isAuthenticated) return null;
            const Icon = item.icon;
            const active = isActive(item.to);
            return (
              <button
                key={item.to}
                type="button"
                onClick={() => navTo(item.to)}
                className={`flex w-full items-center gap-3 px-3 py-3 text-left text-sm transition-colors ${
                  active
                    ? "bg-accent/10 text-accent"
                    : "text-foreground hover:bg-surface"
                }`}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Theme toggle */}
        <div className="border-t border-border p-1.5">
          <button
            type="button"
            onClick={handleThemeToggle}
            className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface"
          >
            {theme === "dark" ? (
              <Sun className="h-5 w-5 text-muted" />
            ) : (
              <Moon className="h-5 w-5 text-muted" />
            )}
            <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
          </button>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
