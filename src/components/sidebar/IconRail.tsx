import { useState } from "react";
import { Menu as MenuIcon, Sun, Moon, Eye, EyeOff, User, FolderHeart } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/components/auth/AuthProvider";
import { useUiStore } from "@/stores/ui-store";
import { useMapStore } from "@/stores/map-store";
import { getPubkyAvatarUrl } from "@/lib/api/user";

function RailButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-10 w-10 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-foreground"
    >
      {children}
    </button>
  );
}

export function IconRail() {
  const { isAuthenticated, publicKey } = useAuth();
  const navigate = useNavigate();
  const toggleMenu = useUiStore((s) => s.toggleMenu);
  const placesLayerVisible = useUiStore((s) => s.placesLayerVisible);
  const togglePlacesLayer = useUiStore((s) => s.togglePlacesLayer);
  const theme = useMapStore((s) => s.theme);
  const setTheme = useMapStore((s) => s.setTheme);
  const [imgError, setImgError] = useState(false);

  const avatarUrl =
    isAuthenticated && publicKey ? getPubkyAvatarUrl(publicKey) : null;

  const handleThemeToggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  return (
    <div className="pointer-events-auto absolute left-0 top-0 z-20 hidden h-full w-12 flex-col items-center gap-1 border-r border-border bg-background/80 py-3 backdrop-blur md:flex">
      {/* Menu / Avatar button */}
      <RailButton onClick={toggleMenu} title="Menu">
        {avatarUrl && !imgError ? (
          <img
            src={avatarUrl}
            alt="Menu"
            className="h-8 w-8 rounded-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : isAuthenticated ? (
          <User className="h-5 w-5" />
        ) : (
          <MenuIcon className="h-5 w-5" />
        )}
      </RailButton>

      <div className="my-1 w-6 border-t border-border" />

      {/* Theme toggle */}
      <RailButton onClick={handleThemeToggle} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
        {theme === "dark" ? (
          <Sun className="h-5 w-5" />
        ) : (
          <Moon className="h-5 w-5" />
        )}
      </RailButton>

      {/* Places layer toggle */}
      <RailButton
        onClick={togglePlacesLayer}
        title={placesLayerVisible ? "Hide Pubky places" : "Show Pubky places"}
      >
        {placesLayerVisible ? (
          <Eye className="h-5 w-5" />
        ) : (
          <EyeOff className="h-5 w-5" />
        )}
      </RailButton>

      {/* Collections */}
      {isAuthenticated && (
        <RailButton
          onClick={() => navigate({ to: "/collections" })}
          title="Collections"
        >
          <FolderHeart className="h-5 w-5" />
        </RailButton>
      )}
    </div>
  );
}
