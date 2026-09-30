import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { t } from "./locale";

type Preference = "system" | "light" | "dark";
declare global {
  interface Window {
    PatchGoblinTheme?: {
      get: () => Preference;
      set: (value: Preference) => void;
    };
  }
}

export function ThemeMenu() {
  const [theme, setTheme] = useState(
    () => document.documentElement.dataset.theme || "light",
  );
  useEffect(() => {
    const update = () =>
      setTheme(document.documentElement.dataset.theme || "light");
    window.addEventListener("patchgoblin:theme", update);
    return () => window.removeEventListener("patchgoblin:theme", update);
  }, []);
  const dark = theme === "dark";
  const Icon = dark ? Moon : Sun;
  const label = t(dark ? "Switch to light mode" : "Switch to dark mode");
  return (
    <button
      className="icon-button theme-trigger"
      aria-label={label}
      title={label}
      aria-pressed={dark}
      onClick={() => window.PatchGoblinTheme?.set(dark ? "light" : "dark")}
    >
      <Icon size={18} aria-hidden="true" />
    </button>
  );
}
