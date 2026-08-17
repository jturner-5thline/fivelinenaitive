# Taller Status & Stage selectors

The status and stage dropdown triggers are currently fixed at 32px tall (set in `src/index.css` via `.deal-rail-control`).

## Change

In `src/index.css`, raise `.deal-rail-control` `height` and `min-height` from 32px to 48px (a 50% increase). Width stays content-sized, and the 8px radius, fill, border and flattened inner badge stay exactly as they are.

No component or logic changes.
