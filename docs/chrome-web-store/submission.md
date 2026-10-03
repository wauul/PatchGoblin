# PatchGoblin Chrome Web Store submission

Submitted September 30, 2026. Google confirmed **Pending review** (`En attente d'examen`) and displayed “Votre extension a été envoyée pour examen.” Automatic public publication after approval is enabled. Package, listing text, icon, promotional tile, privacy disclosures, reviewer instructions and a labeled popup preview screenshot are included. Public/free/all-regions distribution is selected. Public availability verified October 3, 2026: version 2.0.0 is listed on the Chrome Web Store at https://chromewebstore.google.com/detail/hiilcimbjiioafbbpjngamcnnigonglf. Extension ID: `hiilcimbjiioafbbpjngamcnnigonglf`. Publisher ID: `5684b4d1-782e-472d-93a2-7a35af14aa87`; registered account: `waelfezari@gmail.com`; public contact: `waelfeza@gmail.com`.

Draft: https://chrome.google.com/u/1/webstore/devconsole/5684b4d1-782e-472d-93a2-7a35af14aa87/hiilcimbjiioafbbpjngamcnnigonglf/edit/listing

## Account setup

The registered Google account is waelfezari@gmail.com; the public contact address supplied by the publisher is waelfeza@gmail.com. Public publisher name: **Wauul**.
Open https://chrome.google.com/webstore/devconsole and complete Google's identity verification. Register as a developer, review and accept the developer agreement yourself, and pay the one-time registration fee shown by Google. Enable Google Account two-step verification and verify the publisher contact email. Supply accurate individual/trader or business details if requested; no company or legal identity has been assumed.

## Files

- Upload ZIP: `dist/extension/patchgoblin-extension.zip` (manifest version 3, extension version 2.0.1).
- Store icon: `extension/icons/icon-128.png` (128 × 128 PNG, 96 × 96 artwork with transparent padding).
- Small promotional tile: `docs/chrome-web-store/promo-440x280.png`.
- Screenshot: `docs/chrome-web-store/popup-preview-1280x800.jpg` (1280 × 800, RGB JPEG). Captured from the packaged popup HTML/CSS/JS in a local browser preview. The active-tab API supplies a public repository context; an HTTPS request to the actual backend without credentials supplies the real signed-out response. The image explicitly labels the preview and supplied active-tab context. No repair, permissions, job or signed-in state is fabricated. It is not an installed-Chrome capture and does not verify native permission/cookie behavior.

Rebuild with `npm run build:extension`. The ZIP has `manifest.json` at its root, includes locally bundled runtime/font assets and PNG icons, and excludes README/publication material.

## Store listing — copy and paste

**Name:** PatchGoblin — verified CI help

**Summary (manifest):** Open verified CI repair, creation and maintenance from GitHub. No GitHub tokens are stored in this extension.

**Category:** Developer Tools (choose the equivalent developer category offered by the current dashboard).

**Language:** English; the popup also supports French.

**Website:** https://patchgoblin.vercel.app

**Support:** https://github.com/wauul/PatchGoblin/issues (Google's validation timed out on the hosted support page; the listing uses the project's public issue tracker).

**Contact:** waelfeza@gmail.com

**Detailed description:**

Open your GitHub CI workbench from the repository you are viewing.

When you click PatchGoblin, the popup reads the active GitHub URL, identifies the repository and optional Actions run, and sends the repository name and run ID to PatchGoblin to check installation, access and recent job status.

• Open PatchGoblin with the selected repository already filled in.
• Open the repair workbench for an eligible failed GitHub Actions run.
• Open CI creation for an authorized repository with no active workflows.
• View recent repository jobs and open their evidence.
• Switch between light and dark appearance, and English and French.

Job buttons open the web workbench. Review the repository and start the job there. The extension does not start a repair automatically. PatchGoblin's web service reproduces supported failures, checks proposed changes in an isolated environment and opens verified changes as pull requests for human review. It never merges automatically.

Repository status and job actions require signing in to PatchGoblin with GitHub and explicitly installing the separate PatchGoblin CI GitHub App on selected repositories. Repair requires an eligible completed failed run and repository write access. Unsupported failures remain visible without an unverified pull request.

The extension uses activeTab only after you open it, and network access only to patchgoblin.vercel.app plus the exact configured Sentry ingest host for sanitized popup diagnostics. It does not read page contents, store GitHub credentials or monitor browsing in the background. Only language and appearance preferences are stored locally. Your browser sends the existing PatchGoblin session cookie with status requests; extension JavaScript cannot read that HTTP-only cookie.

PatchGoblin is an independent project and is not affiliated with GitHub or Google.

## Privacy practices — copy and paste

**Single purpose:** Provide a repository-aware shortcut from the active GitHub page to PatchGoblin's CI workbench, with installation/access status, recent jobs and eligible repair or CI-creation actions.

**activeTab justification:** After the user invokes the popup, read the active tab URL to identify a GitHub repository and optional Actions run ID. This supplies context for status and workbench navigation. The extension does not read page contents or query browsing history in the background.

**Host permission justification — https://patchgoblin.vercel.app/*:** Fetch authenticated JSON status from /api/extension/status for the selected repository and optional run, displaying installation, repository permissions and recent jobs. The browser attaches the existing PatchGoblin session cookie; JavaScript cannot read it.

