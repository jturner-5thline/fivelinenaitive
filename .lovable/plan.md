# Flatten deal widgets into the pop-up canvas

Make every module inside the deal details pop-up read as almost the same shade as the pop-up background, with separation coming from a thin, clearly visible border instead of a lighter fill.

## What changes visually

- Widget fill drops from the current lighter panel tone (#12141F) to a near-canvas tone that sits just a hair above the pop-up's dark navy/black gradient, so the modules no longer look like stacked grey boxes.
- Each widget keeps a crisp 1px border, brightened so edges are unmistakable against the near-identical fill.
- Hover brightens the border a step further (no fill jump), reusing the smooth transition already in place.
- Heavy drop shadows are softened, since definition now comes from the border rather than elevation.
- Inputs, search fields and nested sub-modules step a touch darker/lighter respectively so hierarchy inside a widget stays readable.

## Technical details

All edits are in `src/index.css`, inside the `.deal-detail-surface` scope (no component changes needed):

- `--deal-module-border-color`: `rgba(180, 212, 255, 0.34)`; hover variant `rgba(205, 228, 255, 0.52)`.
- `.deal-detail-surface .bg-card`, `[class*="bg-card"]`, `[class*="bg-muted/"]`, `.deal-glass`:
  - `background-color: #0A0E1A` (near the pop-up gradient average of `#020208 → #050d1f`), with the existing faint diagonal gradient reduced further.
  - `border-color` switched to the new bright token; `border-width` stays 1px.
  - Box shadow reduced to a single soft ambient shadow plus the 1px inset top highlight.
- Hover rule updates `border-color` to the hover token and keeps the existing 1px lift and transition timing.
- Nested-module rule (`.bg-card .bg-card`) shifts to `rgba(255,255,255,0.035)` so inner panels remain distinguishable against the darker parent.
- Input/textarea wells keep their recessed look by moving to `rgba(0,0,0,0.28)` with the same thin border.

Pop-up shell (`.popup-shell-surface`) and deals-page tiles (`.deal-tile.deal-glass`) are untouched.
