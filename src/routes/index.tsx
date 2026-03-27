import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/components/auth/AuthProvider";
import { LogIn, LogOut, User } from "lucide-react";

export const Route = createFileRoute("/")({
  component: MapHUD,
});

function MapHUD() {
  const { isAuthenticated, publicKey, logout } = useAuth();

  return (
    <div className="pointer-events-auto absolute right-4 top-4 flex flex-col gap-2">
      {isAuthenticated ? (
        <>
          <div className="flex items-center gap-2 rounded-lg bg-mapky-bg/90 px-3 py-2 text-xs shadow-lg backdrop-blur dark:bg-mapky-bg-dark/90">
            <User className="h-4 w-4 text-mapky-primary dark:text-mapky-primary-dark" />
            <span className="max-w-[120px] truncate font-mono text-mapky-text dark:text-mapky-text-dark">
              {publicKey?.slice(0, 12)}...
            </span>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 rounded-lg bg-mapky-bg/90 px-3 py-2 text-xs font-medium shadow-lg backdrop-blur transition-colors hover:bg-red-50 dark:bg-mapky-bg-dark/90 dark:hover:bg-red-950"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </>
      ) : (
        <Link
          to="/login"
          className="flex items-center gap-2 rounded-lg bg-mapky-primary px-4 py-2.5 text-sm font-medium text-white shadow-lg transition-colors hover:bg-mapky-primary/90 dark:bg-mapky-primary-dark dark:hover:bg-mapky-primary-dark/90"
        >
          <LogIn className="h-4 w-4" />
          Sign in
        </Link>
      )}
    </div>
  );
}
