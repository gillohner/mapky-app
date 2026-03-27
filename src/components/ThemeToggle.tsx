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
      className="absolute left-2.5 top-2.5 z-20 rounded-lg bg-white p-2 shadow-md transition-colors hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700"
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? (
        <Sun className="h-5 w-5 text-gray-200" />
      ) : (
        <Moon className="h-5 w-5 text-gray-700" />
      )}
    </button>
  );
}
