import { t, getLanguage, setLanguage } from "./locale.js";
import { BACKEND, recognize, actionUrl } from "./context.js";
const browserApi = globalThis.chrome || globalThis.browser;
const status = document.getElementById("status");
let context = null;
const language = document.getElementById("language");
const languageMenu = document.getElementById("language-menu");
const languageOptions = [...languageMenu.querySelectorAll("[data-language]")];
function translateChrome() {
  for (const element of document.querySelectorAll("[data-i18n]"))
    element.textContent = t(element.dataset.i18n);
  language.setAttribute("aria-label", t("Language"));
  languageMenu.setAttribute("aria-label", t("Language"));
  document.getElementById("language-name").textContent =
    getLanguage().toUpperCase();
  for (const option of languageOptions)
    option.setAttribute(
      "aria-checked",
      String(option.dataset.language === getLanguage()),
    );
  document
    .getElementById("jobs")
    .setAttribute("aria-label", t("Recent repository jobs"));
  updateTheme();
}
function updateTheme() {
  const dark = document.documentElement.dataset.theme === "dark";
  const button = document.getElementById("theme");
  button.setAttribute("aria-pressed", String(dark));
  button.setAttribute(
    "aria-label",
    t(dark ? "Switch to light mode" : "Switch to dark mode"),
  );
  button.title = button.getAttribute("aria-label");
}
document
  .getElementById("theme")
  .addEventListener("click", () =>
    window.PatchGoblinTheme.set(
      document.documentElement.dataset.theme === "dark" ? "light" : "dark",
    ),
  );
window.addEventListener("patchgoblin:theme", updateTheme);
function closeLanguageMenu(restoreFocus = false) {
  languageMenu.hidden = true;
  language.setAttribute("aria-expanded", "false");
  if (restoreFocus) language.focus();
}
function openLanguageMenu(
  index = languageOptions.findIndex(
    (option) => option.dataset.language === getLanguage(),
  ),
) {
  languageMenu.hidden = false;
  language.setAttribute("aria-expanded", "true");
  languageOptions[index].focus();
}
language.addEventListener("click", () =>
  languageMenu.hidden ? openLanguageMenu() : closeLanguageMenu(true),
);
language.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    openLanguageMenu(
      event.key === "ArrowDown" ? 0 : languageOptions.length - 1,
    );
  }
});
languageMenu.addEventListener("keydown", (event) => {
  const index = languageOptions.indexOf(document.activeElement);
  if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? languageOptions.length - 1
          : (index +
              (event.key === "ArrowDown" ? 1 : -1) +
              languageOptions.length) %
            languageOptions.length;
    languageOptions[next].focus();
  } else if (event.key === "Escape") {
    event.preventDefault();
    closeLanguageMenu(true);
  } else if (event.key === "Tab") closeLanguageMenu();
});
for (const option of languageOptions)
  option.addEventListener("click", () => {
    setLanguage(option.dataset.language);
    translateChrome();
    closeLanguageMenu(true);
    initialize();
  });
document.addEventListener("click", (event) => {
  if (!event.target.closest(".language-picker")) closeLanguageMenu();
});
translateChrome();
function open(url) {
  browserApi.tabs.create({ url });
}
document
  .getElementById("open")
  .addEventListener("click", () => open(actionUrl(context)));
document
  .getElementById("repair")
  .addEventListener("click", () => open(actionUrl(context, "repair")));
document
  .getElementById("builder")
  .addEventListener("click", () => open(actionUrl(context, "builder")));
document
  .getElementById("install")
  .addEventListener("click", () =>
    open("https://github.com/apps/patchgoblin-ci/installations/new"),
  );
async function initialize() {
  document.getElementById("jobs").replaceChildren();
  document.getElementById("repair").disabled = true;
  document.getElementById("builder").disabled = true;
  document.getElementById("install").hidden = true;
  status.textContent = t("Checking repository access…");
  const [tab] = await browserApi.tabs.query({
    active: true,
    currentWindow: true,
  });
  context = recognize(tab?.url);
  document.getElementById("repository").textContent =
    context?.repo || t("Open a GitHub repository");
  if (!context) {
    status.textContent = t(
      "Open a GitHub repository or Actions run to use repository actions.",
    );
    return;
  }
  try {
    const url = new URL("/api/extension/status", BACKEND);
    url.searchParams.set("repo", context.repo);
    if (context.run) url.searchParams.set("run", context.run);
    const response = await fetch(url, {
      credentials: "include",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (response.status === 401) {
      status.textContent = t(
        "Sign in on PatchGoblin to check installation and job status. Then reopen this popup.",
      );
      return;
    }
    if (!response.ok) throw Error("Backend status is unavailable");
    const data = await response.json();
    if (!data.installed) {
      status.textContent = t(
        "This repository is not available in your selected installation. Install the App or refresh access in the web dashboard.",
      );
      document.getElementById("install").hidden = false;
      return;
    }
    status.textContent = `${t("Installed")} · ${t(data.enabled && !data.paused ? "Available" : data.paused ? "Paused" : "Disabled")} · ${t(data.can_push ? "Write access" : "Read access")}`;
    const available = data.enabled && !data.paused && data.can_push;
    document.getElementById("repair").disabled = !(
      available &&
      context.run &&
      data.run_conclusion === "failure"
    );
    document.getElementById("builder").disabled = !(
      available && data.workflow_count === 0
    );
    for (const job of data.jobs) {
      const a = document.createElement("a");
      a.textContent = `${t("Job #")}${job.id} · ${t(job.mode)} · ${t(job.status)}`;
      a.href = BACKEND + "/workbench?job=" + job.id;
      a.addEventListener("click", (event) => {
        event.preventDefault();
        open(a.href);
      });
      document.getElementById("jobs").append(a);
    }
  } catch {
    status.textContent = t(
      "PatchGoblin is unavailable or your browser blocks session cookies. Open the web app to reconnect; no job was started.",
    );
  }
}
initialize().catch(() => {
  status.textContent = t(
    "This browser could not read the active tab. Open PatchGoblin directly.",
  );
});
