import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import french from "../web/locales/fr.json";

test("all authored translated interface strings have a French entry", () => {
  const technical = new Set([
    "PatchGoblin v2",
    "requests==2.32.3",
    "urllib3==1.20",
    "− urllib3==1.20",
    "+ urllib3>=1.21.1,<3",
    "requirements.txt",
    "Python",
    "pip / uv",
    "Node.js & TypeScript",
    "npm / pnpm / Yarn",
    "GitHub Actions",
    "s",
    "chrome://extensions",
    "edge://extensions",
    "manifest.json",
    "activeTab",
    "Diff",
    "Documentation",
    "Extension",
    "FAQ",
    "Public",
    "Support",
  ]);
  const missing = new Set<string>();
  for (const path of [
    "web/ProductApp.tsx",
    "web/Landing.tsx",
    "web/ui.tsx",
    "web/theme.tsx",
    "web/locale.tsx",
    "extension/popup.js",
  ]) {
    const source = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      path.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.JS,
    );
    function visit(node: ts.Node) {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "t" &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        const key = node.arguments[0].text;
        if (!(key in french) && !technical.has(key)) missing.add(key);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  assert.deepEqual([...missing], []);
});
function locale(saved: string | null, blocked = false) {
  const exports: any = {};
  const root = { lang: "" };
  const handlers: Record<string, Function> = {};
  const code = ts.transpileModule(readFileSync("web/locale.tsx", "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  runInNewContext(code, {
    exports,
    require: createRequire(new URL("../web/locale.tsx", import.meta.url)),
    document: { documentElement: root },
    window: {
      addEventListener: (event: string, fn: Function) => {
        handlers[event] = fn;
      },
    },
    localStorage: {
      getItem: () => {
        if (blocked) throw Error("denied");
        return saved;
      },
      setItem: (_: string, value: string) => {
        if (blocked) throw Error("denied");
        saved = value;
      },
    },
  });
  return {
    api: exports,
    root,
    saved: () => saved,
    storage: (value: string | null) =>
      handlers.storage({ key: "patchgoblin-language", newValue: value }),
  };
}
test("language changes are reversible, persist, and preserve original evidence", () => {
  const app = locale(null);
  app.api.setLanguage("fr");
  assert.equal(app.api.t("Start repair"), "Lancer la réparation");
  assert.equal(app.api.t("npm ci"), "npm ci");
  assert.equal(app.root.lang, "fr");
  assert.equal(locale(app.saved()).api.t("Account"), "Compte");
  app.api.setLanguage("en");
  assert.equal(app.api.t("Account"), "Account");
});
test("language falls back safely and synchronizes across tabs without storage access", () => {
  const app = locale("invalid", true);
  app.api.setLanguage("fr");
  assert.equal(app.api.t("Account"), "Compte");
  app.storage("en");
  assert.equal(app.api.t("Account"), "Account");
  app.storage(null);
  assert.equal(app.root.lang, "en");
});
