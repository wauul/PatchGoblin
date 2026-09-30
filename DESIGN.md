---
name: "PatchGoblin"
description: "A forest-and-lime repair bench for inspectable GitHub CI evidence."
colors:
  page: "#f1f5f3"
  surface: "#fff"
  layer: "#e5ede8"
  hover: "#dbe7de"
  text: "#213a30"
  muted: "#516960"
  border: "#c9d7ce"
  control-border: "#7b9385"
  accent: "#b6e572"
  accent-hover: "#caee98"
  accent-ink: "#1b2d29"
  selected: "#e1f2cd"
  selected-ink: "#1b2d29"
  focus: "#35724d"
  sidebar: "#1b2d29"
  sidebar-text: "#f0f6ef"
  sidebar-muted: "#c3d4c9"
  success: "#176343"
  success-bg: "#e8f4ed"
  danger: "#9f3529"
  danger-bg: "#fbeae6"
  warning: "#7a5417"
  warning-bg: "#fff5d6"
  info: "#285e57"
  info-bg: "#e2efeb"
  bench: "#1b2d29"
  bench-layer: "#29463c"
  bench-text: "#f2f8f1"
  bench-muted: "#c7d9cc"
  bench-green: "#b6e572"
  bench-red: "#ffbdad"
  code-bg: "#f2f6f3"
  added: "#165b3b"
  added-bg: "#e4f3e8"
  removed: "#983426"
  removed-bg: "#f9e7e2"
  dark-page: "#121e19"
  dark-surface: "#1b2d25"
  dark-layer: "#294237"
  dark-hover: "#355446"
  dark-text: "#eef5ec"
  dark-muted: "#b4c8ba"
  dark-border: "#456052"
  dark-control-border: "#809d8a"
  dark-selected: "#b6e572"
  dark-focus: "#b6e572"
  dark-sidebar: "#0f1b15"
  dark-sidebar-text: "#eef5ec"
  dark-sidebar-muted: "#b4c8ba"
  dark-success: "#b5e4c5"
  dark-success-bg: "#193f34"
  dark-danger: "#ffb8a9"
  dark-danger-bg: "#472d2b"
  dark-warning: "#ffe095"
  dark-warning-bg: "#443a24"
  dark-info: "#bfdfd3"
  dark-info-bg: "#25443a"
  dark-code-bg: "#13231b"
  dark-added: "#c0e5b3"
  dark-added-bg: "#193e32"
  dark-removed: "#ffc1b2"
  dark-removed-bg: "#432d2d"
typography:
  display:
    fontFamily: "\"Barlow Semi Condensed\", \"Public Sans\", sans-serif"
    fontSize: "clamp(3.5rem, 6vw, 5.75rem)"
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: "-0.025em"
  marketing-title:
    fontFamily: "\"Barlow Semi Condensed\", \"Public Sans\", sans-serif"
    fontSize: "2.625rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  page-title:
    fontFamily: "\"Public Sans\", system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  reading-title:
    fontFamily: "\"Public Sans\", system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: "\"Public Sans\", system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  body:
    fontFamily: "\"Public Sans\", system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  body-reading:
    fontFamily: "\"Public Sans\", system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.8
  label:
    fontFamily: "\"Public Sans\", system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.4
  status:
    fontFamily: "\"Public Sans\", system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.4
  code:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.75
rounded:
  control: "6px"
  panel: "12px"
  option: "4px"
  switch: "20px"
spacing:
  compact: "0.375rem"
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.25rem"
  xl: "1.5rem"
  section: "2rem"
  large: "3rem"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0.625rem 1rem"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.accent-ink}"
  button-primary-active:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.accent-ink}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0.625rem 1rem"
  button-secondary-hover:
    backgroundColor: "{colors.hover}"
  button-danger:
    backgroundColor: "{colors.danger-bg}"
    textColor: "{colors.danger}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0.625rem 1rem"
  button-disabled:
    backgroundColor: "{colors.layer}"
    textColor: "{colors.muted}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "0.625rem 0.75rem"
  reading-nav-current:
    backgroundColor: "{colors.selected}"
    textColor: "{colors.selected-ink}"
    rounded: "{rounded.control}"
    padding: "0.625rem 0.75rem"
  status:
    textColor: "{colors.muted}"
    typography: "{typography.status}"
  evidence-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.panel}"
  switch-unchecked:
    backgroundColor: "{colors.layer}"
    rounded: "{rounded.switch}"
    width: "48px"
    height: "28px"
  switch-checked:
    backgroundColor: "{colors.selected-ink}"
  command-output:
    backgroundColor: "{colors.code-bg}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "1rem"
  language-trigger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "0.5rem 0.625rem"
  language-option-selected:
    backgroundColor: "{colors.selected}"
    textColor: "{colors.selected-ink}"
    rounded: "{rounded.option}"
    padding: "0.625rem 0.75rem"
