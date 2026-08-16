# App Background: Corner-Anchored Blue Gradient

Replace the current straight top-to-bottom navy→blue gradient with a diagonal one where the bright blue pools in the bottom-right corner (per the second reference image), and make it the single background for every page.

## What changes

- Gradient direction goes from vertical (180deg) to a corner-anchored diagonal: deep near-black navy occupying the top-left two thirds, easing into #0a1a3a mid-field, then a bright #0a6fd8-class blue glow concentrated at the bottom-right corner.
- Applied as one fixed, non-scrolling backdrop so all app pages share the identical wash.
- Landing/home pages (currently solid black `#000000` on Homepage, and the purple video overlay on Index) adopt the same backdrop so the marketing surface matches the app.

## Where it lives

Today the gradient is duplicated in several places. This consolidates it into one CSS custom property, `--app-backdrop`, defined once in `src/index.css` and referenced everywhere.

## Technical details

1. `src/index.css`
   - Add `--app-backdrop` (a `linear-gradient(...)` at roughly 145deg with a radial blue glow anchored at ~100% 100%) in the theme block.
   - Update the `body` rule and `.dark body` rule to use `background-image: var(--app-backdrop)` with `background-attachment: fixed`.
   - Leave pop-up/widget surfaces (`.deal-glass`, `.deal-detail-surface`, `.sales-dashboard-popup`, insights skins) untouched.
2. `src/components/AppLayout.tsx` — the hardcoded gradient on the background layer (line ~217) becomes `var(--app-backdrop)`.
3. `src/pages/Homepage.tsx` — swap the inline `background: '#000000'` shell for the shared backdrop; keep the hero-to-page fade but retune its fade target from pure black to transparent so it dissolves into the new gradient instead of a black band.
4. `src/pages/Index.tsx` — replace the purple `hsl(270,30%,8%)` shell/overlay tint with the shared backdrop tones over the video, keeping the video legible.

## Out of scope

Modals, widgets, cards, and the deal detail pop-up keep their current fills and borders.
