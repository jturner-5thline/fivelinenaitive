# FinServ chart drilldowns

Add click-through deep drilldowns to every tile on the FinServ Financial Metrics board, built on a reusable component so the same behavior lights up other analytics boards. Scope is intentionally split into two phases so the user gets useful drilldowns immediately and the deepest QBO-transaction layer ships behind a verified edge function.

## What the user will get

- Every bar, line point, and cell on the FinServ board becomes clickable and opens a side panel showing the underlying data for that exact period + metric.
- Panel supports keyboard (Esc to close), focus trap, ARIA labels on chart elements, loading/empty/error states.
- "View in QuickBooks" deep links for P&L and Cash Flow tiles, scoped to the clicked period.
- Drilldown content is range-aware (uses the same `range.granularity` + `range.resolved.start/end` + "Include current month" the parent tile resolved).

## Drilldown content by chart

| Chart | Drilldown content |
|---|---|
| Total Revenue | QBO Income accounts for the period (account name, amount, % of total). Click an account → transactions panel. |
| Gross Profit $ / GP Margin % | Income − COGS lines for the period with $ and % of revenue. |
| Operating Profit $ / Op Margin % | Net Operating Income breakdown: Income, COGS, OpEx subtotals, NOI line. |
| FinServ Cashflow | Operating / Investing / Financing sections with net contribution and Net Cash Increase. |
| Active Clients | List of FinServ deals in "Active Client" stage at end of bucket — name, owner, stage entry date, deal value, link to deal page. |
| Average Revenue by Client | Period revenue total + list of active clients in denominator + per-client value (flat avg for now). |
| Revenue Change by Client | Selected client's monthly revenue series + variance vs prior month + link to deal. |
| Income by Product/Service (stacked) | Per-product totals for clicked period + transactions drill. |

## Architecture

```text
src/components/insights/
  ChartDrilldownPanel.tsx           ← new: shared Sheet-based panel (focus trap, Esc, a11y)
  drilldown/
    PnlBreakdownView.tsx            ← Income / COGS / OpEx / NOI tables, click row → transactions
    CashflowBreakdownView.tsx       ← Operating / Investing / Financing sections
    ActiveClientsView.tsx           ← deal list with stage-entry timestamps
    AvgRevenuePerClientView.tsx     ← revenue + denominator list + per-client values
    ClientRevenueSeriesView.tsx     ← per-client monthly series + deal links
    PnlTransactionsView.tsx         ← second-level drill, lists individual QBO txns
    QboLinkButton.tsx               ← shared "View in QuickBooks" deep link builder
  useDrilldown.ts                   ← context hook providing { open(ctx) } to any chart
```

New data sources:

- `src/hooks/useQbPnlBreakdown.ts` — reads the existing `qbo_pnl_snapshots.raw_response` (already stored) and parses the section tree for the clicked period. No new edge function call required for the first-level breakdown.
- `src/hooks/useQbCashflowBreakdown.ts` — same approach against `qbo_cashflow_snapshots.raw_response`.
- `src/hooks/useFinServActiveClientsAtDate.ts` — reuses the existing stage-history reconstruction we already wrote, returns deal rows (id, name, owner, stage_entered_at, value).
- `src/hooks/useFinServClientMonthlySeries.ts` — bucket-aware monthly revenue per QBO customer (joins existing per-client revenue hook output).

New edge function for the transaction-level second drill:

- `supabase/functions/qbo-transactions-list` — verifies `auth.getUser()`, accepts `{ realm_id, account_id, start_date, end_date, customer_id? }`, proxies QBO `reports/TransactionList` (Accrual), returns normalized rows `{ txn_date, type, num, name, memo, amount, account }`. Deployed automatically; respects existing realm scoping for 5th Line.

## Wiring on the FinServ board

`FinServFinancialMetricsDashboard.tsx`:

- Wrap the dashboard return in `<DrilldownProvider>` so child charts get `useDrilldown()`.
- Replace today's narrow `openSinglePoint(...)` calls with the richer `open({ kind, period, granularity, payload })` calls. Each chart passes the bucket key it owns; the panel resolves the bucket's start/end via the parent `range`.
- Add `role="button"` + `aria-label="Drill into ${metric} for ${label}"` on each `<Bar>` / `<Line>` `onClick` handler via Recharts `accessibilityLayer` plus per-cell labels.

## Reuse on other boards

`ChartDrilldownPanel` + `DrilldownProvider` are board-agnostic. The QuickBooks Financial and Consolidated Debt Pipeline boards already render shared chart wrappers — they pick up the same drill behavior by:

1. Mounting `<DrilldownProvider>` at the board root.
2. Replacing their existing `openSinglePoint` callbacks with `open({ kind: 'pnl' | 'cashflow' | ... , ... })`.

That's a thin per-board change (no per-chart rewrite).

## Phasing

**Phase 1 (this iteration, ships end-to-end on FinServ board):**
- Shared `DrilldownProvider` + `ChartDrilldownPanel` (Sheet + focus trap + Esc).
- Hooks parsing `raw_response` from existing snapshots for P&L and Cashflow breakdowns (no new edge call).
- Active Clients + Avg Revenue + Revenue Change drilldowns using existing data.
- "View in QuickBooks" deep links for P&L and Cash Flow tiles.
- Every FinServ chart bar/line/cell becomes clickable and opens the right view.
- Keyboard + ARIA pass.

**Phase 2 (follow-up, only if you want the second-level transaction drill now):**
- `qbo-transactions-list` edge function + `PnlTransactionsView` (click an account row → modal table of transactions).
- Same drilldowns wired onto QuickBooks Financial and Consolidated Debt Pipeline boards.

Confirming you want both phases in one go, or ship Phase 1 first and then Phase 2? Phase 1 alone is the bigger UX win and avoids a QBO API round-trip on every drill.