---

# Design System: PatchGoblin

## Overview

**Creative North Star: "Patch Bench"**

PatchGoblin is a repair-and-review workspace for GitHub maintainers. The existing goblin mark supplies the forest and lime identity; cool green neutrals make the work readable. The visual signature is an inspectable repair bench: original failure, bounded diff and verification belong together. Real command receipts, repository identifiers and recorded evidence carry the character.

Marketing uses condensed display lettering and a horizontal evidence composition. Operational surfaces use compact rows, plain labels and predictable controls; reading surfaces use a separate navigation rail and a bounded prose measure. The existing SVG mascot marks the brand and useful recovery states. It is preserved, and no generated artwork is part of this system. The earlier navy/yellow direction was explicitly rejected.

**Key Characteristics:**

- Forest surfaces and mascot lime connect actions, selection and evidence.
- Condensed public display type sits beside neutral, legible work typography.
- Evidence tabs, command disclosures and real phase state make the process inspectable.
- Both themes, English/French copy and deliberate phone navigation share the same control vocabulary.

This document records source behavior in `web/design.css`, `web/ui.tsx`, `web/theme.tsx`, `web/locale.tsx`, `web/Landing.tsx`, `web/ProductApp.tsx` and the extension popup. The token frontmatter is normative; the sidecar adds theme mappings, motion, depth and component previews. Verification references are descriptive evidence, not additional design tokens.

## Colors

The palette is a cool forest environment with one recognizable lime accent. Semantic colors name outcomes rather than decorate sections. Frontmatter keys mirror the web CSS variable names; `dark-` keys record the values overridden by the dark theme. Unchanged tokens remain shared. The sidecar maps these keys to the runtime variables.

### Primary

- **Mascot lime** (`accent`): primary actions, selected sidebar destinations, current-stage markers and active evidence counts. Pair it with forest `accent-ink`; the action pairing stays stable in both themes.
- **Lighter lime** (`accent-hover`): primary-action hover feedback.
- **Forest ink** (`accent-ink`): lettering on lime and the identity color of the preserved mascot.

### Neutral

- **Cool page** (`page`) and **work surface** (`surface`): separate the page environment from reading and operating panels.
- **Layer** (`layer`) and **hover layer** (`hover`): quiet grouping and pointer feedback.
- **Primary text** (`text`) and **secondary text** (`muted`): readable hierarchy without reducing informational content to faint decoration.
- **Divider** (`border`) and **control edge** (`control-border`): content separation versus an explicit interactive boundary.
- **Selected surface / ink** (`selected`, `selected-ink`): light mode uses a tinted selected background; dark mode uses mascot lime with forest text.
- **Focus** (`focus`): dark green in light mode, lime in dark mode. The forest sidebar and bench use lime for focus.
- **Sidebar** (`sidebar`, `sidebar-text`, `sidebar-muted`): a persistent forest navigation environment, darker in dark mode.
- **Evidence bench** (`bench`, `bench-layer`, `bench-text`, `bench-muted`): the public failure/patch/verification surface stays forest in both themes. `bench-green` and `bench-red` distinguish change direction.
- **Code surface** (`code-bg`): command output and diffs receive their own quiet background.

### Semantic feedback

- **Success** (`success`, `success-bg`): verified checks and a reviewable pull request.
- **Danger** (`danger`, `danger-bg`): failures, connection errors and the account-deletion area.
- **Warning** (`warning`, `warning-bg`): unsupported results requiring attention.
- **Information** (`info`, `info-bg`): bounded explanatory notices.
- **Added / removed** (`added`, `added-bg`, `removed`, `removed-bg`): diff changes; preserve the visible plus/minus indicators and line context.

