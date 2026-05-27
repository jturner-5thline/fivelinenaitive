# Controller Dashboard fix sweep

The Controller Dashboard lives in `src/components/metrics/dashboards/ControllerDashboard.tsx` and embeds `QuickBooksFinancialDashboard.tsx`. Shared metrics flow through `src/hooks/useQuickBooksMetrics.ts`. I'll fix each item below, scoped strictly to those three files + the QBO hook layer.

## 1. Top Customers ranking — Enklu / i-Genie missing (real bug)

Root cause (confirmed in DB): `useQuickBooksMetrics` builds `customerById` keyed by `qb_id` only. Across the three QBO realms, `qb_id` collides — e.g. `qb_id=20` is `i-Genie.ai` in FinServ but `Vivid Robotics, Inc. (Mr Clayton Wood)` in Debt. The Debt customer overwrites the FinServ one in the map, so FinServ invoices for i-Genie/Enklu get bucketed under "Vivid Robotics" / "Engage Mobilize" and disappear from the top‑10. The aggregation also already pulls from all realms (the hook is called with `realmId = undefined`) — that part is fine.

Fix: key `customerById` by `\`${realm_id}:${qb_id}\`` and look up using `\`${inv.realm_id}:${inv.customer_id}\``. Apply the same realm‑scoped key to the customer count and to the `topCustomers` reducer. Verified against DB that this puts Enklu ($35.2k) and i-Genie ($33.2k) into the YTD top‑10.

## 2. Revenue & Payments — May discrepancy

The earlier ETL fix (timezone bucketing by `yyyy-MM` prefix) is already live in `useQuickBooksMetrics.ts` lines 105–113. After fix #1 lands, re-verify in the preview that May‑26 reads ~$32k. If still off, the issue is upstream sync — flag for QBO ETL, no further code change here.

## 3. Debt Revenue by Client — person names instead of companies

`ControllerDashboard.useRevenueByClient` already resolves via `company_name → display_name`. The remaining person‑named rows come from Debt QBO customers where `company_name` is genuinely NULL (e.g. "Steven Adler"). There is no `deal_id`/`company_id` column on `quickbooks_customers`, so a robust cross-table join is out of scope for this pass.

Pragmatic fix: build a name‑match fallback against the deals/companies tables by `email` → `companies.primary_contact_email`, then by fuzzy display_name → `companies.name`. Use the resolved company name when found; otherwise keep the current label and tag the data‑quality export so finance can backfill in QBO. Apply the same resolver to FinServ.

## 4. Data labels on charts

Add a small `<LabelList>` (recharts) to: FinServ Revenue by Client, Debt Revenue by Client, Revenue & Payments Trend, A/R Aging, Top Customers by Revenue. Format via the existing `formatCurrency` (`$Xk` / `$X.XM`). Color `hsl(var(--muted-foreground))`, 10px. Only render labels for bars in the top 80th percentile of the dataset to avoid overlap.

Add a `Show data labels` `Switch` next to `InsightsTimeRangeSelector` in `ControllerDashboard`. Persist via `useLocalStorageState('controller-dashboard:data-labels', true)`. Pipe the boolean into `QuickBooksFinancialDashboard` as a new prop.

## 5. Quarterly/Yearly toggle does nothing for the embedded panel

`InsightsTimeRangeSelector` already persists `granularity` and updates `range.resolved.start/end`. The QBO trend chart however always renders 1‑month buckets (`subMonths` loop in `useQuickBooksMetrics.ts`). Re‑bucket `monthlyRevenue` based on `granularity`:

- `monthly` → existing behavior
- `quarterly` → bucket by `yyyy-Qn`, label `"Q1 2026"`
- `yearly` → bucket by `yyyy`, label `"2026"`

Plumb `granularity` from `ControllerDashboard` → `QuickBooksFinancialDashboard` → `useQuickBooksMetrics`. KPI cards already recompute correctly because they sum over `periodInvoices` (period‑filtered). Range/granularity already persist via `loadPersistedRange`.

## 6. Consolidate QBO widgets into Controller view

`QuickBooksFinancialDashboard` is already embedded at the bottom of `ControllerDashboard` (line 511). No standalone route currently surfaces it elsewhere — `grep` confirms only the controller imports it. So requirement #6 is already satisfied. I'll add an explicit section header `"QuickBooks Financials"` (already present) and confirm no duplicate widgets exist in sibling dashboards.

## Technical details

Files I'll touch:
- `src/hooks/useQuickBooksMetrics.ts` — realm‑scoped customer map; granularity‑aware bucketing; accept `granularity?: 'monthly'|'quarterly'|'yearly'`.
- `src/components/metrics/dashboards/QuickBooksFinancialDashboard.tsx` — `<LabelList>` on bars; accept `showDataLabels` + `granularity` props; pass to hook.
- `src/components/metrics/dashboards/ControllerDashboard.tsx` — `<Switch>` for data labels, persist in `localStorage`; `<LabelList>` on FinServ/Debt revenue + currency tooltip already in place; pass `granularity` + `showDataLabels` to embedded `QuickBooksFinancialDashboard`.
- (optional, only if #3 needs cross-table resolution) `src/lib/qboClientName.ts` — add `resolveQboClientLabelWithCrm(...)` accepting a Map<email|name, companyName>.

No new libs, no other dashboards touched.

## Verification

After merge, on `/insights → Controller`:
- Top Customers shows Enklu + i-Genie in YTD top‑10
- May‑26 bar ≈ $32k (Total Revenue YTD ≈ $394k)
- Quarterly toggle re‑buckets the trend chart to Q1/Q2/Q3/Q4 labels
- `$Xk` labels render on bars; toggle hides them and persists across reloads
- Debt chart x‑axis shows company names where available; remaining person names appear only when the underlying QBO customer truly has no company set
