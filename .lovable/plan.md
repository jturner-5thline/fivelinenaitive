## Goal

Add the four financial chart widgets that currently live at the top of the FinServ Financial Metrics dashboard to the Debt Advisory Metrics dashboard (`ConsolidatedDebtPipelineDashboard.tsx`), driven by the same live QuickBooks data pipeline but pointed at the "5th Line Capital Advisors LLC" realm (`193514877331929`) instead of "5th Line Financial Services, LLC" (`9341451968897660`).

### Widgets to replicate
1. **Total Revenue** — monthly bars for the selected period, with the trend-line + Δ tooltip toggle.
2. **Gross Profit** — single card with `$` / `%` toggle (GP $ bars vs GP margin % bars).
3. **Operating Profit** — single card with `$` / `%` toggle (OP $ bars vs OP margin % bars).
4. **Cashflow** — bar chart of QBO Statement of Cash Flows net cash flow, netted of intercompany adjustments, with trend toggle.

Each chart keeps its current behavior: same visual language (dark glass, cyan/green/red bars), same tooltips (`DeltaTooltip` with period-over-period Δ$/Δ%), same trend-line toggle, same drill-down wiring, and the same global `useInsightsTimeframe` authority.

## Approach

### 1. Parameterize the data hooks by realm
`src/hooks/useFinServFinancialMetrics.ts` currently hardcodes `FINSERV_REALM_ID`. Change the four hooks the debt dashboard needs to accept an optional `realmId` argument (default = FinServ realm so all existing FinServ callers keep working):

- `useFinServTotalRevenue(period, granularity, realmId?)`
- `useFinServQuarterlyProfits(period, granularity, realmId?)`
- `useFinServCashflow(period, granularity, realmId?)`
- Internal helpers `fetchFinServPnlSnapshots`, `syncFinServPnlSnapshots`, `ensureFinServPnlSnapshots` take a `realmId` parameter and include it in the react-query keys so FinServ and Debt caches never collide.

Also export a new constant `DEBT_ADVISORY_REALM_ID = '193514877331929'` from that hook file so all Debt callers reference a single source of truth.

The QBO sync (`quickbooks-sync` edge function) is already realm-agnostic — it just receives `realmId` in the body — so no edge-function changes are required. Data lands in the same `qbo_pnl_snapshots` / `qbo_cashflow_snapshots` tables, keyed by realm.

### 2. Extract the four widget components
The `GrossProfitToggleCard`, `OperatingProfitToggleCard`, `DeltaTooltip`, and `TrendDeltaText` helpers are defined inline inside `FinServFinancialMetricsDashboard.tsx`. Extract them (plus the small formatting helpers `fmtCurrency`, `fmtCurrencyFull`, `fmtPercent`, `computeLinearTrend`, `TrendToggleButton`, `createGlassBarShape` reuse) into a shared file:

- `src/components/metrics/finserv-charts/PnlChartCards.tsx` — exports `TotalRevenueCard`, `GrossProfitToggleCard`, `OperatingProfitToggleCard`, `CashflowCard`. Each card accepts the hook data + a `titleSuffix` / drilldown-source id so labels ("FinServ Cashflow" vs "Debt Advisory Cashflow") can differ per dashboard.
- Re-import these into `FinServFinancialMetricsDashboard.tsx` so nothing visible changes for the existing dashboard.

### 3. Add a "Financial Performance" section to the Debt dashboard
In `ConsolidatedDebtPipelineDashboard.tsx`, add a new section (above the existing Debt Advisory Metrics pipeline board) that:

- Reads the global `useInsightsTimeframe` range (same as FinServ dashboard).
- Calls the four hooks with `realmId = DEBT_ADVISORY_REALM_ID`.
- Renders the four cards in the same layout used on FinServ (Total Revenue full-width, then a 2-col grid for GP + OP, then Cashflow full-width).
- Uses the same drill-down provider (`DrilldownProvider` / `useDrilldown`) — pass `realm: DEBT_ADVISORY_REALM_ID` on the click payloads so the `client-series` / `pnl` / `cashflow` drill-down bodies query the right realm. `ChartDrilldown.tsx` already accepts an optional `req.realm` and defaults to FinServ, so callers just need to pass it.

### 4. Intercompany netting
The FinServ cashflow subtracts an `intercompany_adjustment` column (the "Due to/from 5th Line Capital LLC" line). We keep the same subtraction logic for Debt so the two dashboards are symmetric — the column already exists on `qbo_cashflow_snapshots` for both realms; for Capital Advisors it captures the opposite side of the same intercompany pair.

### 5. Access gating
The Debt Advisory Metrics dashboard is already gated by the existing Insights permissions in `Insights.tsx`. No new gating needed — this addition inherits it.

## Files touched

- `src/hooks/useFinServFinancialMetrics.ts` — add optional `realmId` args + `DEBT_ADVISORY_REALM_ID` export; thread `realmId` through query keys and QBO fetch/sync calls. No behavior change for existing FinServ callers.
- `src/components/metrics/finserv-charts/PnlChartCards.tsx` — new file. Extracted `TotalRevenueCard`, `GrossProfitToggleCard`, `OperatingProfitToggleCard`, `CashflowCard` + shared helpers.
- `src/components/metrics/dashboards/FinServFinancialMetricsDashboard.tsx` — replace inline definitions with imports from the new file (no visual change).
- `src/components/metrics/dashboards/ConsolidatedDebtPipelineDashboard.tsx` — mount the four cards inside a new "Financial Performance" section using `realmId = DEBT_ADVISORY_REALM_ID`.
- `src/components/insights/ChartDrilldown.tsx` — no changes required (already accepts `req.realm`); Debt callers just supply it.

## Out of scope
- No changes to QBO sync scheduling, edge functions, or database schema.
- No changes to the FinServ dashboard's visible layout or data.
- Not replicating the Average Revenue by Client, Revenue Change by Client, Active Clients, Total MRR, or Income by Product/Service widgets — only the four explicitly requested (Revenue, GP $/%, OP $/%, Cashflow).