**The Mascot Continuity Rule.** Use the existing forest/lime relationship for identity, action and selection in both themes; do not restore the rejected navy/yellow palette.

**The Named Outcome Rule.** Status color always accompanies a readable outcome and, where used, a drawn icon; color alone is not the message.

## Typography

**Display Font:** Barlow Semi Condensed, with Public Sans and sans-serif fallbacks. Self-hosted weights are 600 and 700.

**Body Font:** Public Sans, with system-ui and sans-serif fallbacks. The self-hosted file covers weights 400–700.

**Code Font:** ui-monospace, SFMono-Regular, Consolas, monospace.

**Character:** Condensed public headlines provide a recognizable voice while the work interface keeps identifiers, explanations and controls easy to scan. Monospace belongs to commands, code and diffs; measured counts use tabular numerals.

### Hierarchy

- **Display**: public hero, weight 700, `clamp(3.5rem, 6vw, 5.75rem)`, line-height 1.02 and tracking -0.025em. Phones use 3.75rem with line-height 1.04.
- **Marketing title**: section headings, weight 600, 2.625rem and line-height 1.1; compact section variants range from 1.5rem to 2.375rem.
- **Page title**: operational heading, weight 700, 1.875rem; phones use 1.75rem. Reading-page titles use 2.25rem, becoming 2rem on phones.
- **Title**: global section headings use 1.375rem with line-height 1.25; small work headings use 1–1.125rem.
- **Body**: 1rem with line-height 1.6; operational supporting prose commonly uses 0.9375rem. Reading paragraphs use 1rem with line-height 1.8 and a 72ch maximum; phones use 0.9375rem.
- **Label**: controls use 0.875rem, usually weight 500–600; evidence tabs use 0.8125rem. Supporting metadata uses 0.75–0.8125rem.
- **Code**: baseline 0.875rem with line-height 1.75; saved diff and receipt output use 0.8125rem, reducing to 0.75rem for narrow diff views.
- **Popup**: Public Sans at a 14px root; heading 18px, action/status text 13px and supporting text 12px.

**The Work Type Rule.** Keep display lettering in public marketing and the brand wordmark; use Public Sans for operational and reading content.

## Layout

The reused spacing rhythm runs from 0.375rem through 3rem. Compact gaps stay inside groups; section boundaries receive larger spacing. These are extracted values, not an additional runtime spacing-variable API.

- **Public layout:** centered maximum width 86rem, with 2rem side padding, reducing to 1.5rem at 1024px and 1rem at 680px. The header wraps when text grows. The hero uses two columns with actions beside the headline; the bench uses three evidence columns.
- **Workspace:** a 232px sticky rail beside a flexible main area. Between 681px and 1180px the rail is 196px. Main content has a 100rem maximum and 2rem padding, becoming 1.5rem on tablet and 1rem horizontal padding on phones.
- **Evidence:** main evidence beside a 17rem activity column. Tablet and phone collapse that pair into one column; tablet activity uses two columns internally. Six actual phases become a three-column sequence on phones.
- **Reading:** a 13rem navigation rail beside a flexible article, separated by 4rem. At 1024px the rail becomes 11rem with a 2rem gap; at 680px navigation moves above the article as wrapping links. Article measure is 72ch.
- **Forms and rows:** repository rows keep identity, health and actions aligned on desktop; phones promote identity and health to full-width rows. Launch configuration moves from three columns through two to one. Settings panels stop at 60rem.
- **Phone navigation:** at 680px and below, the workspace uses five labeled bottom destinations. Main clearance is `calc(84px + env(safe-area-inset-bottom))`; the bar also incorporates safe-area padding. Desktop connection/footer details are removed from that bar.
- **Phone evidence:** failure and patch remain paired, while verification spans beneath them. Evidence tabs use two columns to fit French labels. Diff and command logs retain deliberate internal scrolling rather than forcing page overflow.
- **Extension:** a 360px popup with 20px padding, compact header controls and full-width job actions.

**The Inspection Rule.** Keep repository identity, evidence, actual counts and recovery actions readable before adding visual chrome.

