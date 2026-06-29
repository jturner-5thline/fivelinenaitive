# Make the Global Timeframe Authoritative for Every Insights Widget

## Goal
When you change the header timeframe (e.g. "Last 6 Months", a quarter, a custom range, a month), every KPI, chart, widget and drilldown on `/insights` reflects that exact window — no hardcoded years, no per-widget overrides, no "fixed 9-month plan" views.

## Why this is bigger than a one-line fix
A spot-check shows the timeframe context (`useInsightsTimeframe`) is already correct, but several dashboards bypass it:

- **Sales Dashboard** — hardcodes `YEAR = 2026` and only renders Jan–Sep. KPI buckets, Sales Calls, Deals on Board, Proposals Issued, Dollars Signed all ignore the picker. `useSalesCallsCount(yearStart, yearEnd)` and the `*ByMonth(YEAR)` hooks need to accept the active range.
- **Sales Team Board KPI grid** (now embedded in Sales Dashboard) — same hardcoded year.
- **Cumulative Pace / Sales Model sheet** — `buildView(selectedQuarter)` collapses any range into a 9-month plan; needs a true N-month layout driven by `timeframe.start/end`.
- **Management Review / Snapshot dashboards** — already partially wired but some carousels use their own period state.
- **Revenue · Commissions · Profit, Revenue by Client, Income by Product/Service, Top Customers** — verify each chart/table reads `timeframe` and re-queries; today some default to the legacy `selectedQuarter` only.
- **Forecasts and Key Metrics tabs** — ensure forecast horizon and KPI series both pivot off the active range.
- **End of Day / Dashboard popup widgets** — outside `/insights`, untouched by this change (call out so we don't over-scope).

## Plan

### 1. Make the timeframe contract uniform
- Standardize on `useInsightsTimeframe()` returning `{ start, end, label, months[] }` where `months[]` is the ordered list of `YYYY-MM` buckets inside the range.
- Add a small helper `useTimeframeMonthBuckets()` so widgets that bucket by month don't each reimplement it.

### 2. Sales Dashboard refactor (largest piece)
- Remove the `YEAR = 2026` constant and the 9-month fixed array.
- Drive `yearStart`, `yearEnd` and all `*ByMonth` hooks from `timeframe.start/end`.
- Rebuild `buildView(...)` to accept arbitrary month ranges (1–24 months) and render the Sales Model sheet, cumulative pace chart, and KPI grid against that.
- Update `useSalesCallsCount`, `useDealsOnBoardByMonth`, `useProposalsIssuedByMonth`, `useDollarsSignedByMonth` to accept `(start, end)` instead of `(YEAR)`. Keep the cached `sales_calls_cache` lookup; just pass through the range filter.

### 3. Management Review + Snapshot
- Replace any local quarter/month state with the shared context.
- Carousel tabs (Agenda…SW) keep their own state, but every data widget reads `timeframe`.

### 4. Revenue / Finance widgets
- Audit `RevenueByMonthChart`, `IncomeByProductServiceCard`, `RevenueOverviewDashboard`, `HistoricalTrendChart`, drilldowns.
- Convert any `selectedQuarter`-only consumers to read `timeframe.start/end` directly. Keep `selectedQuarter` available for legacy QBO hooks, but compute it from `timeframe` (already does).

### 5. Forecasts + Key Metrics tabs
- `BenchmarkForecastsPage`, `KeyMetricsPage`: tie series length and "as of" markers to `timeframe.end`; tie history horizon to `timeframe.start`.

### 6. Verification pass
For each dashboard tab:
1. Set picker to "Last 6 Months", confirm every widget shows ~6 month buckets.
2. Set picker to a single quarter, confirm widgets collapse to that quarter.
3. Set picker to a custom 3-week range, confirm KPI cards and charts narrow accordingly (or hide month-bucketed widgets with a clear "Range too short" note when N<1 month).
4. Drilldown pop-ups inherit the same window.

## Out of scope (will not change)
- Dashboard popup (End of Day / Performance) — its own timeframe model, unchanged.
- Deals / CRM / Finance pages outside `/insights`.
- Sales Calls cache refresh cadence (still 24h sweep).

## Risk / open questions
- Sales Model "plan" numbers are currently keyed to specific months of 2026. When the user picks a window outside 2026, should plan rows show blanks, prorate, or hide? Default: render plan only for months that exist in the seeded model; show actuals for everything else.
- Cumulative Pace target curve same question — default: show pace only when plan exists for the selected months.

If you'd like a different default for those two edge cases, tell me and I'll wire it that way before implementing.
