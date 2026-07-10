# Monthly Breakdown Toggle for Stat Widgets (Insights → Quarterly View)

## What the user gets

In the quarterly view of `/insights`, each stat (KPI) widget gains an optional **"Show monthly breakdown"** toggle in its editor. When on and the page is in quarterly view, the widget shows the metric's value for each of the quarter's three months plus month-over-month change, instead of the single Q-total value. Toggle is per-widget — nothing changes for widgets where it isn't enabled.

Example render for a widget with breakdown enabled, quarter Q2 2026:

```text
┌───────────────────────────────────────────────────────┐
│ FinServ: Active Client Count                          │
│                                                        │
│   Apr        May        Jun                            │
│   6          7          7                              │
│   —          +1         +0                             │
└───────────────────────────────────────────────────────┘
```

Chart widgets are unchanged (out of scope per your answer).

## Behavior rules

- Toggle only takes effect when Insights is in quarterly view (`view=quarter`). In monthly/other views the widget renders normally (the toggle is ignored, not hidden).
- Default: **off** for existing and new widgets — no visual change unless enabled.
- Persisted per widget alongside other settings (`timePeriod`, `color`, etc.).
- If a widget's data source doesn't support a monthly resolver yet, the widget falls back to its normal single-value view and shows a small "Monthly breakdown unavailable for this metric" note in the editor preview.

## UI changes

1. **Widget editor (stat widgets only)** — add a `Switch` labeled "Show monthly breakdown (quarterly view)" with helper text: "When the page is in quarterly view, split the value into Apr/May/Jun with month-over-month change."
2. **Widget render** in `Insights.tsx` — when `showMonthlyBreakdown === true` **and** the active view is quarterly, render `<StatMonthlyBreakdown>` instead of the normal `StatWidgetContent`.
3. **`StatMonthlyBreakdown` component** — three-column layout showing month label, value (formatted per metric type), and MoM delta pill (green/red/muted).

## Data model change

Extend `MetricWidgetConfig` with:

```ts
showMonthlyBreakdown?: boolean;
```

No migration needed — it's part of the JSON blob already persisted in `company_settings.fpa_dashboard_config`; missing = `false`.

## Coverage of stat widgets

Introduce a `monthlyStatResolvers` registry keyed by `dataSource`. Each resolver returns `{ month, value, formattedValue }[]` for a given quarter. Ship resolvers for the widgets that make sense to break out monthly:

- FinServ: `finserv-active-client-count`, `finserv-total-mrr`, `finserv-revenue-per-hour`, `finserv-profit-per-hour` (reuse the existing per-month hooks in `useFinServFinancialMetrics.ts`, honoring the June-2026 override already in place).
- QuickBooks: `qb-total-revenue`, `qb-total-expenses`, `qb-net-income`, `qb-total-payments`, `qb-accounts-receivable`, `qb-overdue-amount` (query `qbo_pnl_snapshots` / `quickbooks_invoices` grouped by month within the quarter).
- Deals: `active-pipeline`, `closed-won`, `total-fees`, `avg-deal-size` (already have monthly rollups from `useDealsDatabase` / activity logs).

Any stat not in the registry keeps its current single-value render even when the toggle is on (with the fallback note in the editor).

## Technical outline

Files touched:

- `src/contexts/MetricsWidgetsContext.tsx` — add `showMonthlyBreakdown?: boolean` to `MetricWidgetConfig`.
- `src/components/metrics/SortableMetricWidget.tsx` (or wherever the stat widget editor form lives) — add the `Switch` row for stat-type widgets, wired to `updateWidget`. If the current editor path is `WidgetSettingsDialog`, edit there.
- `src/components/insights/StatMonthlyBreakdown.tsx` (new) — presentational component: 3 columns, formatted value + delta.
- `src/lib/insights/monthlyStatResolvers.ts` (new) — per–data-source resolvers returning monthly values for a quarter. Uses existing hooks/queries; each resolver is a small hook.
- `src/pages/Insights.tsx` — in the `renderWidget` switch, before rendering a stat, check `widget.showMonthlyBreakdown && isQuarterView && resolvers[widget.dataSource]`. If matched, render `<StatMonthlyBreakdown>`.

Quarterly detection reuses the existing `useInsightsTimeframe()` → `reportingPeriod`/`view === 'quarter'`.

No backend, no schema changes.

## What's explicitly out

- Chart widgets (already monthly-capable via granularity).
- Dashboard/FinServ pages outside Insights.
- Auto-enabling for any widget — user must turn it on per widget.
