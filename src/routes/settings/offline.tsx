import { createFileRoute } from "@tanstack/react-router";
import { OfflineSettingsPanel } from "@/components/settings/OfflineSettingsPanel";

export const Route = createFileRoute("/settings/offline")({
  component: SettingsOfflineRoute,
});

function SettingsOfflineRoute() {
  return <OfflineSettingsPanel />;
}
