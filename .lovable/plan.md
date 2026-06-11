
## Goal
Let a deal have **no status**. Render NULL as no badge. New deals already default to null in `CreateDealDialog`; this plan closes the remaining gaps in edit forms, the inline status dropdown, filters, grouping, sorting, bulk-edit, and a few hooks that silently coerce null → `'on-track'`.

## Current state (verified)

- DB: `public.deals.status` is nullable with no default. ✓
- Type: `Deal.status: DealStatus | null` already declared. ✓
- `useDealsDatabase`:
  - `createDeal` writes `dealData.status ?? null`. ✓
  - Read paths map `dbDeal.status || null`. ✓
  - `updateDealStatus(dealId, null)` already supported. ✓
- `DealStatusTag` returns `null` on falsy status. ✓
- `EditableDealStatusTag` already has a "None" option + "No status" pill. ✓
- `CreateDealDialog` passes `status: null` when creating. ✓

## Gaps to fix

### 1. `src/components/deals/DealEditDrawer.tsx`
The status `<Select>` has no clear option and can't represent null.
- Add a "No status" `<SelectItem>` using a `__none__` sentinel.
- Read: bind `value={formData.status ?? '__none__'}`.
- Write: in `onValueChange`, map `'__none__'` → `null`. Update both save paths (lines 193 & 215) so `status` is sent as `DealStatus | null` (drop the `as DealStatus` casts).

### 2. `src/components/deals/InlineStatusDropdown.tsx` (used in `DealListRow`)
Currently typed `status: DealStatus` and `onStatusChange: (id, DealStatus) => void`; can't show or set "no status".
- Widen prop to `status: DealStatus | null` and `onStatusChange: (id, DealStatus | null) => void`.
- When `status` is null, render the same translucent "No status" pill used in `EditableDealStatusTag` (CircleDashed icon + "No status" text, muted token, no hardcoded colors).
- Prepend a "None" dropdown item that calls `onStatusChange(dealId, null)`.
- Keep the existing on-track inline-style branch but guard it with `status === 'on-track'`.

### 3. `src/components/deals/DealListRow.tsx`
- Propagate the wider type into the row's `onStatusChange` prop (line 177–186 already just forwards). No render changes needed beyond passing `deal.status` directly (null-safe now).

### 4. `src/components/deals/DealsBulkActionBar.tsx`
- Add a "No status" option in the bulk status `<Select>` that sends `status: null` to `applyBulkUpdate`. Confirm `applyBulkUpdate` and its server write accept null (it already does via `updateDeal`).

### 5. `src/components/deals/DealsList.tsx` (grouping)
- In `getGroupValue`, return a stable `__no_status__` key when `deal.status` is null instead of `'Unknown'`.
- In the status `STATUS_ORDER` rendering, append `'__no_status__'` last so deals without status form their own collapsed group labeled "No status" (use a muted dot color token).

### 6. `src/lib/dealFilterEngine.ts` (sorting + filtering)
- Status sort: when comparing, treat null as always sorting after all real statuses regardless of asc/desc, so empty-status deals don't randomly slot to the top.
- Status filter: when `filters.status` includes the sentinel `'__no_status__'`, match deals where `deal.status == null`.

### 7. `src/components/deals/FiltersPopover.tsx` and `DealFilters.tsx`
- Add a synthetic `{ value: '__no_status__', label: 'No status' }` option alongside `STATUS_CONFIG` entries in `statusOptions`.
- Update the chip label resolver in `DealFilters.tsx` (line 124-126 / 169) to render "No status" for the sentinel.

### 8. Hooks that coerce null → `'on-track'`
Remove the silent coercion so null flows through to UI:
- `src/hooks/useDealContextSummary.ts` line 256
- `src/hooks/useFinServPipelineData.ts` line 104
- `src/hooks/useNaitivePipelineData.ts` line 141
Change `d.status || 'on-track'` → `d.status ?? null` and widen the local type to `DealStatus | null`. Audit immediate consumers — they already render via `DealStatusTag`/`EditableDealStatusTag`, both null-safe.

### 9. Minor render safety
- `DealCard.tsx` line 127 and `DealListRow.tsx` line 68 build a `statusConfig` fallback that's only used by code paths gated on having a status; verify nothing renders a placeholder badge when `deal.status` is null (the existing `<DealStatusTag>`/`<EditableDealStatusTag>` calls already return null in that case).

## Out of scope
- No DB migration — column is already nullable, no default.
- No backfill — existing rows with a status keep theirs; null stays null.
- `STATUS_CONFIG` keeps its 5 entries; "No status" is purely a UI/sentinel concept, never persisted.

## Validation
1. Create a new deal from `/deals` → status pill shows "No status", DB row has `status = NULL`.
2. Open Deal Edit Drawer on that deal → status field shows "No status"; save without picking one keeps it null.
3. From a deal card / list row, open status menu → pick "None" on a deal that had `on-track` → badge disappears, DB row becomes NULL.
4. `/deals` filter → tick "No status" → only nullable-status deals are listed; chip reads "No status".
5. Group by Status on `/deals` list view → a "No status" group renders last.
6. Sort by Status asc/desc → null-status deals always at the bottom.
7. Bulk-select rows → set "No status" → all selected rows clear their status.
8. Naitive & FinServ pipeline views render null-status deals with no badge (no phantom "On Track").
