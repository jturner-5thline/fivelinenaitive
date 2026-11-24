import { defineTool } from '@lovable.dev/mcp-js';
import { z } from 'zod';
import { requireAuth, supabaseForUser, textResult, errorResult } from '../supabase';
import { assertMasterPlanAccess, buildMasterPlan, HEADCOUNT_COMPANY_ID, type PlanTarget, type HeadcountRecord } from '../masterPlan';

export default defineTool({
  name: 'get_master_plan',
  title: 'Read the complete Master Plan spreadsheet',
  description: 'Rows with unit="months" (Debt Advisory Conversion Timing) hold month values. Read saved Financials, KPIs & Metrics, Sales Dashboard, Sales & BD ROI and Headcount cells, exact row titles, linked metric keys, formats, monthly and quarterly columns. Row titles are code-defined and read-only; quarterly headcount and totals are derived. 5th Line workspace only; unsaved browser drafts are not available.',
  inputSchema: { tab: z.string().max(80).optional().describe('Omit or all for every tab; financials, kpis (entity-metrics), headcount, sales-dashboard-v2, sales-bd-roi.'), year: z.union([z.literal(2027), z.literal(2028)]).optional(), period_type: z.enum(['monthly', 'quarterly', 'both']).default('both') },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ tab, year, period_type }, ctx) => {
    const authError = requireAuth(ctx); if (authError) return authError;
    try {
      const sb = supabaseForUser(ctx);
      await assertMasterPlanAccess(sb);
      const targets: PlanTarget[] = [];
      // Supabase caps each page; this is a bounded two-year read, never a truncated 1,000-row response.
      for (let offset = 0; offset < 10000; offset += 500) {
        const query = sb.from('insights_metric_targets').select('metric_key,period_month,target_value,updated_at').eq('company_id', HEADCOUNT_COMPANY_ID).like('metric_key', 'plan:%').gte('period_month', `${year ?? 2027}-01`).lt('period_month', `${year ? year + 1 : 2029}-01`).order('metric_key').order('period_month').range(offset, offset + 499);
        const { data, error } = await query;
        if (error) throw new Error(error.message);
        targets.push(...(data ?? []));
        if ((data?.length ?? 0) < 500) break;
        if (offset === 9500) throw new Error('Master Plan read exceeded its bounded page limit');
      }
      const { data: hc, error } = await sb.from('monthly_entity_headcount').select('realm_id,month,headcount').eq('company_id', HEADCOUNT_COMPANY_ID).gte('month', `${year ?? 2027}-01-01`).lt('month', `${year ? year + 1 : 2029}-01-01`);
      if (error) throw new Error(error.message);
      const result = buildMasterPlan(targets, (hc ?? []) as HeadcountRecord[], year, period_type, tab);
      return textResult(result, result);
    } catch (e) { return errorResult(e instanceof Error ? e.message : 'Master Plan read failed'); }
  },
});