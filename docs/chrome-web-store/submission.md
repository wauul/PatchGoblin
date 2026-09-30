# PatchGoblin Chrome Web Store submission

Prepared September 30, 2026. Status: developer registered; package upload blocked by Google's two-step-verification requirement. Not submitted or approved. Publisher ID: `5684b4d1-782e-472d-93a2-7a35af14aa87`; registered account: `waelfezari@gmail.com`; public contact: `waelfeza@gmail.com`.

## Account setup

The registered Google account is waelfezari@gmail.com; the public contact address supplied by the publisher is waelfeza@gmail.com. Public publisher name: **Wauul**.
Open https://chrome.google.com/webstore/devconsole and complete Google's identity verification. Register as a developer, review and accept the developer agreement yourself, and pay the one-time registration fee shown by Google. Enable Google Account two-step verification and verify the publisher contact email. Supply accurate individual/trader or business details if requested; no company or legal identity has been assumed.

## Files

- Upload ZIP: `dist/extension/patchgoblin-extension.zip` (manifest version 3, extension version 2.0.0).
- Store icon: `extension/icons/icon-128.png` (128 × 128 PNG, 96 × 96 artwork with transparent padding).
- Small promotional tile: `docs/chrome-web-store/promo-440x280.png`.
- Screenshots: **still required**. Capture the actual installed extension on a public GitHub repository. Provide at least one 1280 × 800 or 640 × 400 full-bleed image. Use a signed-out popup and optionally a real authorized failed-run popup. Do not expose private repository names or credentials. Do not claim simulated status is a real repair or an installed-extension screenshot.

Rebuild with `npm run build:extension`. The ZIP has `manifest.json` at its root, includes locally bundled runtime/font assets and PNG icons, and excludes README/publication material.

## Store listing — copy and paste

**Name:** PatchGoblin — verified CI help

**Summary (manifest):** Open verified CI repair, creation and maintenance from GitHub. No GitHub tokens are stored in this extension.

**Category:** Developer Tools (choose the equivalent developer category offered by the current dashboard).

**Language:** English; the popup also supports French.

**Website:** https://patchgoblin.vercel.app

**Support:** https://patchgoblin.vercel.app/support

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

The extension uses activeTab only after you open it, and network access only to patchgoblin.vercel.app. It does not read page contents, store GitHub credentials or monitor browsing in the background. Only language and appearance preferences are stored locally. Your browser sends the existing PatchGoblin session cookie with status requests; extension JavaScript cannot read that HTTP-only cookie.

PatchGoblin is an independent project and is not affiliated with GitHub or Google.

## Privacy practices — copy and paste

**Single purpose:** Provide a repository-aware shortcut from the active GitHub page to PatchGoblin's CI workbench, with installation/access status, recent jobs and eligible repair or CI-creation actions.

**activeTab justification:** After the user invokes the popup, read the active tab URL to identify a GitHub repository and optional Actions run ID. This supplies context for status and workbench navigation. The extension does not read page contents or query browsing history in the background.

**Host permission justification — https://patchgoblin.vercel.app/*:** Fetch authenticated JSON status from /api/extension/status for the selected repository and optional run, displaying installation, repository permissions and recent jobs. The browser attaches the existing PatchGoblin session cookie; JavaScript cannot read it. No other host access is requested.

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
