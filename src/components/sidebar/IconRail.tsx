import { useState } from "react";
import { Menu as MenuIcon, Sun, Moon, User, FolderHeart, MessageSquare, Plus, Route as RouteIcon } from "lucide-react";
import { useCaptureCreationStore } from "@/stores/capture-creation-store";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/components/auth/AuthProvider";
import { useUiStore } from "@/stores/ui-store";
import { useMapStore } from "@/stores/map-store";
import { getPubkyAvatarUrl } from "@/lib/api/user";
import { useUserProfile } from "@/lib/api/hooks";

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
  const openCapture = useCaptureCreationStore((s) => s.open);
  const captureIsOpen = useCaptureCreationStore((s) => s.isOpen);
  const theme = useMapStore((s) => s.theme);
  const setTheme = useMapStore((s) => s.setTheme);
  const [imgError, setImgError] = useState(false);
  // Only request the avatar gateway URL when we know the user has an image
  // in their profile — otherwise the gateway 404s and we'd be displaying
  // the icon fallback anyway. Eliminates a console error on every signup
  // for users without avatars.
  const profile = useUserProfile(publicKey);
  const hasAvatar = Boolean(profile.data?.image);
  const avatarUrl =
    isAuthenticated && publicKey && hasAvatar
      ? getPubkyAvatarUrl(publicKey)
      : null;

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

      {/* Collections */}
      {isAuthenticated && (
        <RailButton
          onClick={() => navigate({ to: "/collections" })}
          title="Collections"
        >
          <FolderHeart className="h-5 w-5" />
        </RailButton>
      )}

      {/* Routes */}
      <RailButton
        onClick={() => navigate({ to: "/routes" })}
        title="Routes"
      >
        <RouteIcon className="h-5 w-5" />
      </RailButton>

      {/* My Posts */}
      {isAuthenticated && (
        <RailButton
          onClick={() => navigate({ to: "/my-posts" })}
          title="My Posts"
        >
          <MessageSquare className="h-5 w-5" />
        </RailButton>
      )}

      {/* New Capture */}
      {isAuthenticated && !captureIsOpen && (
        <>
          <div className="my-1 w-6 border-t border-border" />
          <RailButton onClick={openCapture} title="New capture">
            <Plus className="h-5 w-5" />
          </RailButton>
        </>
      )}
    </div>
  );
}
