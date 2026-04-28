import { createRootRoute, Outlet } from "@tanstack/react-router";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { MapView } from "@/components/map/MapView";
import { MapkyPlacesLayer } from "@/components/map/MapkyPlacesLayer";
import { CaptureMarkersLayer } from "@/components/map/CaptureMarkersLayer";
import { SequenceCoverageLayer } from "@/components/map/SequenceCoverageLayer";
import { PoiClickHandler } from "@/components/map/PoiClickHandler";
import { SelectedPlaceMarker } from "@/components/map/SelectedPlaceMarker";
import { CollectionOverlays } from "@/components/map/CollectionOverlays";
import { ViewportRoutesGate } from "@/components/map/ViewportRoutesGate";
import { RailOverlayLayer } from "@/components/map/RailOverlayLayer";
import { CyclingOverlayLayer } from "@/components/map/CyclingOverlayLayer";
import { TerrainOverlayLayer } from "@/components/map/TerrainOverlayLayer";
import { LayerSheet } from "@/components/map/LayerSheet";
import { LayerSheetTrigger } from "@/components/map/LayerSheetTrigger";
import { IconRail } from "@/components/sidebar/IconRail";
import { SearchBar } from "@/components/sidebar/SearchBar";
import { CaptureCreationPanel } from "@/components/capture/CaptureCreationPanel";
import { MainMapCaptureOverlay } from "@/components/capture/MainMapCaptureOverlay";
import { DirectionsLayer } from "@/components/route/DirectionsLayer";
import { Menu } from "@/components/menu/Menu";
import { Toaster } from "sonner";
import { useUrlSync } from "@/hooks/use-url-sync";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  useUrlSync();
  return (
    <QueryProvider>
      <AuthProvider>
        <div className="relative h-dvh w-screen overflow-hidden">
          <MapView />
          <MapkyPlacesLayer />
          <CaptureMarkersLayer />
          <SequenceCoverageLayer />
          <MainMapCaptureOverlay />
          <CollectionOverlays />
          <ViewportRoutesGate />
          <TerrainOverlayLayer />
          <RailOverlayLayer />
          <CyclingOverlayLayer />
          <PoiClickHandler />
          <SelectedPlaceMarker />
          <IconRail />
          <SearchBar />
          <DirectionsLayer />
          <CaptureCreationPanel />
          <Outlet />
          <Menu />
          <LayerSheetTrigger />
          <LayerSheet />
        </div>
        <Toaster position="bottom-center" />
      </AuthProvider>
    </QueryProvider>
  );
}

