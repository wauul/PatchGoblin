import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

function browser(saved: string | null, dark: boolean, blocked = false) {
  const handlers: Record<string, Function> = {};
  let change: Function = () => {};
  const root = {
    dataset: {} as Record<string, string>,
    style: { colorScheme: "" },
  };
  const media = {
    matches: dark,
    addEventListener: (_: string, fn: Function) => {
      change = fn;
    },
  };
  const window: any = {
    matchMedia: () => media,
    dispatchEvent: () => {},
    addEventListener: (event: string, fn: Function) => {
      handlers[event] = fn;
    },
  };
  const localStorage = {
    getItem: () => {
      if (blocked) throw Error("denied");
      return saved;
    },
    setItem: (_: string, value: string) => {
      if (blocked) throw Error("denied");
      saved = value;
    },
  };
  runInNewContext(readFileSync("web/public/theme-init.js", "utf8"), {
    window,
    document: { documentElement: root },
    localStorage,
    Event: class {
      constructor(public type: string) {}
    },
  });
  return {
    root,
    theme: window.PatchGoblinTheme,
    saved: () => saved,
    system: (value: boolean) => {
      media.matches = value;
      change();
    },
    storage: (value: string | null) =>
      handlers.storage({ key: "patchgoblin-theme", newValue: value }),
  };
}
test("theme resolves before rendering and follows system until a two-state override", () => {
  const app = browser(null, true);
  assert.equal(app.root.dataset.theme, "dark");
  app.system(false);
  assert.equal(app.root.dataset.theme, "light");
  app.theme.set("dark");
  app.system(false);
  assert.equal(app.root.dataset.theme, "dark");
  assert.equal(app.saved(), "dark");
  assert.equal(browser(app.saved(), false).root.style.colorScheme, "dark");
});
test("storage denial still allows switching themes without breaking startup", () => {
  const app = browser(null, true, true);
  app.theme.set("light");
  assert.equal(app.root.dataset.theme, "light");
});
test("preference changes synchronize across tabs and reject invalid themes", () => {
  const app = browser("dark", false);
  app.storage("light");
  assert.equal(app.root.dataset.theme, "light");
  app.theme.set("invalid");
  assert.equal(app.root.dataset.theme, "light");
  app.storage(null);
  app.system(true);
  assert.equal(app.root.dataset.theme, "dark");
});
