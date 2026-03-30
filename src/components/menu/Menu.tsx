import { useEffect } from "react";
import { Sun, Moon, Eye, EyeOff, LogOut, FolderHeart, Settings } from "lucide-react";
import { useUiStore } from "@/stores/ui-store";
import { useMapStore } from "@/stores/map-store";
import { useAuth } from "@/components/auth/AuthProvider";
import { UserProfileSection } from "./UserProfileSection";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";

export function Menu() {
  const menuOpen = useUiStore((s) => s.menuOpen);
  const setMenuOpen = useUiStore((s) => s.setMenuOpen);
  const placesLayerVisible = useUiStore((s) => s.placesLayerVisible);
  const togglePlacesLayer = useUiStore((s) => s.togglePlacesLayer);
  const theme = useMapStore((s) => s.theme);
  const setTheme = useMapStore((s) => s.setTheme);
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen, setMenuOpen]);

  const handleThemeToggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  const handleLogout = () => {
    logout();
    setMenuOpen(false);
    toast.success("Signed out");
    navigate({ to: "/" });
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`pointer-events-auto fixed inset-0 z-30 bg-black/40 transition-opacity duration-200 ${
          menuOpen
            ? "opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        onClick={() => setMenuOpen(false)}
      />

      {/* Panel */}
      <div
        className={`pointer-events-auto fixed left-0 top-0 z-40 flex h-full w-72 flex-col bg-background shadow-2xl transition-transform duration-200 ease-out ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* User profile */}
        <UserProfileSection />

        <div className="mx-4 border-t border-border" />

        {/* Menu items */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {/* Theme toggle */}
          <button
            onClick={handleThemeToggle}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-surface"
          >
            {theme === "dark" ? (
              <Sun className="h-5 w-5 text-muted" />
            ) : (
              <Moon className="h-5 w-5 text-muted" />
            )}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>

          {/* Places layer toggle */}
          <button
            onClick={togglePlacesLayer}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-surface"
          >
            {placesLayerVisible ? (
              <Eye className="h-5 w-5 text-muted" />
            ) : (
              <EyeOff className="h-5 w-5 text-muted" />
            )}
            Pubky Places
            <span
              className={`ml-auto text-xs ${
                placesLayerVisible ? "text-accent" : "text-muted"
              }`}
            >
              {placesLayerVisible ? "ON" : "OFF"}
            </span>
          </button>

          <div className="mx-1 my-2 border-t border-border" />

          {/* Future items */}
          <button
            disabled
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted opacity-50"
          >
            <FolderHeart className="h-5 w-5" />
            Collections
            <span className="ml-auto text-xs">Soon</span>
          </button>

          <button
            disabled
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted opacity-50"
          >
            <Settings className="h-5 w-5" />
            Settings
            <span className="ml-auto text-xs">Soon</span>
          </button>
        </div>

        {/* Logout */}
        {isAuthenticated && (
          <div className="border-t border-border p-2">
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-red-50 dark:hover:bg-red-950"
            >
              <LogOut className="h-5 w-5 text-muted" />
              Sign out
            </button>
          </div>
        )}
      </div>
    </>
  );
}
