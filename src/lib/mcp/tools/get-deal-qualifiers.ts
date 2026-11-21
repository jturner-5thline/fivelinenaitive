import { defineTool } from '@lovable.dev/mcp-js';
import { z } from 'zod';
import { requireAuth, supabaseForUser, textResult, errorResult } from '../supabase';
export default defineTool({
  name: 'get_deal_qualifiers', title: 'Get deal agreement qualifiers',
  description: 'Read the existing deal qualifier rows as one agreement record with numbered verbatim criteria, checkbox states, signed-company rule, all/any rule, min_required, groups, groups_logic, criterion group keys, source agreement and updated_at; returns null when absent.',
  inputSchema: { deal_id: z.string().uuid() },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ deal_id }, ctx) => {
    const denied = requireAuth(ctx); if (denied) return denied;
    const { data, error } = await supabaseForUser(ctx).rpc('get_deal_qualifiers_record', { p_deal_id: deal_id });
    return error ? errorResult(error.message) : textResult(data);
  },
});