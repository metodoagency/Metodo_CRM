# Metodo CRM design system

Owner amendment 2026-11-23. Two visual directions were evaluated against a data-intensive private football-agency workspace; no business data was sent to a design service.

| Direction | Character | Operational fit |
|---|---|---|
|A — Private agency|Charcoal/navy, warm ivory and restrained champagne, strong locally hosted Noto Sans, compact accurate tables, subtle panels and clear player/brand dossiers|Selected: matches the already approved palette and existing working UI, supports long sessions, keyboard/mobile and both themes without rebuilding completed screens|
|B — Editorial studio|Ivory-led pages, large editorial headings, brass accents and spacious campaign imagery|Useful later for dossier/press outputs; its larger spacing is less suitable for the core CRM's dense daily operations|

Direction A is the implemented foundation. Source of color truth is src/design/tokens.css; base components use shared CSS variables. Fonts are packaged locally via the existing Noto Sans dependency, including Turkish Latin Extended. No external font request. Dark palette: background#10151e, panel#18212d, text#f4f0e9, muted#adb7c4, accent#d5bd91. Light: background#f5f2ed, panel#fffefa, text#202a36, muted#58616c, accent#74572b. Primary foreground is theme-specific. Warnings/errors retain semantic colors and sufficient contrast.

Use restrained14px panel radii, aligned headings/actions, real metadata and source-linked counts. No invented charts or missing-data zeros. Record headers lead to related records, timeline, notes, sources/files and tasks. Reuse one component system across Player360/Club360/Brand360/Person360. Show unfinished capabilities honestly; never add nonworking navigation as delivered scope.

Inputs have explicit localized labels; dialogs preserve opening versions and unsaved drafts. Focus is visible, a skip link reaches main content, mobile controls are at least44px high, and reduced-motion preferences disable nonessential motion. Tables become usable mobile cards. Private document URLs stay behind explicit timed audited disclosure; no URL preview/thumbnail network request on list load.

Verification is per source snapshot, not a design mockup: dashboard TR/EN dark/light browser cases and core route axe passed at the recorded November20 checkpoints; the current resource/portrait changes require their own fresh checks/CI. Screenshots contain fictional examples only. Final design acceptance includes actual populated record screens, mobile/keyboard, and zero serious/critical axe issues in both languages/themes.
