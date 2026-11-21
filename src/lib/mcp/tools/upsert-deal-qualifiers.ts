import { defineTool } from '@lovable.dev/mcp-js';
import { z } from 'zod';
import { agreementSchema } from '../../agreementTerms';
import { requireAuth, supabaseForUser, textResult, errorResult } from '../supabase';
export default defineTool({
  name: 'upsert_deal_qualifiers', title: 'Replace deal agreement qualifiers',
  description: 'Atomically replace the entire agreement qualifier record and ordered criteria in the existing widget storage. Keep text verbatim. Include criterion id to preserve checkbox state when editing text; optional is_met checks/unchecks. Omitted agreement metadata clears it. Identical retries do not write or audit. dry_run defaults true; replacement/removal requires explicit approval. Stale expected_updated_at returns current record.',
  inputSchema: { deal_id: z.string().uuid(), ...agreementSchema.shape, source: z.string().max(1000).default('mcp'), change_reason: z.string().max(2000).optional(), expected_updated_at: z.string().datetime({ offset: true }).optional(), dry_run: z.boolean().default(true) },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ deal_id, source, change_reason, expected_updated_at, dry_run, ...record }, ctx) => {
    const denied = requireAuth(ctx); if (denied) return denied;
    const parsed = agreementSchema.safeParse(record);
    if (!parsed.success) return errorResult(parsed.error.message);
    const { data, error } = await supabaseForUser(ctx).rpc('upsert_deal_qualifiers_record', { p_deal_id: deal_id, p_record: parsed.data, p_source: source, p_change_reason: change_reason, p_expected_updated_at: expected_updated_at, p_dry_run: dry_run });
    if (error) return errorResult(error.message);
    // A no-op retry returns the same saved record, not only its diff envelope.
    if (data && typeof data === 'object' && !Array.isArray(data) && data.changed === false && data.conflict !== true) {
      return textResult({ ...data, record: data.current });
    }
    return textResult(data);
  },
});