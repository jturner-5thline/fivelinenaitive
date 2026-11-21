import { defineTool } from '@lovable.dev/mcp-js';
import { z } from 'zod';
import { feeFields } from '../../agreementTerms';
import { requireAuth, supabaseForUser, textResult, errorResult } from '../supabase';

export default defineTool({
  name: 'update_deal_fees', title: 'Update deal agreement fees',
  description: 'Partially update agreement fees, exclusivity and contract dates. Omitted fields are unchanged; null clears. Total and closing fees are derived and cannot be written. dry_run defaults true; writes require explicit user approval. Stale expected_updated_at returns conflict and current row. Changes and activity are audited atomically.',
  inputSchema: { deal_id: z.string().uuid(), ...feeFields, source: z.string().max(1000).default('mcp'), change_reason: z.string().max(2000).optional(), expected_updated_at: z.string().datetime({ offset: true }).optional(), dry_run: z.boolean().default(true) },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ deal_id, source, change_reason, expected_updated_at, dry_run, ...fields }, ctx) => {
    const denied = requireAuth(ctx); if (denied) return denied;
    const patch = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
    if (!Object.keys(patch).length) return errorResult('No fee fields supplied.');
    const { data, error } = await supabaseForUser(ctx).rpc('update_deal_fees', { p_deal_id: deal_id, p_patch: patch, p_source: source, p_change_reason: change_reason, p_expected_updated_at: expected_updated_at, p_dry_run: dry_run });
    return error ? errorResult(error.message) : textResult(data);
  },
});