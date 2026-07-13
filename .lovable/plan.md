## Goal
Extend the Add Widgets pop-up so users can embed dashboard widgets **exactly as they appear** on their source dashboard (chart, table, or KPI card), in addition to the existing single-value KPI tiles.

## User-visible behavior

1. Add a **mode toggle** at the top of the Add Widgets dialog:
   - **KPI Tiles** (current behavior — single-value KPIs, templates, custom metrics)
   - **Dashboard Widgets** (new — pick charts/tables/cards rendered as-is)
2. In Dashboard Widgets mode, tiles are grouped by source dashboard, with a live thumbnail preview and a "Live · <dashboard name>" caption. Selection + "Add Selected" flow is identical.
3. Added widgets render in the report as **half-width by default**, and are resizable (small / half / full-width) via the existing widget edit controls. The embedded chart re-sizes to its container.
4. Narrative editor can also insert a dashboard-widget block inline (same picker).

## Technical design

### 1. New embeddable-widget registry
`src/components/metrics/dashboards/qir/dashboardWidgetRegistry.ts`
- Enumerates embeddable widgets as `{ id, label, dashboard, description, defaultWidth: 'half'|'full', render: (ctx) => ReactNode }`.
- `ctx` = `{ reportPeriod, entityFilter? }` so widgets pick up the report's timeframe.
- Curated first pass across the four dashboards the user picked; each entry re-uses the **existing chart/card component** from that dashboard (extracted into a small wrapper if it's currently inline):
  - **Debt Advisory Metrics** – stage funnel chart, 6 stage-entry stat cards, deal-size distribution.
  - **FinServ Financial Metrics** – Revenue/hour trendline, Profit/hour trendline, MRR chart, Active-client trend, Utilization gauge, Avg revenue/client bar.
  - **QuickBooks Revenue Reporting** – Revenue stacked bar (Debt vs FinServ), Revenue by entity donut.
  - **All metrics dashboards** – over time, expanded by adding entries here (registry is the single extension point).
- Widgets that don't yet have an extracted, embeddable component fall back to a "Coming soon" tile in the picker.

### 2. Add Widgets dialog — mode toggle
`AddKpiDialog.tsx`
- New prop `onPickDashboardWidget?: (id: string) => void`.
- Segmented control at the top of the header: KPI Tiles | Dashboard Widgets.
- Widget-mode gallery reuses the existing grouped grid + selection/footer, but renders a `DashboardWidgetPreviewTile` that mounts the widget's `render()` inside a scaled-down preview box.
- Search + source chips filter the widget registry when in widget mode.

### 3. Report state — new "dashboard-widget" item type
`QuarterlyInsightsReport.tsx`
- Extend the KPI-grid model with an optional `kind: 'kpi' | 'dashboardWidget'` and `dashboardWidgetId?: string` field (kept backward-compatible; default is `'kpi'`).
- New `addDashboardWidget(widgetId)` that appends a grid item with size = the widget's `defaultWidth`.
- When rendering the KPI grid: if `kind === 'dashboardWidget'`, look up the registry entry and render its component inside a resizable `SortableMetricWidget`-style card. Edit affordance = resize + remove (no label/actual/target inputs).

### 4. Narrative editor — new inline node
`src/components/insights/narrative/DashboardWidgetEmbedNode.tsx`
- TipTap node `dashboardWidgetEmbed` with attrs `{ widgetId, periodStart, periodEnd, periodLabel }`.
- Renders the registry component in a bordered block; read-only in preview, deletable in edit.
- Registered in `InsightsNarrativeEditor`.

### 5. Resize model
- Reuse existing `MetricWidgetSize` widths (`small` / `medium` / `large` / `full`) mapped to grid col-spans; expose a small size-picker on the widget's edit affordance.

## Out of scope for this pass
- Cross-report drill-downs from the embedded widget (widgets retain their intrinsic drill-downs where they already exist).
- Embedding heavy multi-tab dashboards (Executive, Weekly Rundown carousels) — those don't have a single canonical "widget" surface.
- Custom axis/filter overrides on the embedded widget (uses report timeframe only).

## Files touched
- `src/components/metrics/dashboards/qir/dashboardWidgetRegistry.ts` **(new)**
- `src/components/metrics/dashboards/qir/AddKpiDialog.tsx` (mode toggle + widget gallery)
- `src/components/metrics/dashboards/QuarterlyInsightsReport.tsx` (state + rendering)
- `src/components/insights/narrative/DashboardWidgetEmbedNode.tsx` **(new)**
- `src/components/insights/narrative/InsightsNarrativeEditor.tsx` (register node)
- Small extraction wrappers for a handful of dashboard charts so they're mountable outside their host dashboard.
