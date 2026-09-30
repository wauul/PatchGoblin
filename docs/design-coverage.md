# Patch Bench implementation and verification

## Direction

The three initial directions were Review Ledger (diff-first editorial composition, turquoise `#087B83`), Maintenance Manual (technical document hierarchy, oxide `#C74831`), and Patch Bench (failure / minimal patch / verification composition, initially navy and yellow). Patch Bench was selected for the product's actual task: inspect evidence before reviewing a pull request. The user subsequently required the palette and logo to match. The final palette is taken directly from the existing goblin asset: forest `#1B2D29`, lime `#B6E572`, and cool light `#F1F5F3`.

Shared signatures are the three-part repair bench, evidence tabs with actual counts, and command receipts with explicit sandbox/remote boundaries. Display typography is confined to public marketing headings. Operational screens use Public Sans, compact rows, predictable labels and deliberate focus states.

## Coverage checklist

| Surface | Implementation |
| --- | --- |
| `/` | Real seeded repair evidence, three task rows, explicit access/permission sequence |
| `/dashboard` | Live repository health rows, actual usage, sync/install actions |
| `/onboarding` | Identity versus repository authorization, installation and manual-first controls |
| `/workbench` | Repair/create/maintenance configuration; repository/run pickers; collapsed launch form during evidence review |
| `/workbench?job=24` | Saved diagnosis, diff, coverage, sandbox receipts, remote CI, actual stage state, activity and measured usage |
| `/history` | Search, styled status filter, readable saved-job rows, loading and unmatched-search state |
| `/repositories` | Repository picker, five labeled native switches, daily limits, retention, permission-disabled controls |
| `/account` | Export, installation management, destructive action with typed confirmation and disabled default |
| `/docs`, `/faq`, `/support` | Shared reading navigation, bounded prose measure, native FAQ disclosure, factual support details |
| `/privacy`, `/terms` | Complete original factual meaning retained in English and French |
| `/extension` | Installation instructions, truthful permissions and unpacked package download |
| Unknown route | Shared branded recovery page served through Vercel's HTTP 404 fallback |
| Extension popup | Shared fonts/palette, actual context/status logic, two-state theme button, English/French control |

Every public and authenticated route shares theme and language controls. The appearance button displays only a sun or moon icon; its accessible name describes the action. First visit follows the operating system, and clicking persists light/dark explicitly. The pre-paint script avoids a theme flash and handles denied storage. Language selection uses a styled Radix menu in both themes and at every breakpoint, with full English/Français options, a selected checkmark, keyboard navigation and focus return. The phone trigger shows EN/FR. The extension has a matching custom keyboard menu. Language selection persists separately and synchronizes across same-origin web tabs. Repository identifiers, API mode/status values, URLs, commands, diffs and stored model evidence are never translated.

Controls use shared semantic tokens, visible focus, disabled/busy states, status text alongside icons, portal dropdowns on desktop and native selects on phones. Mobile workspace navigation has five labeled destinations and safe-area clearance. Narrow evidence tabs use a two-column layout to accommodate French labels.

## Browser checks

Real production pages and the existing authenticated session were inspected with the Codex browser. Checks were batched across 1440×1000 desktop, 768×1024 tablet and 375×812 phone layouts; the extension preview used 360 px. Public and authenticated routes were captured in French/light mode, with representative operational, evidence, form and reading views in English/dark mode. All screenshot paths and their actual sizes are recorded in the finish-review packet under `.impeccable/review/`.

Interaction checks include direct theme switching, persisted theme/language after reload, styled language selection with Arrow/Enter/Escape and focus return, Radix menu dismissal with Escape, arrow-key evidence tabs, expanded command logs, empty history search, disabled deletion, visible focus and reduced-motion transitions. Network-error recovery was tested by temporarily blocking bootstrap in the verification tab, then unblocking and clicking Retry; the real account page returned without stale errors. No account data was changed. Text enlargement used an explicitly temporary 200% root-font override through DevTools, confirmed by the rendered paragraph changing from 17 px to 34 px; native browser zoom shortcuts did not change text in this controlled browser. The override was restored.

One coordinated correction pass addressed the crowded mobile header, long French tabs, command disclosure cues, enlarged-text header wrapping and the branded 404 fallback. A single static Impeccable detector run found no reported issues. An independent finish reviewer inspected all 31 captures, then scored three material fixes resolved: connection retry, dark checked-switch visibility and French onboarding/operator prose. Its final ship verdict covers those scored fixes. The later styled-language refinement has six separate desktop, phone and labeled popup captures in light/dark themes; its finish review is scoped to that refinement.

## Automated checks and limits

The separate styled-language finish review returned **ship**, with no material findings within that refinement.

`npm test` covers product authentication, permissions, CSRF, webhook identity, credential redaction, extension destinations, theme persistence/storage failure and language reversal/storage synchronization. The French catalog check covers authored translated UI strings. `npm run build:web` type-checks and builds the application, branded 404 page and deterministic extension package. Source formatting uses Prettier.

Native extension permission/cookie behavior remains unverified by browser automation. Its local preview explicitly simulates `chrome.tabs`; it is not shipped. No organization/private-repository permission change, destructive account deletion, new agent inference job, automatic merge or automation enablement was performed for visual verification. Existing saved jobs provided real evidence. Hardware keyboard overlays, native screen readers and every provider-specific error were not exhaustively verified; this is not a claim of a complete WCAG audit. French UI/legal wording is authored translation, not a separately certified legal localization.
