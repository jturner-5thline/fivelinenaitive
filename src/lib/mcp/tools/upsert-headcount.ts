import { defineTool } from '@lovable.dev/mcp-js';
import { z } from 'zod';
import { HEADCOUNT_UNITS } from '@/lib/monthlyHeadcount';
import { requireAuth, supabaseForUser, textResult, errorResult } from '../supabase';
import { assertMasterPlanAccess, headcountMonth, headcountValue } from '../masterPlan';

export default defineTool({
  name: 'upsert_headcount',
  title: 'Update Master Plan monthly headcount',
  description: 'Preview or save monthly FTE values for Debt, FinServ, Tech and Parent using realm_id from get_master_plan. Null clears; fractional headcount supports two decimal places. Quarterly and annual averages and firm totals are calculated from monthly values and cannot be edited. Dry run defaults true; confirm=true requires explicit approval. Atomic, audited, 5th Line editors only.',
  inputSchema: { updates: z.array(z.object({ realm_id: z.enum([HEADCOUNT_UNITS[0].realmId, HEADCOUNT_UNITS[1].realmId, HEADCOUNT_UNITS[2].realmId, HEADCOUNT_UNITS[3].realmId]), month: headcountMonth, value: headcountValue }).strict()).min(1).max(96), dry_run: z.boolean().default(true), confirm: z.boolean().default(false), change_reason: z.string().trim().min(1).max(1000).optional() },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ updates, dry_run, confirm, change_reason }, ctx) => {
    const authError = requireAuth(ctx); if (authError) return authError;
    if (!dry_run && !confirm) return errorResult('Explicit approval is required: set confirm=true to save');
    if (new Set(updates.map(u => `${u.realm_id}|${u.month}`)).size !== updates.length) return errorResult('Duplicate headcount cells in batch');
    try {
      const sb = supabaseForUser(ctx); await assertMasterPlanAccess(sb, true);
      const { data, error } = await sb.rpc('mcp_write_master_plan', { p_kind: 'headcount', p_updates: updates, p_dry_run: dry_run, p_confirm: confirm, p_reason: change_reason ?? null });
      if (error) return errorResult(error.message);
      return textResult(data, {});
    } catch (e) { return errorResult(e instanceof Error ? e.message : 'Headcount save failed'); }
  },
});