import { Sun, Moon } from "lucide-react";
import { useMapStore } from "@/stores/map-store";

export function ThemeToggle() {
  const theme = useMapStore((s) => s.theme);
  const setTheme = useMapStore((s) => s.setTheme);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  return (
    <button
      onClick={toggle}
      className="absolute bottom-28 right-2.5 z-20 rounded-lg bg-mapky-bg/90 p-2 shadow-lg backdrop-blur transition-colors hover:bg-mapky-surface dark:bg-mapky-bg-dark/90 dark:hover:bg-mapky-surface-dark"
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? (
        <Sun className="h-5 w-5 text-mapky-text-dark" />
      ) : (
        <Moon className="h-5 w-5 text-mapky-text" />
      )}
    </button>
  );
}
