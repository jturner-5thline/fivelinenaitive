import { defineTool } from '@lovable.dev/mcp-js';
import { z } from 'zod';
import { requireAuth, supabaseForUser, textResult, errorResult } from '../supabase';
import { assertMasterPlanAccess, normalizeTargetUpdates, planPeriod } from '../masterPlan';

export default defineTool({
  name: 'upsert_master_plan_targets',
  title: 'Update Master Plan Financials and metric cells',
  description: 'Preview or save up to 500 Financials/KPI monthly or quarterly cells. Discover exact metric_key values with get_master_plan. Linked KPI rows update together as in the UI; null clears a cell. Percent values are percentage points (82 = 82%). Dry run defaults true; saving requires confirm=true after explicit approval. Persistent per-cell audit, atomic batch, 5th Line editors only. Does not rename rows or write derived Headcount.',
  inputSchema: { updates: z.array(z.object({ metric_key: z.string().max(160), period: planPeriod, value: z.number().finite().nullable() }).strict()).min(1).max(500), dry_run: z.boolean().default(true), confirm: z.boolean().default(false), change_reason: z.string().trim().min(1).max(1000).optional() },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ updates, dry_run, confirm, change_reason }, ctx) => {
    const authError = requireAuth(ctx); if (authError) return authError;
    if (!dry_run && !confirm) return errorResult('Explicit approval is required: set confirm=true to save');
    try {
      const normalized = normalizeTargetUpdates(updates.map(u => {
        if (!u.metric_key || !u.period || u.value === undefined) throw new Error('Cell key, period and value are required');
        return { metric_key: u.metric_key, period: u.period, value: u.value };
      }));
      const sb = supabaseForUser(ctx); await assertMasterPlanAccess(sb, true);
      const { data, error } = await sb.rpc('mcp_write_master_plan', { p_kind: 'targets', p_updates: normalized, p_dry_run: dry_run, p_confirm: confirm, p_reason: change_reason ?? null });
      if (error) return errorResult(error.message);
      return textResult(data, { requested_cells: updates.length, expanded_cells: normalized.length });
    } catch (e) { return errorResult(e instanceof Error ? e.message : 'Master Plan save failed'); }
  },
});