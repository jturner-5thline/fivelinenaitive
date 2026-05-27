## Controller Dashboard — Scott follow-up

Scope: `/insights` Controller Dashboard only. No other dashboards or pages touched.

### 1. Revenue overstatement — switch to P&L "Total Income"

Root cause (verified in the DB):
- FinServ + Debt invoices sum to **$1.5M TTM** and **$612k YTD-2026**.
- FinServ-only TTM income = **$394.5k**, which matches Scott's "verified YTD $394,989" baseline.
- All Debt invoice line accounts ARE classified as Income in QBO, so the "filter non-revenue accounts" rule is a no-op for current data. The real driver is that Debt closing-fee invoices show in QBO P&L on **cash basis only when paid**, so accrual invoice-sum (the current calc) overstates recognized revenue.

Fix:
- New hook `useQBTotalIncomeSeries(period, granularity)` (in `src/hooks/useQBTotalIncomeSeries.ts`) that:
  - Reads stored `quickbooks_reports` rows of type `profit_and_loss` for the **3 active realms** (Debt, FinServ, Tech) intersecting the selected period.
  - Parses each report via the existing `parseQBProfitAndLoss` and sums `totalIncome` per realm.
  - Builds per-bucket revenue by selecting, for each bucket, the P&L report whose `period_start`/`period_end` matches the bucket; falls back to scaling the closest enclosing report by day-overlap when a bucket-precise report is not yet synced, and surfaces a small "Some buckets approximated — sync P&L for exact figures" hint.
  - On mount, fires a background `invoke('quickbooks-sync', { syncType: 'profit_and_loss', start_date, end_date })` for each missing (realm, bucket) pair so the next refresh is exact. Throttled (max 1 per realm per minute) to avoid hammering QBO.
- `useQuickBooksMetrics` gains a `revenueSource: 'invoices' | 'pl'` option. The Controller dashboard passes `'pl'`. Other consumers (Operations, FinServ board) keep the current `'invoices'` default — out of scope.
- `monthlyRevenue[].revenue` and the top-level `totalRevenue` are sourced from the new hook when `revenueSource === 'pl'`; `payments` continues to come from `quickbooks_payments` (unchanged — Scott already accepts payments-received as the cash-in figure).
- Acceptance: May-26 bar ≈ $32,200 once the May-only P&L sync completes; YTD-2026 total = ~$394k (FinServ + Debt + Tech P&L Total Income).

### 2. "Steven Adler" → company resolution + admin warning

Update `src/lib/qboClientName.ts`:
1. First-pass (new): given a QBO customer, look up `deals` rows joined via `qb_customer_id`/`qb_realm_id` (or by fuzzy customer-name match) and prefer `companies.name` of the linked company.
2. Existing pass: `customer.company_name`.
3. Existing pass: `customer.display_name`.
4. NEW final fallback: when the resolved label looks like a personal name (two-word, both Title-cased, no Inc/LLC/Corp/Ltd/Co token), bucket under **"Other / Individuals"** instead of leaking the personal name.

Person-name heuristic: `^\s*[A-Z][a-z]+(?:[- ][A-Z][a-z]+)?\s+[A-Z][a-z]+\s*$` and no company suffix tokens — kept conservative.

Wire-up:
- `useRevenueByClient` (Controller) prefetches the CRM `companies` ↔ QBO customer mapping and passes it into a new `resolveQboClientLabelEnriched({ customerName, customer, dealCompanyName })` so the same logic applies to FinServ and Debt charts plus the embedded QuickBooks Financial top-customers list.
- Add a small `QboUnlinkedCustomersWarning` card at the top of the Controller dashboard (collapsible) listing N customers that fell through to "Other / Individuals" with a deep link to `/contacts`, so the data hygiene is visible.

### 3. Quarterly / Yearly toggle — verify and complete

Current state: the toggle is already wired through `useQuickBooksMetrics(period, granularity)` and `buildBuckets`, but I'll re-verify and fix any gaps:
- Confirm `range.granularity` propagates to FinServ/Debt Revenue by Client → currently both ignore granularity (they aggregate the full period into a single bar per client). Acceptance language asks for re-bucketing, so I'll refactor both charts to a stacked layout when granularity ≠ "client-total": x-axis = bucket label, stacks = top-N clients, "Other" rollup. Keep the current single-bar mode when granularity is "off" (we'll keep the existing visualization as the default and add a small "Group by period" switch — defaults to off to preserve today's UX).
- Persist toggle + group-by-period switch via the existing `loadPersistedRange('controller-dashboard')` plus a new `localStorage` key for the per-board "group by period" boolean.
- KPI cards on the embedded `QuickBooksFinancialDashboard` already re-scope via `period`; verified — no code change needed beyond #1.
- X-axis labels: `buildBuckets` already emits `Q1 26` / `2026`. Will widen to `Q1 2026` / `2026` for clarity.

### Files

```text
src/hooks/useQBTotalIncomeSeries.ts            (new)
src/hooks/useQuickBooksMetrics.ts              (revenueSource option)
src/lib/qboClientName.ts                       (enriched resolver + "Other / Individuals")
src/components/metrics/dashboards/ControllerDashboard.tsx
  - revenueSource='pl'
  - enriched client resolver in useRevenueByClient
  - QboUnlinkedCustomersWarning card
  - widen quarterly/yearly axis labels
src/components/metrics/dashboards/QuickBooksFinancialDashboard.tsx
  - accept revenueSource prop, plumb through
src/lib/insightsTimeRange.ts                   (Q1 2026 / 2026 labels)
```

No DB migrations. No edge-function edits. No changes outside `/insights`.

### Verification

- Manual: refresh `/insights`, screenshot Revenue & Payments Trend (May-26 ≈ $32.2k), Total Revenue KPI (~$394k YTD), Debt Revenue by Client (no "Steven Adler" bar, "Other / Individuals" present), toggle Quarterly → Q1 26..Q2 26 buckets visible, refresh page and confirm toggle persists.
- Console log assertions added behind `VITE_DEBUG_CONTROLLER=true` so QA can audit the underlying P&L picks.
