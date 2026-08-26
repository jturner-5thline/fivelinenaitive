---
name: Sales & BD lives inside Insights
description: Sales & BD is an Insights dashboard (id sales-bd-page), not a standalone /sales-bd page
type: feature
---
Sales & BD was converted from the standalone `/sales-bd` route into an Insights dashboard.

- Component: `src/components/metrics/dashboards/SalesBdDashboard.tsx` (same widgets as the old page; page chrome removed, controls in a right-aligned toolbar).
- Registered as `sales-bd-page` / "Sales & BD" in `src/config/insightsDashboards.ts`, `src/pages/Insights.tsx` (Sales & BD folder, first entry) and `src/lib/mcp/insights.ts`.
- `/sales-bd` now redirects to `/insights?dashboard=sales-bd-page`; sidebar flyout and global search point there. `src/pages/SalesBD.tsx` was deleted.
