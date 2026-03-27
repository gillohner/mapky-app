import { createRootRoute, Outlet } from "@tanstack/react-router";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { MapView } from "@/components/map/MapView";
import { MapkyPlacesLayer } from "@/components/map/MapkyPlacesLayer";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Toaster } from "sonner";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <QueryProvider>
      <AuthProvider>
        <div className="relative h-dvh w-full">
          <MapView />
          <MapkyPlacesLayer />
          <div className="pointer-events-none absolute inset-0 z-10">
            <Outlet />
          </div>
          <ThemeToggle />
        </div>
        <Toaster position="bottom-center" />
      </AuthProvider>
    </QueryProvider>
  );
}
