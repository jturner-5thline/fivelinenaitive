# Variance vs. Performance-to-Plan toggle — Debt Advisory Metrics

Add a header-level toggle on the **Debt Advisory Metrics** dashboard (`ConsolidatedDebtPipelineDashboard.tsx`) that switches every KPI tile's delta chip between two comparison bases:

- **Variance** (default, existing behavior) — actual current period vs. actual prior period.
- **Performance to Plan** — actual current period vs. the plan value saved for that same period in the Master Plan popup, shown as signed # and %.

## UX

Two-tab pill in the dashboard header (next to timeframe / signed-mode controls):

```text
[ Variance | Performance to Plan ]
```

- Selected tab is persisted per user via `user_ui_preferences` (key: `debt-advisory:comparison-mode`) so it survives reloads and matches the pattern used by other dashboard toggles.
- When **Performance to Plan** is active:
  - Each KPI card's delta chip renders `▲ +$X (+Y%)` / `▼ −$X (−Y%)` vs. plan for the current period, tooltip: `vs Plan · {period label}`.
  - If no plan value exists for that widget/period, chip shows `— No plan` in muted tone and links (on click) to the Master Plan dialog with that widget row focused.
  - Plan values are formatted using the same `formatDiff` helper already used by the Variance chip so currency / number / percent stay consistent.

## Data

- New hook `useDebtAdvisoryPlanValues(period)` in `src/components/metrics/dashboards/qir/useDebtAdvisoryPlanValues.ts`.
  - Reads `insights_metric_targets` filtered by `company_id`, `metric_key IN (plan:consolidated-debt-pipeline:*, plan:sales-dashboard-v2:*)` (linked widgets), and `period_month = {resolvedPeriodKey}`.
  - Returns a `Map<widgetKey, { value: number; format: PlanWidgetFormat; source: 'consolidated-debt-pipeline' | 'sales-dashboard-v2' }>`.
  - Period resolution: month (`YYYY-MM`) when timeframe is monthly, quarter (`YYYY-Qn`) otherwise — same convention already used by the Master Plan writer.
  - React Query cache-key: `['debt-advisory-plan-values', companyId, periodKey]`, 30 s staleTime.

- New KPI-to-plan-widget map in the same hook file:

  ```ts
  export const DEBT_ADVISORY_KPI_TO_PLAN: Record<string, string> = {
    'total-revenue-opportunity': 'total-revenue-opportunity',
    'active-deals': 'active-deals',
    'deals-on-board-count': 'deals-on-board',
    'deals-on-board-value': 'deals-on-board-value',
    'deals-signed': 'deals-signed',
    'deals-closed': 'deals-closed',
    'nda-sent': 'nda-sent',
    'terms-issued': 'terms-issued',
    'in-due-diligence': 'in-due-diligence',
    'proposals-issued': 'proposals-issued',
    'proposal-to-signed-conversion': 'proposal-to-signed-conversion',
    'agreements-pending': 'agreements-pending',
    'closed-won-fees': 'closed-won-fees',
  };
  ```

  Any KPI tile without a mapping renders no plan chip (falls back to `— No plan`).

## Rendering changes

- Extend `MetricCardConfig` with an optional `planKey?: string` and a `comparisonMode: 'variance' | 'plan'` prop threaded from the dashboard-level state.
- `MetricKPICard` picks between the existing `delta` render (variance) and a new `planDelta` render (built from `actualNumericValue - planValue` and its `%` counterpart). No new visual primitives — reuses arrow / tone classes so both modes look identical.
- Every existing `MetricKPICard` call site in `ConsolidatedDebtPipelineDashboard.tsx` gets a `planKey` prop referencing the map above; the mode + plan-values map are consumed from a single `ComparisonModeContext` created in the dashboard root so we don't drill props through every subtree.

## Files touched

```text
src/components/metrics/dashboards/ConsolidatedDebtPipelineDashboard.tsx     (toggle, context, plan chip wiring on all MetricKPICard call sites)
src/components/metrics/dashboards/qir/useDebtAdvisoryPlanValues.ts          (new hook + KPI→plan-widget map)
src/components/metrics/dashboards/qir/ComparisonModeContext.tsx             (new context: mode + planValues map)
```

No schema changes — plan values already live in `insights_metric_targets` and are written by the existing Master Plan dialog.

## Out of scope

- No changes to trend charts (bar/line variance stays period-over-period only).
- No changes to other dashboards — the toggle is local to Debt Advisory Metrics.
- No plan editing UI changes — Master Plan popup remains the single place plans are entered.
