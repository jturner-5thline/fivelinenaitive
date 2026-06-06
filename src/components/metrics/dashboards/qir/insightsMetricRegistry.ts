/**
 * Insights metric registry — the single source of truth for which metrics
 * are eligible to appear in the KPI Templates picker.
 *
 * Rule: anything that is a scalar metric anywhere in Insights dashboards
 * (Dashboard, Forecasts, Key Metrics, JT/JM/SW, QuickBooks, HubSpot, cross-
 * source) is eligible. Charts/visualizations are excluded.
 *
 * Sources combined here:
 *  - KPI_TEMPLATES — curated, fully-rendered template KPIs (recommended).
 *  - METRIC_WIDGET_DATA_SOURCES — every entry with `type: 'stat'` is a
 *    reusable Insights metric definition (KPI cards, sums, ratios, %, etc.).
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
  if (/(revenue|value|fees|payments|amount|expenses|income|ar\b|ap\b|receivable|payable|estimate|credit memo|memos|size|per deal)/.test(s)) return 'currency';
  return 'number';
}

/** Map data-source id to its human-readable source area. */
function sourceForDataSourceId(id: string): string {
  if (id.startsWith('qb-')) return 'QuickBooks';
  if (id.startsWith('hs-')) return 'HubSpot';
  if (id.startsWith('xs-')) return 'Cross-source';
  return 'Pipeline & Deals';
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

  // 2. All stat-type metric definitions from the Insights data-source registry.
  //    Charts are intentionally excluded (the picker is metrics-only).
  const metricSources: InsightsMetricOption[] = METRIC_WIDGET_DATA_SOURCES
    .filter(ds => ds.type === 'stat')
    .map(ds => ({
      id: `metric:${ds.id}`,
      kind: 'metric' as const,
      label: cleanLabel(ds.label),
      description: undefined,
      source: sourceForDataSourceId(ds.id),
      format: inferFormat(ds.id, ds.label),
      supportsDrilldown: false,
      metricSourceId: ds.id,
    }));

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

  // Group, preserving a stable display order.
  const order = ['Templates', 'Pipeline & Deals', 'QuickBooks', 'HubSpot', 'Cross-source', 'Custom Metrics'];
  const all = [...templates, ...metricSources, ...custom];
  const grouped = new Map<string, InsightsMetricOption[]>();
  for (const opt of all) {
    const arr = grouped.get(opt.source) ?? [];
    arr.push(opt);
    grouped.set(opt.source, arr);
  }
  return order
    .filter(s => grouped.has(s))
    .map(s => ({ source: s, options: grouped.get(s)!.sort((a, b) => a.label.localeCompare(b.label)) }));
}

/** Flatten all options into a single list (handy for search/filter). */
export function flattenInsightsMetricOptions(
  groups: InsightsMetricGroup[],
): InsightsMetricOption[] {
  return groups.flatMap(g => g.options);
}