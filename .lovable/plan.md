## Goal

Add click-to-sort and per-column filtering directly on the Deals list (table) header, so users don't need to leave the table for the toolbar Sort/Filter dropdowns.

## Scope

Only the **list view** of `/deals` (`DealsList` → `viewMode === 'list'`). Grid and pipeline views are untouched.

## Behavior

### Sorting
- Click a sortable header → cycles `asc → desc → cleared` (cleared resets to default `updatedAt desc`).
- Active sort field shows an arrow (`↑`/`↓`) in the header; inactive headers show a faint neutral indicator on hover.
- Reuses existing `sortField` / `sortDirection` from `useDeals` (and the existing `toggleSort` helper). The page already plumbs both into `DealsList`.
- Sortable columns: Company, Value, Status, Stage, Manager, Type, Total Fee, Total Hours, Revenue/Hour, Late Milestones, Updated. (Adds `manager`, `engagementType`, `totalFee`, `totalHours`, `revenuePerHour`, `lateMilestones` to the `SortField` union and to the `useDeals` switch.)

### Filtering
- Each filterable header gets a small funnel icon next to the label; clicking it opens a popover.
- Popover content depends on column type:
  - **Status / Stage / Type / Manager** — multi-select checklist sourced from the unfiltered deal set.
  - **Company** — text contains.
  - **Value / Total Fee / Total Hours / Revenue/Hour** — min/max numeric.
  - **Updated** — relative range (Last 7d / 30d / 90d / All).
- Active filter pills render in a thin sub-row under the headers with a “Clear all” button.
- Header filter state lives in the existing `DealFilters` shape on `useDeals`. Where the field doesn't yet exist (e.g. `valueMin/Max`, `totalFeeMin/Max`, `updatedWithinDays`), it is added to `DealFilters` and applied in `useDeals` `useMemo`.
- Filters compose with the existing toolbar filters (AND), and persist into Saved Views via the existing `useDealSavedViews` config (no schema change — `filters` is JSON).

### Interaction notes
- The drag-handle on `SortableTableHead` (column reorder) stays. Sort is triggered by clicking the label area; the grip icon keeps drag activation. Filter funnel is its own click target and uses `stopPropagation` so it doesn't trigger sort or drag.
- Group-by remains independent — sorting applies inside each group.

## Technical changes

```text
src/hooks/useDeals.ts
  - Extend SortField union with manager | engagementType | totalFee | totalHours | revenuePerHour | lateMilestones
  - Add comparators in the sort switch
  - Extend DealFilters with: companyContains, valueMin/Max, totalFeeMin/Max,
    totalHoursMin/Max, revenuePerHourMin/Max, updatedWithinDays, plus
    multi-select arrays where currently single-value
  - Apply new filters in the filter useMemo
  - toggleSort: add 3rd state (cleared → default)

src/components/deals/DealsList.tsx
  - Replace SortableTableHead with a new SortableFilterableHead that renders:
      [grip] [label + sort arrow button] [filter funnel popover]
  - Pass sortField, sortDirection, toggleSort, filters, setFilters down
  - Render active-filter chip row above TableBody
  - Remove the local FLEx sort fallback once toggleSort handles it (keep
    flexEngagement comparator inside useDeals)

src/pages/Deals.tsx
  - Pass toggleSort, filters, setFilters into <DealsList />
  - Saved Views already serialize filters/sort; verify new fields round-trip
```

New small components:
- `DealsHeaderFilterPopover` (handles per-column popover variants).
- `DealsActiveFilterChips` (renders chip row + clear).

## Out of scope

- Grid and pipeline views.
- Server-side sort/filter (current implementation is client-side; behavior unchanged).
- Saved-view migrations (schema is JSONB, new keys are additive).

## Acceptance

- Clicking Value / Status / Stage / Manager / Type / Total Fee / Updated headers sorts the table and toggles direction.
- Funnel icon on each filterable header opens a contextual filter popover; selecting values narrows the visible rows.
- Active filters render as removable chips above the rows; “Clear all” removes them.
- Toolbar Sort dropdown and Filter dialog still work and stay in sync with header state.
- Selections persist into Saved Views and reload correctly after a refresh.
