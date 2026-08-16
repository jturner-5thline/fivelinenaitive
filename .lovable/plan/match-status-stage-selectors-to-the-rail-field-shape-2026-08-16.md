# Match status & stage selectors to the rail field shape

Today the Status and Stage selectors under the status note render as short pill-style tags: a small inner badge roughly 18px tall wrapped in a `rounded-full` trigger. The other selectors in Deal Information (Close date, Deal manager, Type, Engagement, etc.) render as ~32px-tall controls with an 8px radius, a dark navy fill and a thin indigo hairline border.

Goal: give Status and Stage the same shape and height as those field controls, without changing their current widths (they stay sized to their content, sitting left-aligned under the status note).

## What changes

- Status and Stage triggers get the standard control height (32px, matching the Close date picker) instead of the compact 18px pill.
- Corner radius becomes 8px on the trigger; the `rounded-full` pill shape is removed for these two controls only.
- The inner badge stops looking like a separate pill inside a pill: it becomes flush with the trigger so the control reads as one field, with the colored status dot / stage accent retained.
- Padding is normalized to the field standard so text is vertically centered and the chevron sits at the right edge.
- Fill, border color and white text stay as they are now.
- Widths stay unchanged — no fixed or full-width stretch.

## Not changing

- Dropdown menu contents, options, and behavior.
- Status/stage tags elsewhere in the app (list view, pipeline cards, memo header) keep their compact pill form.

## Technical notes

- Scope everything through the existing `.deal-rail-control` class in `src/index.css`, which is already applied only to the Status/Stage tags and the Close date picker in `src/pages/DealDetail.tsx` and `src/components/deal/DealContextRail.tsx`.
- Add height/padding/radius rules for `.deal-detail-surface .deal-rail-control` and override the child badge (`h-[18px]`, `rounded-full`, its own border/background) so the outer control provides the chrome.
- Keep the existing `[class*="rounded-full"].deal-rail-control` specificity guard so the global pill rule does not re-round these controls.
- Avoid touching `EditableDealStatusTag` / `EditableDealStageTag` component markup so their other usages are unaffected.
