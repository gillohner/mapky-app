import { createRootRoute, Outlet } from "@tanstack/react-router";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { MapView } from "@/components/map/MapView";
import { PlaceAnnotationsLayer } from "@/components/map/PlaceAnnotationsLayer";
import { CaptureMarkersLayer } from "@/components/map/CaptureMarkersLayer";
import { SequenceCoverageLayer } from "@/components/map/SequenceCoverageLayer";
import { PoiClickHandler } from "@/components/map/PoiClickHandler";
import { SelectedPlaceMarker } from "@/components/map/SelectedPlaceMarker";
import { RailOverlayLayer } from "@/components/map/RailOverlayLayer";
import { BtcOverlayLayer } from "@/components/map/BtcOverlayLayer";
import { MapLegends } from "@/components/map/MapLegends";
import { Buildings3DLayer } from "@/components/map/Buildings3DLayer";
import { LayerSheet } from "@/components/map/LayerSheet";
import { LayerSheetTrigger } from "@/components/map/LayerSheetTrigger";
import { IconRail } from "@/components/sidebar/IconRail";
import { MobileNavDrawer } from "@/components/sidebar/MobileNavDrawer";
import { SearchBar } from "@/components/sidebar/SearchBar";
import { CaptureCreationPanel } from "@/components/capture/CaptureCreationPanel";
import { MainMapCaptureOverlay } from "@/components/capture/MainMapCaptureOverlay";
import { DirectionsLayer } from "@/components/route/DirectionsLayer";
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
          <PlaceAnnotationsLayer />
          <CaptureMarkersLayer />
          <SequenceCoverageLayer />
          <MainMapCaptureOverlay />
          <RailOverlayLayer />
          <BtcOverlayLayer />
          <Buildings3DLayer />
          <PoiClickHandler />
          <SelectedPlaceMarker />
          <IconRail />
          <MobileNavDrawer />
          <SearchBar />
          <DirectionsLayer />
          <CaptureCreationPanel />
          <Outlet />
          <LayerSheetTrigger />
          <LayerSheet />
          <MapLegends />
        </div>
        <Toaster position="bottom-center" />
      </AuthProvider>
    </QueryProvider>
  );
}