## Elevation & Depth

Depth is primarily tonal: page, surface, layer and selected surface form the hierarchy. Work panels are flat at rest. The soft offset shadow belongs to menus and pickers, whose border identifies their interactive edge; it is not the default card treatment.

### Shadow Vocabulary

- **Light portal:** `0 12px 32px #1b2d2924`.
- **Dark portal:** `0 12px 32px #0005`.

**The Portal Lift Rule.** Reserve the shared ambient shadow for floating menu surfaces; distinguish normal work panels with tone and purposeful dividers.

## Shapes

Controls have gently curved corners (`control`, 6px); panels have broader corners (`panel`, 12px). Menu options and evidence-count blocks use 4px. Switch tracks use 20px rounding, with circular thumbs. Actual phase markers and activity dots are circular. Ordinary buttons and panels do not become pills.

Borders are generally 1px. Selected evidence tabs use a 3px bottom rule, and phase rows use a 2px bottom rule to convey state. These inspection cues belong to the evidence system. The mascot silhouette remains the existing SVG asset.

## Components

### Buttons

Compact and explicit. Primary, secondary and destructive buttons share 0.625rem 1rem padding, a 46px minimum height, 0.875rem weight-600 lettering and control corners. Primary uses lime with forest ink; secondary uses a work surface and visible control edge; destructive uses semantic danger colors. Secondary hover/active moves through hover/layer tones. Disabled buttons use layer, muted text and 0.75 opacity. Busy actions keep a readable verb and an aria-busy state.

The icon-only appearance button has a 44px minimum target and an 18px drawn sun/moon. It shows the current appearance icon, while its accessible name describes switching to the other mode. It has no visible theme text or theme menu. First visit follows system appearance; a click stores an explicit light/dark override. The pre-paint initializer handles unavailable storage and same-origin preference changes.

### Menus and language

Language uses a styled menu everywhere. The web control is Radix Select with a portaled, end-aligned 160px-minimum menu, a checked indicator and full English/Français option names. Its 44px-minimum trigger shows the full language name on desktop and EN/FR at 680px and below, alongside drawn language/disclosure icons. The extension uses a 64px compact EN/FR button and a 156px menu with menuitemradio semantics, lime checked state and a visible check. Arrow keys, Home/End, Escape/Tab and outside-click dismissal are implemented; choosing an option or pressing Escape restores trigger focus.

The shared menu/picker surface uses a work background, explicit control edge, control corners, 0.375rem inset padding and portal elevation. Options have at least 44px height, 0.625rem 0.75rem padding and 4px corners; highlighted and selected options use distinct hover and selected tokens. Desktop repository/run pickers use Radix Select; their phone equivalents remain native mobile selects. Language is the explicitly styled exception.

English/French preference persists separately from theme, updates the document language and synchronizes between same-origin web tabs. Translate authored interface and reading copy; preserve repository/account identifiers, commands, URLs, API values and stored model evidence. French legal wording is authored translation, not certified legal localization.

### Inputs and switches

Fields use a 46px minimum height, 0.625rem 0.75rem padding, a work surface, visible control edge and control corners. Hover strengthens the edge; invalid fields use danger. Placeholders retain muted contrast; disabled fields use layer and muted text. Labels stay associated with controls, and deletion guidance remains linked through aria-describedby.

Repository settings use labeled native checkboxes with role=switch, styled as a 48×28px track and 18px thumb. Checked tracks retain the control-edge outline in dark mode; the thumb moves 20px and becomes lime. Permission-disabled switches retain semantics and use 0.55 opacity. Keep account deletion disabled until the typed account identifier matches.

### Navigation

Desktop workspace navigation uses forest surroundings and a lime selected destination. Reading navigation uses selected tone and aria-current. Public links use underlines for hover/current-page feedback. Phones retain all five named workspace destinations alongside their icons, and public navigation moves into a proven dropdown primitive.

Drawn Lucide icons normally use 1.75 stroke weight and 14–20px sizing; decorative icons are hidden from assistive technology. Keep disclosure chevrons and meaningful external-link cues. Do not introduce glyph icons or decorative punctuation into routine labels.

### Panels, status and recovery

