## Goal
Remove the green "Active" toggle button from the Active Pipeline (/deals) filter bar. Keep all other status filters and underlying pipeline logic untouched.

## Scope
Single file: `src/pages/Deals.tsx`.

The button is a 5th-Line-only `Toggle` rendered at lines 805–825 that narrows results to deals at "Final Credit Items" or later via `activeStagesOnly` state.

## Changes

1. **Delete the Toggle JSX block** (lines ~805–825) — the entire `{is5thLine && (<TooltipProvider>…Active…</Toggle>…)}` wrapper.

2. **Remove the now-unused client-side filter state and its effect:**
   - Remove `const [activeStagesOnly, setActiveStagesOnly] = useState(false);` (line 137).
   - Remove the filter branch in the `useMemo` (lines 361–367):
     ```ts
     if (is5thLine && activeStagesOnly) {
       result = result.filter(deal =>
         REACHED_FINAL_CREDIT_SLUGS.has(...),
       );
     }
     ```
   - Drop `activeStagesOnly` from that memo's dependency array (line 370).
   - Remove the now-unused import `REACHED_FINAL_CREDIT_SLUGS` from `@/lib/salesBdActivePipelineConversion` (line 41) if no other reference remains.

## Out of scope
- No changes to deal data, pipelines, stage definitions, saved views, other status chips, or any other filter control.
- No changes to `DealFilters.tsx`, `FiltersPopover.tsx`, or the helper module itself.

## Validation
- /deals filter bar no longer shows the green "Active" button for 5th Line users.
- All other filter chips (Notifications, Tasks, Status, etc.) continue to work.
- Deal list shows the full pipeline-filtered set by default; no deals are hidden by the removed toggle.
