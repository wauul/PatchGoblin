const translations = await fetch(new URL("fr.json", import.meta.url)).then(
  (response) => response.json(),
);
let language = "en";
try {
  if (localStorage.getItem("patchgoblin-language") === "fr") language = "fr";
} catch {}
export const t = (text) =>
  language === "fr" ? (translations[text] ?? text) : text;
export const getLanguage = () => language;
export function setLanguage(value) {
  language = value === "fr" ? "fr" : "en";
  document.documentElement.lang = language;
  try {
    localStorage.setItem("patchgoblin-language", language);
  } catch {}
}
setLanguage(language);
