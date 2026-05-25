# UroRads — Front-end Design Principles

Direction: **Clinical & Calm**. References: Figure 1, Radiopaedia, Apple Health.
Voice: clinical, calm, confident. The UI should feel like a teaching tool used in
a reading room, not a marketing site.

## Color
- **Primary**: deep medical teal-blue (`hsl(200 75% 38%)` light / `hsl(200 75% 55%)` dark).
  Used for primary CTAs, active states, links.
- **AI accent**: muted teal-cyan (`hsl(175 60% 38%)` / `hsl(175 60% 55%)`). Reserved for
  AI surfaces (chat bubbles, AI badges). Never used for destructive or navigational accents.
- **Surface scale**:
  - Light: app background `hsl(210 30% 99%)` (cool off-white), card `hsl(0 0% 100%)`,
    sidebar `hsl(210 25% 97%)`. Borders are tinted neutral `hsl(215 16% 90%)`.
  - Dark: app background `hsl(215 28% 8%)` (deep slate, never pure black), card
    `hsl(215 25% 11%)`, borders `hsl(215 18% 18%)`.
- **Restrained accents**: category badges stay muted (tints, not saturated fills).
- **Destructive**: stays red but slightly desaturated for clinical feel.

## Typography
- Inter throughout, antialiased.
- Scale: `xs` 12 / `sm` 14 / `base` 16 / `lg` 18 / `display` 22-28.
- Headings: `tracking-tight`, `font-semibold`.
- Body: `leading-relaxed`.
- Numbers (case numbers) use tabular-nums and the `font-display` utility.

## Spacing
- 4 px base. Common rhythm: 8 / 12 / 16 / 24.
- Page gutters: 16 px on mobile, 24 px on tablet+.
- Touch targets ≥ 44 px.

## Radius & elevation
- `--radius: 0.875rem` (~14 px). Cards `rounded-2xl`, inputs `rounded-xl`, pills `rounded-full`.
- Two elevation steps via real (subtle) shadow + border combo. The existing
  `hover-elevate` / `active-elevate-2` overlay utilities are preserved.

## Motion
- 150 ms ease-out default; 250 ms for page/mode transitions.
- `active:scale-[0.97]` on primary tappable shell elements (nav, headers).
- Respect `prefers-reduced-motion`.

## PWA principles
- Theme color matches the actual app shell (header surface) per `prefers-color-scheme`.
- Standalone display on iOS / Android. Safe-area insets respected top and bottom.
- Cache is bumped on every cosmetic release so old shells don't linger.
- A non-intrusive install hint appears in the user menu when the browser supports
  `beforeinstallprompt`, or as an iOS "Add to Home Screen" tip on iPhone Safari.

## Showcase mode
Default to system (`prefers-color-scheme`). The palette is tuned to look equally
strong in light and dark.
