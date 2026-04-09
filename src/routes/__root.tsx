import { createRootRoute, Outlet } from "@tanstack/react-router";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { MapView } from "@/components/map/MapView";
import { MapkyPlacesLayer } from "@/components/map/MapkyPlacesLayer";
import { PoiClickHandler } from "@/components/map/PoiClickHandler";
import { SelectedPlaceMarker } from "@/components/map/SelectedPlaceMarker";
import { CollectionOverlays } from "@/components/map/CollectionOverlays";
import { IconRail } from "@/components/sidebar/IconRail";
import { SearchBar } from "@/components/sidebar/SearchBar";
import { Menu } from "@/components/menu/Menu";
import { Toaster } from "sonner";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <QueryProvider>
      <AuthProvider>
        <div className="relative h-dvh w-screen overflow-hidden">
          <MapView />
          <MapkyPlacesLayer />
          <CollectionOverlays />
          <PoiClickHandler />
          <SelectedPlaceMarker />
          <IconRail />
          <SearchBar />
          <Outlet />
          <Menu />
        </div>
        <Toaster position="bottom-center" />
      </AuthProvider>
    </QueryProvider>
  );
}
