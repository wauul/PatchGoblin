# Design references and licenses

PatchGoblin uses one shared, product-specific system rather than importing component demos wholesale. The existing goblin mark supplies the final forest ink (`#1B2D29`) and lime accent (`#B6E572`). Public Sans supports operational reading; Barlow Semi Condensed gives the public headline a compact, workshop-like display voice.

## Guidance used

- [Taste](https://github.com/Leonxlnx/taste-skill), including its marketing skill source: infer the developer audience, lead with the actual repair, avoid interchangeable feature cards, preserve existing framework and icon assets, self-host fonts.
- [Impeccable](https://github.com/pbakaus/impeccable), installed skill: separate persuasive, operational and reading surfaces; maintain a complete control vocabulary; use a bounded verification pass and independent finish review/documentation.
- [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill), source skill and pro rules: accessible native/proven controls, comfortable targets, semantic theme tokens, deliberate mobile layout and reduced motion. Its optional search/database script was not installed or run.
- [Awesome AI Tools for UI](https://github.com/maxbogo/awesome-ai-tools-for-ui): used to identify relevant available design and browser-verification resources. Figma, Stitch and unrelated tools were not used.

## Component research

- [21st.dev navigation library](https://21st.dev/community/components/s/navigation-menu), [Origin UI library](https://21st.dev/@originui/library/origin-ui): reviewed component structure and density.
- [Tabs with count badges](https://21st.dev/@coss.com/components/tabs-count-badge), [underlying coss example](https://coss.com/ui/r/p-tabs-10.json): inspired evidence tabs with actual recorded counts. PatchGoblin implements its own Radix tabs and visual treatment. The coss example is MIT licensed; no example code was copied.
- [Bottom navigation](https://21st.dev/@arunachalam/components/bottom-nav-bar): informed the five-destination phone navigation. The animated pill and hidden inactive labels were rejected; every PatchGoblin destination remains labeled. No third-party source was copied.
- [Navbar with theme controls](https://21st.dev/@shadcnui-blocks/components/navbar-02): reviewed mobile menu/theme organization. Final theme control follows the user's explicit two-state, icon-only instruction.

## Shipped assets

The goblin SVG is the pre-existing project asset. Lucide remains the sole icon family. Selects, menus and evidence tabs use MIT-licensed Radix primitives; native selects remain on phones. Public Sans and Barlow Semi Condensed are self-hosted WOFF2 fonts sourced from Google Fonts, with their SIL Open Font License files included beside the assets. No remote font request, generated illustration, stock photograph or fabricated interface screenshot is shipped.

Browser screenshots are verification records of real pages, not marketing mockups. Saved model explanations, shell commands, workflow names and diffs retain their original content when interface language changes.
