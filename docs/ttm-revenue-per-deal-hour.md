# Financial Performance: TTM revenue per deal hour

- Numerator: full QuickBooks invoice `total_amt` for Capital Advisors, dated by `txn_date`, independent of collection/balance.
- Denominator: signed sum of `weekly_time_entries.hours`, dated by `week_start_date`, for the current 5th Line company's Active Pipeline and In Development deals. Closed deals remain eligible if currently assigned to these pipelines. Global test-deal exclusions apply; Censys is not excluded from this metric.
- Each TTM window spans 12 complete calendar months through its month/quarter end, inclusive. Header `useInsightsTimeframe` supplies the anchor. Quarter selection shows four quarter-end rolling TTM bars; month selection shows twelve month-end rolling TTM bars. Rolling/custom presets use their ending month as the anchor.
- All invoice/hour queries are read-only, authenticated, stably ordered and paginated in 500-row pages. Errors cannot produce partial successful totals. No sync, notifications, communications or record mutations are introduced.
- Zero/nonpositive hours yield an unavailable rate, not infinity. The chart, headline, tooltip and selected-bar drilldown use the same calculated period object. A hidden prior period supplies the first visible bar's comparison.
- The shared Insights drilldown drawer is reused rather than altering the legacy Revenue per Hour popup, which remains unrelated to this new chart.

## Verification

- 17 Vitest tests passed across calculation, hook and chart-interaction files, including boundaries, leap year, entity scope, tenant denial, both pipelines, test exclusions, adjustments, paging beyond 500 and later-page failure.
- New files pass ESLint. The affected dashboard has two existing hook warnings and no lint errors. Automatic preview build passed; manual build/typecheck was not run.
- Authenticated preview checked at 1280x1800 and 390x844: four quarter bars, twelve month controls, bar/period/headline drilldowns, matching period dates, close/reopen and refresh.
- Q3 2026 totals independently read from the database: $697,750 revenue, 347.30 hours, rounded $2,009/hour; exact revenue and hours appeared in the drilldown.
- No browser page errors or failed invoice/time-entry requests observed. No live records changed or communications sent. Published application remains unverified; publishing is needed to release the frontend.