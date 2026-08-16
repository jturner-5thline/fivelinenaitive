# Soften deal detail widget borders

Lower the border contrast on the modules inside the deal details pop-up so edges read as a subtle hairline instead of a bright rim. Everything else (flat fill, 8px radius, shadows, hover lift) stays as-is.

## Change

- Default border: `rgba(190, 220, 255, 0.34)` to `rgba(190, 220, 255, 0.18)`
- Hover border: `rgba(214, 234, 255, 0.52)` to `rgba(214, 234, 255, 0.32)`

## Technical details

Both values are the `--deal-module-border-color` and `--deal-module-border-color-hover` tokens defined in the `.deal-detail-surface` scope in `src/index.css` (lines 2772-2773). Every widget rule already reads from these tokens, so the two token edits cover all modules. Grid-view deal tiles and the pop-up shell border keep their current `0.34` value.
