import { Menu as MenuIcon, User } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useUiStore } from "@/stores/ui-store";
import { getPubkyAvatarUrl } from "@/lib/api/user";
import { useState } from "react";

export function MobileMenuTrigger() {
  const { isAuthenticated, publicKey } = useAuth();
  const toggleMenu = useUiStore((s) => s.toggleMenu);
  const [imgError, setImgError] = useState(false);

  const avatarUrl =
    isAuthenticated && publicKey ? getPubkyAvatarUrl(publicKey) : null;

  return (
    <button
      onClick={toggleMenu}
      className="pointer-events-auto absolute left-3 top-3 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-background/90 shadow-lg backdrop-blur transition-colors hover:bg-surface md:hidden"
    >
      {avatarUrl && !imgError ? (
        <img
          src={avatarUrl}
          alt="Menu"
          className="h-full w-full rounded-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : isAuthenticated ? (
        <User className="h-5 w-5 text-foreground" />
      ) : (
        <MenuIcon className="h-5 w-5 text-foreground" />
      )}
    </button>
  );
}
