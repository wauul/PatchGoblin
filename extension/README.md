# PatchGoblin Chrome / Edge extension

Build from the repository root with `npm ci && npm run build:extension`. The deterministic zip is saved to `dist/extension/patchgoblin-extension.zip` and copied into the web deployment. The unpacked source is `extension/`.

1. Extract the zip.
2. Open `chrome://extensions` or `edge://extensions`.
3. Enable Developer mode and choose **Load unpacked**.
4. Choose the directory containing `manifest.json`.
5. Invoke the popup on a GitHub repository or Actions run page.

`activeTab` reads the current URL only after invocation. The single backend host permission supports credentialed status reads. No GitHub host permission, content script, background worker, storage permission, GitHub token, installation token or copied session is used. HTTPS navigation performs GitHub OAuth in the normal browser. Existing Secure/HTTP-only web-session cookies are sent by the browser for status; cookies are never read by extension JavaScript. Every action opens a reviewable web form; POST actions use the same CSRF and live repository permission checks as ordinary web jobs.

Popup context is refreshed on every invocation, including GitHub client-side navigation. Failed-run repair is offered only for a completed failed run and repository write access. CI creation is offered only when the installation reports no active workflows. Backend/session failures stay visible and never start work.

This package is not store listed. To publish, use an existing Chrome Web Store or Microsoft Edge Partner Center developer account, submit this package, provide truthful permission/data-use disclosures, link the production privacy page and capture actual screenshots. Do not pay a registration fee or enroll a paid account without operator approval. Review store policies and complete any human verification required by the store.
