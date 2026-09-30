import { useSyncExternalStore } from "react";
import { Check, ChevronDown, Languages } from "lucide-react";
import * as Select from "@radix-ui/react-select";
import french from "./locales/fr.json";

export type Language = "en" | "fr";
const key = "patchgoblin-language";
let language: Language = "en";
try {
  if (localStorage.getItem(key) === "fr") language = "fr";
} catch {}
const listeners = new Set<() => void>();
function apply(value: Language) {
  language = value;
  document.documentElement.lang = value;
  for (const listener of listeners) listener();
}
apply(language);
window.addEventListener("storage", (event) => {
  if (event.key === key) apply(event.newValue === "fr" ? "fr" : "en");
});
export function setLanguage(value: Language) {
  try {
    localStorage.setItem(key, value);
  } catch {}
  apply(value);
}
export function useLanguage() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => language,
  );
}
export function t(text: string) {
  return language === "fr"
    ? ((french as Record<string, string>)[text] ?? text)
    : text;
}
export function LanguagePicker() {
  const value = useLanguage();
  return (
    <Select.Root
      value={value}
      onValueChange={(next) => setLanguage(next as Language)}
    >
      <Select.Trigger className="language-picker" aria-label={t("Language")}>
        <Languages size={16} aria-hidden="true" />
        <Select.Value>
          <span className="language-name">
            {value === "fr" ? "Français" : "English"}
          </span>
          <span className="language-code">{value.toUpperCase()}</span>
        </Select.Value>
        <Select.Icon>
          <ChevronDown size={14} aria-hidden="true" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          className="picker-content language-content"
          position="popper"
          align="end"
          sideOffset={6}
          collisionPadding={12}
        >
          <Select.Viewport>
            {(
              [
                ["en", "English"],
                ["fr", "Français"],
              ] as const
            ).map(([code, label]) => (
              <Select.Item
                key={code}
                value={code}
                className="picker-item"
                lang={code}
              >
                <Select.ItemText>{label}</Select.ItemText>
                <Select.ItemIndicator>
                  <Check size={16} aria-hidden="true" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