Panel corners and tonal backgrounds group evidence, repository lists, history and settings. Repeated facts use rows and dividers rather than decorative tiles. Semantic notices use a readable icon/text pairing with role=status or role=alert as appropriate. Loading skeletons are hidden from assistive technology while a live text status remains available. Empty and unavailable states name the next useful action.

Connection failure presents Retry connection and retries bootstrap without requiring a page reload. Success feedback distinguishes sandbox verification from remote Actions results.

### Evidence bench and command receipts

The public bench labels its real seeded example and keeps original failure, minimal patch and verification together. Saved-job panels expose diagnosis, diff, verification and coverage through Radix tabs with actual evidence counts. Selected tabs use a text-colored bottom rule and lime count; arrow-key tab movement follows the primitive's behavior. Counts and metrics use tabular numerals.

Command receipts use native details/summary, a disclosure chevron, command text, result and recorded duration. Opening reveals bounded, internally scrollable logs; the chevron rotates. Diff lines retain line numbers, plus/minus context and semantic added/removed backgrounds. Keep sandbox receipts separate from remote CI results.

### Motion and accessibility

State feedback uses 140ms transitions; 200ms is the defined normal-duration token. Floating menus enter with a 3px upward offset resolving in 140ms ease-out. Busy spinners rotate over 1s. Avoid adding route-wide entrance choreography to routine work. Reduced-motion preference removes transition/animation durations and disables spinners.

Visible keyboard focus is a 3px semantic outline with 3px offset; menu items use a 2px inset focus outline. Preserve the skip link, native controls, Radix focus handling, named icon buttons, aria-current, aria-busy and live feedback. Header wrapping, bounded text measures and the phone tab grid accommodate enlarged or longer text.

Recorded verification includes 31 browser captures across desktop, tablet, phone and popup preview, both themes and authored English/French surfaces. The supplied contrast record covers 34 text pairs, all at least 4.5:1, with a minimum 4.98:1. Keyboard evidence tabs, Escape dismissal, preference persistence, reduced motion and temporary 200% root-font enlargement were checked. Text enlargement used DevTools, not native browser zoom.

The final finish verdict is ship for three scored corrections: bootstrap retry, the checked dark switch outline and French onboarding/operator prose. That verdict is a bounded correction confirmation, not a second whole-surface audit. The later styled-language-menu revision received a separate scoped ship review of six true-size captures. Browser checks confirmed web ArrowDown/Enter selection of French with trigger focus restored, Escape dismissal and no horizontal overflow at 375px. Popup ArrowDown/End/Enter selected French; Escape dismissed the menu and restored trigger focus. Those popup checks still used explicitly simulated native tab APIs. The reported web build and 34 Node tests passed for the revision. Native extension permission/cookie behavior, native screen readers, hardware keyboard overlays and every provider-specific failure remain outside the verified boundary. No destructive deletion, permission expansion, new inference job, automatic merge or automation enablement was used for visual verification.

## Do's and Don'ts

### Do:

- **Do** use semantic variables and their dark overrides for every shared control and portal.
- **Do** keep lime actions legible with forest ink and pair outcome color with readable text.
- **Do** use Public Sans for work and reading, Barlow Semi Condensed for public display, and monospace for actual code.
- **Do** preserve actual identifiers, counts, command output and sandbox/remote verification boundaries.
- **Do** retain icon-only theme switching, styled English/French menus and visible keyboard focus.
- **Do** adapt evidence, navigation and long labels deliberately at the existing phone breakpoint.

### Don't:

- **Don't** reintroduce the rejected navy/yellow identity or replace the existing goblin asset.
- **Don't** turn ordinary information into repeated promotional tiles or add containers without a grouping purpose.
- **Don't** add decorative kickers, glyph icons, arbitrary gradients, hard offset shadows or routine entrance effects.
- **Don't** append decorative punctuation to names, buttons, labels or short headings.
- **Don't** translate repository identifiers, source commands, API values or stored model evidence.
- **Don't** present illustrative evidence, generated art or unperformed checks as product proof.

**Not canonized:** no unresolved visual defect is promoted into these tokens. The superseded primary active and sidebar/source hover literals were replaced with semantic colors before extraction. This documentation pass does not repair source or imply native extension/runtime accessibility certification.

