# Revenue & Customers Dashboard Refactor

This is a substantial refactor (current page renders 13 stacked one-off cards; ask is full toolbar + 12-col grid + per-widget drilldowns/kebabs + 8 new widgets + shared primitives). To land it safely without breaking the rest of `/insights` (which shares the same page shell as 10+ other dashboards), I'll do it in phases.

## Phase 1 — Foundations (this turn)

Build the shared primitives + filter context the rest of the work plugs into.

1. **`RevenueCustomersFilterContext`** — React context + `localStorage` persistence (key: `insights:revenue-customers:filters`)
   - `entities: string[]` (default: all 4 realm IDs from `src/config/qboEntities.ts` + Capital LLC `123146077561874`)
   - `range: { preset: 'MTD'|'QTD'|'YTD'|'TTM'|'custom'; start: Date; end: Date }`
   - `comparison: 'prior-year' | 'prior-period' | 'none'`
   - `granularity: 'day' | 'week' | 'month' | 'quarter'`
   - Helper `useRevenueFilters()` + derived `comparisonRange`

2. **`RevenueCustomersToolbar`** — single compact row: title + subtitle, sync chip (reuses `SyncStatusBar`'s QB badge logic), entity multi-select popover, date range picker w/ presets, comparison toggle, granularity segmented control. Matches `ManagementSnapshotDashboard` toolbar density.

3. **Shared card primitives** under `src/components/insights/revenue-customers/`:
   - `KpiTile` — compact tile (icon, label, value, delta chip, optional sparkline). Same surface as Operational/Management dashboards (`glass-module` token).
   - `ChartCard` — title row (inline legend slot, filter icon, kebab menu: View details / Change chart type / Download CSV / Copy link / Hide), `min-h-[260px] max-h-[300px]` chart area, standard loading/empty/error states.
   - `RevenueDrilldownDrawer` — right-side `Sheet` showing underlying rows (invoices/customers) with sortable table + CSV export. Opened by chart click handlers via a `useDrilldown()` hook.

4. **Page wiring**: replace the `space-y-5` stack at `Insights.tsx:2654-2670` with `<RevenueCustomersDashboard />` that renders the toolbar + a `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4` of widgets.

## Phase 2 — Migrate existing widgets (next turn)

Rewrite the 13 existing one-off cards as thin wrappers over `KpiTile` / `ChartCard` consuming `useRevenueFilters()`. Strip the per-card "QuickBooks · synced …" badge (moves to toolbar). Convert hero cards (`IncomeYTDCard`, `IncomeYTDMoMVarianceCard`) to compact tiles with sparklines.

- Quarterly Revenue → grouped bar, 280px, inline legend
- Income YTD → KPI tile + sparkline + delta chip
- Income YTD MoM Variance → compact pos/neg bar tile
- YTD by Entity → small-multiples toggle
- YTD Breakdown by Entity → donut (replaces pie)
- YTD Change by Entity → pos/neg bar
- FinServ TTM Top 5 → donut
- Total Income Rolling 12M → line + trend
- Income vs COGS Rolling 12M → area
- Income MoM → bar
- Client Count MoM → line
- Top 5 Customers MoM → grouped bar
- FinServ Top Customers → table tile

## Phase 3 — New widgets (next turn)

- Total Customers / New Customers / Churned Customers — KPI tiles from `quickbooks_customers` + first-invoice date logic
- ARPU — KPI tile (period income ÷ active customers)
- Revenue by Entity — donut
- Revenue by Product/Service — stacked bar from `quickbooks_invoices` line items (`ItemRef`)
- Top 10 Customers — sortable table
- AR Aging — uses existing `useOutstandingARByEntity` + aging buckets from `quickbooks_invoices.due_date`

## Technical details

- Data: all hooks query existing `quickbooks_invoices` / `quickbooks_customers` / `quickbooks_expenses` / `quickbooks_bills` tables filtered by `realm_id IN (selected entities)` and `txn_date` within selected range. No schema changes, no new edge functions, no hardcoded values.
- Realm IDs: 5th Line Capital LLC (`123146077561874`) is missing from `QBO_ENTITIES`. I'll add a `capital` key in the same module rather than hardcoding.
- Drilldown drawer reuses shadcn `Sheet` (right side, `w-[560px]`) and the CSV helper in `src/utils/insightsExport.ts`.
- Kebab "Change chart type" persists per-widget choice in `localStorage` under the same dashboard key.
- All other dashboard cases in `Insights.tsx` are untouched.

## Scope confirmation

Phase 1 is ~6 new files + 1 small edit to `Insights.tsx`. Phases 2 & 3 are mechanical but voluminous (~20 widgets). **I'll ship Phase 1 now and continue with Phase 2 + 3 immediately after you approve, in follow-up turns** so each turn stays reviewable. If you'd rather I attempt all three phases in one massive turn, say "do it all" and I will — but the diff will be very large.
