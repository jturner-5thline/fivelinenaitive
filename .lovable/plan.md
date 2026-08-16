# Match deal detail pop-up widgets to grid-view deal tiles (flat fill)

## Goal
Every module/widget inside the deal details pop-up uses the same surface treatment as the grid-view deal tiles, but with a flat fill instead of a gradient.

## Target values
- Fill: flat `#020611` (no gradient, no backdrop blur, no diagonal sheen overlay)
- Border: `1px solid rgba(190, 220, 255, 0.34)`, radius `8px`
- Shadow: `inset 0 1px 0 rgba(200,225,255,0.09)`, `0 1px 2px rgba(0,0,0,0.32)`, `0 12px 32px -16px rgba(0,0,0,0.62)`
- Text `#FFFFFF`; muted text `rgba(255,255,255,0.85)`
- Hover: flat `#04091C`, border `rgba(214,234,255,0.52)`, shadow `inset 0 1px 0 rgba(200,225,255,0.12)`, `0 1px 2px rgba(0,0,0,0.36)`, `0 18px 40px -16px rgba(0,0,0,0.70)`, plus a `-2px` lift over 200ms

## Changes
- Update the deal detail module chrome tokens: radius 5px to 8px, border color to `rgba(190,220,255,0.34)`, hover border to `rgba(214,234,255,0.52)`.
- Replace the current card/glass fill (`#0a0e1a` plus a faint blue diagonal wash and 14px blur) with the flat `#020611`, remove the background-image wash and `backdrop-filter`, and apply the tile shadow stack.
- Replace the hover block with flat `#04091C`, the hover border, the deeper shadow, and `translateY(-2px)`.
- Muted text inside these modules becomes `rgba(255,255,255,0.85)`; primary text stays `#FFFFFF`.
- Keep existing exceptions: fully-rounded pills/avatars keep `9999px`, nested modules don't double-lift on parent hover, reduced-motion still disables transform and transition.
- Re-tune the nested-module rule to a flat slightly lighter navy so nested cards stay distinguishable against the darker parent fill.

## Technical notes
- All edits are in `src/index.css` inside the `.deal-detail-surface` block (tokens, the `.bg-card` / `[class*="bg-card"]` / `[class*="bg-muted/"]` / `.deal-glass` rules and their `:hover` counterparts).
- The existing global 8px radius override for the deal surface already matches the new token, so no conflict.
