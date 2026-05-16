/**
 * Registry of KPI templates available from the "Add KPI" picker on the
 * Insights / Quarterly Insights Report. Templates are pre-configured KPIs
 * that auto-compute their values from live data sources (deals, pipeline,
 * QuickBooks) instead of requiring the user to enter actual/target numbers.
 *
 * Adding a new template:
 *   1. Add an id to KpiTemplateId.
 *   2. Add an entry to KPI_TEMPLATES below.
 *   3. Render its card in ReportKpisSection's switch.
 */
export type KpiTemplateId = 'sales-clients';

/** Status vocabulary already used elsewhere on the report. "Mixed" is
 *  reserved for a future multi-metric blended state but intentionally NOT
 *  emitted today (spec requirement). */
export type KpiTemplateStatus = 'On Track' | 'At Risk' | 'Mixed';

/** Generic per-template config blob persisted on the KPI record. */
export interface KpiTemplateConfigBase {
  /** Optional QBO realm ids the template should scope to. Today the
   *  Sales & Clients template does not filter deals by entity (deals
   *  table does not carry a QBO realm), but we persist the selection
   *  for forward compatibility with cross-entity dashboards. */
  entityIds?: string[];
  /** Optional reporting period override. When unset the template uses the
   *  report's current quarter. */
  reportingQuarter?: string;
  /** Optional comparison override. Today only 'prior-quarter' is supported. */
  comparison?: 'prior-quarter';
}

export interface SalesClientsConfig extends KpiTemplateConfigBase {
  /** Pipeline stage label that represents "moved into final credit items". */
  entryStageLabel: string;
  /** Underlying deals column representing signed commercial value.
   *  Locked to `deals.value` today — exposed in config so the field is
   *  auditable and can be swapped without a code change. */
  signedField: 'deals.value';
  /** Optional list of pipeline ids; when unset the active (default)
   *  pipeline for the company is used. */
  pipelineIds?: string[];
}

export interface KpiTemplateMeta {
  id: KpiTemplateId;
  label: string;
  /** Short bulleted description shown inside the template picker. */
  bullets: string[];
  /** Default KPI label inserted when the template is picked. */
  defaultTitle: string;
  /** Default config persisted with the inserted KPI. */
  defaultConfig: SalesClientsConfig;
}

export const KPI_TEMPLATES: KpiTemplateMeta[] = [
  {
    id: 'sales-clients',
    label: 'Sales & Clients',
    bullets: [
      "Tracks this quarter's new deals and dollars signed versus last quarter",
      'Uses active pipeline deals moved into Final Credit Items',
      'Auto-labels status as On Track or At Risk',
    ],
    defaultTitle: 'Sales & Clients',
    defaultConfig: {
      entryStageLabel: 'Final Credit Items',
      signedField: 'deals.value',
      comparison: 'prior-quarter',
    },
  },
];

/** Lookup helper. Returns null for unknown ids so the caller can fall back
 *  to the legacy custom KPI renderer. */
export function getKpiTemplate(id: string | undefined | null): KpiTemplateMeta | null {
  if (!id) return null;
  return KPI_TEMPLATES.find(t => t.id === id) ?? null;
}

/** Combine two per-metric directional results into the overall status.
 *  - both ≥ prior → On Track
 *  - any < prior  → At Risk
 *  ("Mixed" is reserved for the future; not emitted yet.) */
export function combineSalesClientsStatus(
  countOk: boolean,
  dollarsOk: boolean,
): Exclude<KpiTemplateStatus, 'Mixed'> {
  return countOk && dollarsOk ? 'On Track' : 'At Risk';
}