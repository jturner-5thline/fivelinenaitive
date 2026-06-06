/**
 * Insights metric registry — the single source of truth for which metrics
 * are eligible to appear in the KPI Templates picker.
 *
 * Rule: ANY metric on ANY Insights dashboard is eligible — including
 * chart-backed metrics. When the source is a chart, the report KPI
 * renders ONLY the resolved scalar (period total / latest point / top-1
 * aggregate) — never the chart itself.
 *
 * Sources combined here:
 *  - KPI_TEMPLATES — curated, fully-rendered template KPIs (recommended).
 *  - METRIC_WIDGET_DATA_SOURCES — every entry, scalar AND chart, grouped
 *    by the source dashboard it lives on.
 *  - Custom metrics — workspace-defined formulas via useCustomMetrics.
 */
import { METRIC_WIDGET_DATA_SOURCES } from '@/contexts/MetricsWidgetsContext';
import type { CustomMetricDefinition } from '@/lib/customMetricEngine';
import { KPI_TEMPLATES, type KpiTemplateMeta } from './kpiTemplates';

export type MetricFormatHint = 'currency' | 'percentage' | 'number';

export interface InsightsMetricOption {
  /** Stable id. For templates this is the template id; for data-sources it's
   *  the source id prefixed with `metric:`; for custom metrics `custom:<id>`. */
  id: string;
  /** What kind of pickable thing this is. */
  kind: 'template' | 'metric' | 'custom-metric';
  /** Human label shown in the picker and used as the default KPI title. */
  label: string;
  /** Short description shown under the label in the picker. */
  description?: string;
  /** Source area / dashboard the metric comes from. */
  source: string;
  /** Hint for formatting the KPI value when inserted. */
  format: MetricFormatHint;
  /** Whether the metric supports drilldown (templates always do). */
  supportsDrilldown: boolean;
  /** Pass-through for template picks. */
  template?: KpiTemplateMeta;
  /** Pass-through metric source id (matches METRIC_WIDGET_DATA_SOURCES.id). */
  metricSourceId?: string;
  /** Pass-through custom metric definition. */
  customMetricId?: string;
  /** True when the underlying widget is a chart. The KPI still renders a
   *  single scalar (resolved via the chart's data hook), never the chart. */
  derivedFromChart?: boolean;
  /** Human description of how the scalar is resolved from the chart series
   *  (e.g. "Period total", "Latest point", "Top contributor"). */
  resolution?: string;
}

export interface InsightsMetricGroup {
  /** Group heading shown in the picker. */
  source: string;
  options: InsightsMetricOption[];
}

/** Infer a KPI format hint from the metric id/label. */
function inferFormat(id: string, label: string): MetricFormatHint {
  const s = `${id} ${label}`.toLowerCase();
  if (/(rate|%|percent|ratio)/.test(s)) return 'percentage';
  if (/(revenue|value|fees|payments|amount|expenses|income|ar\b|ap\b|receivable|payable|estimate|credit memo|memos|size|per deal|spend|waterfall|forecast|aging|treemap|cumulative|qtd|ytd)/.test(s)) return 'currency';
  return 'number';
}

/** Explicit mapping of metric source id → the dashboard it lives on.
 *  Anything not listed falls back to a sensible default based on the id
 *  prefix. The dashboard names match the canonical source surfaces called
 *  out in spec (Weekly Rundown, Insights Dashboard, Revenue & Customers,
 *  Controller Dashboard, Sales Team Board, Sales & BD ROI, Consolidated
 *  Debt Pipeline Board, Rep Scorecard, FinServ Financial Metrics). */
const DASHBOARD_BY_METRIC_ID: Record<string, string> = {
  // Weekly Rundown (deal stats)
  'active-pipeline': 'Weekly Rundown',
  'closed-won': 'Weekly Rundown',
  'total-fees': 'Weekly Rundown',
  'avg-deal-size': 'Weekly Rundown',
  // Insights Dashboard (closed-value trend / cumulative)
  'closed-value-12m': 'Insights Dashboard',
  'closed-value-pop': 'Insights Dashboard',
  'ytd-cumulative': 'Insights Dashboard',
  'qtd-value': 'Insights Dashboard',
  'fees-pop': 'Insights Dashboard',
  // Consolidated Debt Pipeline Board (pipeline shape)
  'pipeline-by-stage': 'Consolidated Debt Pipeline Board',
  'pipeline-by-type': 'Consolidated Debt Pipeline Board',
  'pipeline-gauge': 'Consolidated Debt Pipeline Board',
  'pipeline-treemap': 'Consolidated Debt Pipeline Board',
  'stage-breakdown': 'Consolidated Debt Pipeline Board',
  'conversion-funnel': 'Consolidated Debt Pipeline Board',
  // Sales Team Board / Rep Scorecard
  'manager-performance': 'Sales Team Board',
  'performance-radar': 'Rep Scorecard',
  // Sales & BD ROI
  'deal-activity-12m': 'Sales & BD ROI',
  'activity-heatmap': 'Sales & BD ROI',
  'kpi-bullet': 'Sales & BD ROI',
  'revenue-waterfall': 'Sales & BD ROI',
  'revenue-forecast': 'Sales & BD ROI',
  // Controller Dashboard (default for qb-* stats not overridden below)
  // Revenue & Customers — QB charts about revenue mix / customers
  'qb-revenue-trend': 'Revenue & Customers',
  'qb-top-customers': 'Revenue & Customers',
  'qb-revenue-vs-payments': 'Revenue & Customers',
  'qb-revenue-vs-expenses': 'Revenue & Customers',
  // FinServ Financial Metrics — KPI tiles that mirror the FinServ surface
  'qb-total-revenue': 'FinServ Financial Metrics',
  'qb-net-income': 'FinServ Financial Metrics',
  'qb-total-expenses': 'FinServ Financial Metrics',
  'qb-collection-rate': 'FinServ Financial Metrics',
};