**Sentry ingest host justification:** A production monitoring build requests only the exact `https://o4512192414810112.ingest.de.sentry.io/*` host to deliver sanitized popup errors. The locally bundled SDK does not instrument GitHub pages or collect their content. No private repository names, account identities, tokens, cookies, source code, logs, prompts or request bodies are sent. Update the store privacy disclosure for anonymous diagnostics before publishing this new package; the currently published extension and this rebuilt package have separate release status.

**Remote code:** No. JavaScript, CSS, translations, fonts and icons are bundled locally. Backend JSON is displayed as data, never executed. Opening the ordinary HTTPS web app in a separate tab does not execute remote code inside the extension.

**Privacy policy:** https://patchgoblin.vercel.app/privacy

**Privacy deployment:** Extension-specific privacy text is deployed and visibly verified in English and French at this URL. Production deployment `dpl_2B8mpvY1JZupD5zvqft7V1jkiyif` is READY; all 34 JavaScript tests and the web production build passed.

**Data declarations:** Do not select “no user data collected.” At minimum disclose Web history, because the active GitHub URL supplies the repository/run identifiers transmitted to the backend. The integrated PatchGoblin service also handles personally identifiable information (GitHub account ID/login/avatar), authentication information (server-side sessions and encrypted GitHub App authorization), and website content (selected repository source/workflows and CI logs for user-requested jobs). Include these categories when completing the linked-service disclosure; explain that credentials/source are processed by the web service, not read or stored by the extension. Do not claim collection of financial/payment, health, personal communications, location or unrelated browsing/activity data. Check the current dashboard definitions before saving the final form.

**Limited Use certification:** The implementation uses data for the disclosed CI feature and operational needs. Confirm the dashboard's certifications only after reviewing them: no sale or transfer outside permitted uses, no unrelated purposes, no credit/lending use. The publisher remains responsible for these operational commitments.

## Reviewer test instructions — copy and paste

1. Install the extension and open https://github.com/wauul/patchgoblin-product-lab.
2. Invoke the toolbar popup. It should recognize wauul/patchgoblin-product-lab. Signed-out users receive a sign-in prompt; Open PatchGoblin opens the workbench with this repository selected.
3. On a non-GitHub page, the popup asks the user to open a GitHub repository; repository job actions remain disabled.
4. Switch appearance and language, close/reopen the popup and confirm preferences persist.
5. For authenticated status, sign in to https://patchgoblin.vercel.app with your own GitHub account and install PatchGoblin CI on a disposable repository you control. Select/refresh access in the dashboard, then reopen the popup on that repository. No publisher password or token is required or supplied.
6. On an enabled authorized repository with no active workflows, Create CI becomes available. On an eligible completed failed Actions run with write access, Repair this failure becomes available. Both open reviewable web forms; clicking the extension button alone starts no job.
7. Service/session failures show a visible status message and leave inappropriate actions disabled.

For questions or help testing authenticated paths: waelfeza@gmail.com. Do not provide reviewers with access to the publisher's personal GitHub account. If Google requires special test access, arrange a dedicated account/repository before submitting.

## Submission sequence

1. Finish registration and account verification.
2. Load the updated `extension/` directory in Chrome and smoke-test it, including real session-cookie behavior. Automated context/theme/language tests pass; native extension behavior is not verified by the controlled browser.
3. Capture and review genuine screenshots. Publish and verify the updated privacy text.
4. In the developer dashboard, add a new item and upload the ZIP. Fill Store listing, Privacy practices, Distribution and Test instructions.
5. Select Public if the intent is a searchable public listing. Inspect countries/audience and any trader declarations before saving.
6. Review the complete draft and Submit for Review. Automatic publication after approval or deferred publication is chosen in Google's confirmation dialog. Upload success alone does not mean approval or publication.
7. Record the actual store URL and review status only after Google returns them; then update the website/README installation link.

## Official requirements checked

- https://developer.chrome.com/docs/webstore/register
- https://developer.chrome.com/docs/webstore/publish
- https://developer.chrome.com/docs/webstore/images
- https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- https://developer.chrome.com/docs/webstore/program-policies/limited-use


## Version 2.0.1 review submission — October 3, 2026

Uploaded the exact production-download ZIP and verified draft version **2.0.1**.
Google confirmed “Votre extension a été envoyée pour examen” and the saved status
**En attente d'examen**. Automatic public publication after approval is enabled.
Version **2.0.0** remains the public store release until Google approves 2.0.1.

Package SHA256: `04943a7811daa929f93e8e7289c157a056d1026bdf1fed9426532dbb07ebb89c`.
Packaged monitoring release: `patchgoblin@578d2d0d233e7198e5b4f06b777d395664187668+extension.2.0.1`.
Native MV3 and privacy verification are recorded in [Sentry operations](../sentry.md).

The saved listing and host-permission explanation disclose the PatchGoblin status
API and exact `https://o4512192414810112.ingest.de.sentry.io/*` ingest host.
Sentry receives fixed errors, application locations, service/environment/release,
operation/status and opaque support IDs. Private repository content, account
identities, credentials, cookies and request bodies are excluded from Sentry.
The bundled SDK is isolated to the popup and never instruments GitHub pages.

Saved data categories: personally identifiable information, authentication
information, web history, user activity (sanitized operational diagnostics), and
website content. The first, second, third and fifth include linked-service data;
the extension itself does not read repository source or store GitHub credentials.
Health, financial/payment, personal communications and location remain unchecked.
Existing Limited Use certifications remain selected; remote executable code is No.
The deployed privacy policy was visibly verified before submission.

Evidence: [submission receipt](2.0.1-submission-verification.json).
No new account, registration fee or Edge enrollment was performed.
