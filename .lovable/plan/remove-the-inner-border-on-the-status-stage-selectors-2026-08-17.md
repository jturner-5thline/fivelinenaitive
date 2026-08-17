# Remove the inner border on the Status & Stage selectors

The status/stage triggers wrap a badge (`DealStatusTag` / `DealStageTag`) that carries its own colored border, blur and inset highlight. CSS already flattens that inner badge, but every one of those rules is scoped to `.deal-detail-surface`, so on the surface where these tags currently render the inner border still paints — leaving a double/white inner rim inside the field.

## Change

In `src/index.css`, in the Status & Stage selector block:

- Un-scope the flattening rules so they apply wherever `.deal-rail-control` is used (keep the `.deal-detail-surface` variants as well for specificity).
- Ensure the inner badge has `border: 0`, no `box-shadow` (removes the inset white highlight line), no `backdrop-filter`, no text-shadow and `border-radius: 0` — the outer control keeps the fill, 8px radius and its single 1px border.
- Preserve the colored status dot and the tag's text color so the status/stage remain visually distinguishable.

No component or logic changes.