function sourceForDataSourceId(id: string): string {
  if (DASHBOARD_BY_METRIC_ID[id]) return DASHBOARD_BY_METRIC_ID[id];
  if (id.startsWith('hs-')) return 'HubSpot Dashboard';
  if (id.startsWith('xs-')) return 'Cross-source';
  if (id.startsWith('qb-')) return 'Controller Dashboard';
  return 'Insights Dashboard';
}

/** Human description of how a chart widget's scalar is resolved. */
function chartResolutionFor(id: string): string {
  if (/12m|trend|rolling/.test(id)) return 'Period total of trend series';
  if (/cumulative|ytd|qtd/.test(id)) return 'Latest cumulative point';
  if (/forecast/.test(id)) return 'Next-period projection';
  if (/top|customer|vendor|category|owner|source|by-/.test(id)) return 'Top contributor';
  if (/aging|status|methods/.test(id)) return 'Period total';
  if (/funnel|heatmap|activity/.test(id)) return 'Period count';
  if (/waterfall|vs-/.test(id)) return 'Net period value';
  if (/gauge|radar|treemap|stage|pop|bullet|manager/.test(id)) return 'Period aggregate';
  return 'Period aggregate';
}

/** Strip leading prefixes like "QB: " / "HS: " / "Cross: " from a label
 *  since the group header already conveys the source. */
function cleanLabel(label: string): string {
  return label.replace(/^(QB|HS|Cross):\s*/i, '');
}

/**
 * Build the full set of eligible KPI Template options.
 * @param customMetrics Optional list of user-defined custom metrics.
 */
export function buildInsightsMetricOptions(
  customMetrics: CustomMetricDefinition[] = [],
): InsightsMetricGroup[] {
  // 1. Curated templates (recommended — live data + drilldown).
  const templates: InsightsMetricOption[] = KPI_TEMPLATES.map(tpl => ({
    id: `template:${tpl.id}`,
    kind: 'template',
    label: tpl.label,
    description: tpl.bullets[0],
    source: 'Templates',
    format: 'number',
    supportsDrilldown: true,
    template: tpl,
  }));

  // 2. EVERY metric definition from the Insights data-source registry —
  //    scalar tiles AND charts. Chart-backed entries resolve to a single
  //    scalar via the chart's underlying data hook (no chart is ever
  //    rendered inside a report KPI).
  const metricSources: InsightsMetricOption[] = METRIC_WIDGET_DATA_SOURCES.map(ds => {
    const isChart = ds.type === 'chart';
    return {
      id: `metric:${ds.id}`,
      kind: 'metric' as const,
      label: cleanLabel(ds.label),
      description: isChart ? `Chart on ${sourceForDataSourceId(ds.id)} — shown as a single value` : undefined,
      source: sourceForDataSourceId(ds.id),
      format: inferFormat(ds.id, ds.label),
      supportsDrilldown: false,
      metricSourceId: ds.id,
      derivedFromChart: isChart,
      resolution: isChart ? chartResolutionFor(ds.id) : undefined,
    };
  });

  // 3. Workspace-defined custom metrics (always scalar).
  const custom: InsightsMetricOption[] = customMetrics.map(cm => ({
    id: `custom:${cm.id}`,
    kind: 'custom-metric' as const,
    label: cm.name,
    description: cm.description ?? undefined,
    source: 'Custom Metrics',
    format: cm.result_type === 'currency'
      ? 'currency'
      : cm.result_type === 'percentage'
        ? 'percentage'
        : 'number',
    supportsDrilldown: false,
    customMetricId: cm.id,
  }));

  // Group, preserving a stable display order (source dashboards listed
  // top-to-bottom in roughly the order users encounter them in Insights).
  const order = [
    'Templates',
    'Weekly Rundown',
    'Insights Dashboard',
    'Revenue & Customers',
    'Controller Dashboard',
    'FinServ Financial Metrics',
    'Sales Team Board',
    'Sales & BD ROI',
    'Consolidated Debt Pipeline Board',
    'Rep Scorecard',
    'HubSpot Dashboard',
    'Cross-source',
    'Custom Metrics',
  ];
  const all = [...templates, ...metricSources, ...custom];
  const grouped = new Map<string, InsightsMetricOption[]>();
  for (const opt of all) {
    const arr = grouped.get(opt.source) ?? [];
    arr.push(opt);
    grouped.set(opt.source, arr);
  }
  const known = new Set(order);
  const extras = [...grouped.keys()].filter(k => !known.has(k)).sort();
  return [...order, ...extras]
    .filter(s => grouped.has(s))
    .map(s => ({ source: s, options: grouped.get(s)!.sort((a, b) => a.label.localeCompare(b.label)) }));
}

/** Flatten all options into a single list (handy for search/filter). */
export function flattenInsightsMetricOptions(
  groups: InsightsMetricGroup[],
): InsightsMetricOption[] {
  return groups.flatMap(g => g.options);
}