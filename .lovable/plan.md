# Match deal detail pop-up widgets to grid-view deal tiles

## Goal
Every module/widget inside the deal details pop-up should use the exact same surface treatment as the deal tiles in grid view.

## Target values
- Fill: vertical gradient `#050D20 → #020611 (50%) → #000208`, base color `#020611`
- No backdrop blur, no diagonal sheen overlay
- Border: `1px solid rgba(190, 220, 255, 0.34)`, radius `8px`
- Shadow: `inset 0 1px 0 rgba(200,225,255,0.09)`, `0 1px 2px rgba(0,0,0,0.32)`, `0 12px 32px -16px rgba(0,0,0,0.62)`
- Text `#FFFFFF`; muted text `rgba(255,255,255,0.85)`
- Hover: gradient `#08132C → #04091C → #01030C`, border `rgba(214,234,255,0.52)`, shadow `0 18px 40px -16px rgba(0,0,0,0.70)`, and a `-2px` (translate-y-0.5) lift over 200ms

## Changes
- Update the deal detail module chrome tokens: radius from 5px to 8px, border color to `rgba(190,220,255,0.34)`, hover border to `rgba(214,234,255,0.52)`.
- Replace the current card/glass fill (`#0a0e1a` + faint blue diagonal wash + 14px blur) with the tile gradient, remove `backdrop-filter`, and apply the tile shadow stack.
- Replace the hover block with the tile hover gradient, border, shadow and a `translateY(-2px)` lift.
- Set muted text inside these modules to `rgba(255,255,255,0.85)` while primary text stays `#FFFFFF` (existing white overrides remain).
- Keep the existing exceptions intact: fully-rounded pills/avatars keep `9999px`, nested modules don't double-lift on parent hover, reduced-motion still disables transforms.
- Re-tune the "nested module steps brighter" rule so nested cards remain distinguishable against the darker tile fill (a slightly lifted translucent white over the same gradient).

## Technical notes
- All edits are in `src/index.css`, in the `.deal-detail-surface` block (tokens, `.bg-card`/`[class*="bg-card"]`/`[class*="bg-muted/"]`/`.deal-glass` rules and their `:hover` counterparts). The tile values are copied from the existing `.deal-tile.deal-glass` rules so the two surfaces stay in sync.
- The existing global 8px radius override for the deal surface already matches the new token, so no conflict.
