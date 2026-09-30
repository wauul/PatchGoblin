# PatchGoblin Chrome / Edge extension

Build from the repository root with `npm ci && npm run build:extension`. The deterministic zip is saved to `dist/extension/patchgoblin-extension.zip` and copied into the web deployment. The unpacked source is `extension/`. The store package includes PNG icons and only runtime assets. Prepared listing text, permission explanations, reviewer instructions and remaining publication steps are in [the Chrome Web Store submission guide](../docs/chrome-web-store/submission.md).

1. Extract the zip.
2. Open `chrome://extensions` or `edge://extensions`.
3. Enable Developer mode and choose **Load unpacked**.
4. Choose the directory containing `manifest.json`.
5. Invoke the popup on a GitHub repository or Actions run page.

`activeTab` reads the current URL only after invocation. The single backend host permission supports credentialed status reads. No GitHub host permission, content script, background worker, storage permission, GitHub token, installation token or copied session is used. HTTPS navigation performs GitHub OAuth in the normal browser. Existing Secure/HTTP-only web-session cookies are sent by the browser for status; cookies are never read by extension JavaScript. Every action opens a reviewable web form; POST actions use the same CSRF and live repository permission checks as ordinary web jobs.

Popup context is refreshed on every invocation, including GitHub client-side navigation. Failed-run repair is offered only for a completed failed run and repository write access. CI creation is offered only when the installation reports no active workflows. Backend/session failures stay visible and never start work.

The popup shares the goblin's forest/lime palette and self-hosted Public Sans typography with the web application. A sun/moon button switches directly between light and dark; first use follows the system. English and French are selectable. Only these appearance/language preferences use localStorage; no credentials are stored, and no extension-storage permission was added. Preferences belong to the extension's origin, separately from web preferences.

This package is **not store listed**. Chrome requires a one-time registration fee unless the developer is already registered ([official instructions](https://developer.chrome.com/docs/webstore/register/)); no fee was paid. Microsoft Edge has no extension registration fee ([official instructions](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/create-dev-account)). The accessible Partner Center account is not enrolled in the Edge program; publisher registration details/verification are not complete. No publisher identity or contact information has been invented.

To publish from an enrolled account, submit the built zip, describe activeTab and the single backend host permission, link `https://patchgoblin.vercel.app/privacy`, and disclose repository names/run IDs sent to PatchGoblin for status. No GitHub token is collected by the extension. Provide actual screenshots and operator contact details, complete required verification and request review. Store review acceptance is separate from upload success. Do not pay any fee without operator approval.

Verification: the user confirmed this unpacked package loaded in Chrome. The available controlled browser cannot load extensions. `scripts/extension-browser-harness.mjs` serves the real popup with explicitly simulated `chrome.tabs` functions and real production status/session requests. Repository recognition, Open/Repair destinations, unavailable/unauthorized status and disabled inappropriate actions were checked in that harness; URL parsing/action construction also have unit coverage. Native Chrome/Edge permission and cookie behavior remains unverified by automation. Chrome documents credentialed extension requests with host permissions as same-site, subject to cookie settings ([official cookie behavior](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies)). The temporary harness is removed from the final public deployment.
