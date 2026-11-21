import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@lovable.dev/mcp-js', () => ({ defineTool: (t: unknown) => t }));
vi.mock('../supabase', () => ({ requireAuth: vi.fn(() => null), supabaseForUser: vi.fn(), textResult: (data: unknown) => data, errorResult: (message: string) => ({ isError: true, message }) }));
import feeTool from '../tools/update-deal-fees';
import getTool from '../tools/get-deal-qualifiers';
import upsertTool from '../tools/upsert-deal-qualifiers';
import { requireAuth, supabaseForUser } from '../supabase';
const rpc = vi.fn();
const feeDefaults = { retainer_fee: undefined, milestone_fee: undefined, success_fee_percent: undefined, success_fee_minimum: undefined, exclusivity: undefined, contract_start_date: undefined, contract_end_date: undefined, change_reason: undefined, expected_updated_at: undefined };
const qualifierDefaults = { source_file_id: null, source_file_url: null, agreement_signed_date: null, notes: null, change_reason: undefined, expected_updated_at: undefined };
const id = '11111111-1111-4111-8111-111111111111';
beforeEach(() => { vi.clearAllMocks(); rpc.mockResolvedValue({ data: { changed: true }, error: null }); vi.mocked(supabaseForUser).mockReturnValue({ rpc } as unknown as ReturnType<typeof supabaseForUser>); });
describe('agreement tools', () => {
  it('defaults writes to preview', () => {
    expect(feeTool.inputSchema.dry_run.parse(undefined)).toBe(true);
    expect(upsertTool.inputSchema.dry_run.parse(undefined)).toBe(true);
  });
  it('forwards only passed fee fields, preserving null clears and concurrency', async () => {
    const input = { ...feeDefaults, deal_id: id, success_fee_minimum: null, source: 'agreement', change_reason: 'Signed terms', expected_updated_at: '2026-11-21T00:00:00Z', dry_run: true };
    await feeTool.handler(input, {} as Parameters<typeof feeTool.handler>[1]);
    expect(rpc).toHaveBeenCalledWith('update_deal_fees', { p_deal_id: id, p_patch: { success_fee_minimum: null }, p_source: 'agreement', p_change_reason: 'Signed terms', p_expected_updated_at: input.expected_updated_at, p_dry_run: true });
  });
  it('returns current data on concurrency conflict', async () => {
    rpc.mockResolvedValueOnce({ data: { conflict: true, current: { retainer_fee: 99 } }, error: null });
    expect(await feeTool.handler({ ...feeDefaults, deal_id: id, retainer_fee: 100, source: 'mcp', dry_run: false }, {} as Parameters<typeof feeTool.handler>[1])).toEqual({ conflict: true, current: { retainer_fee: 99 } });
  });
  it('reads null when no qualifiers exist', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await getTool.handler({ deal_id: id }, {} as Parameters<typeof getTool.handler>[1])).toBeNull();
  });
  it('replaces the full record through one atomic call', async () => {
    await upsertTool.handler({ ...qualifierDefaults, deal_id: id, executed_qualifies: false, match_rule: 'any', criteria: [{ id: undefined, position: 0, text: ' Verbatim ', is_met: true, metric: null, operator: null, value: null, unit: null }], source: 'mcp', dry_run: false }, {} as Parameters<typeof upsertTool.handler>[1]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_deal_id: id, p_dry_run: false, p_record: { executed_qualifies: false, match_rule: 'any', criteria: [{ text: ' Verbatim ', is_met: true }], source_file_url: null } });
  });
  it('does not query or write for an unauthenticated caller', async () => {
    vi.mocked(requireAuth).mockReturnValueOnce({ content: [], isError: true });
    await getTool.handler({ deal_id: id }, {} as Parameters<typeof getTool.handler>[1]);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('reports permission failures instead of a successful write', async () => {
    rpc.mockResolvedValueOnce({ error: { message: 'access denied' }, data: null });
    expect(await feeTool.handler({ ...feeDefaults, deal_id: id, retainer_fee: 100, source: 'mcp', dry_run: false }, {} as Parameters<typeof feeTool.handler>[1])).toEqual({ isError: true, message: 'access denied' });
  });
  it('returns the saved qualifier record on an identical no-op retry', async () => {
    rpc.mockResolvedValueOnce({ data: { changed: false, current: { criteria: [], executed_qualifies: false } }, error: null });
    expect(await upsertTool.handler({ ...qualifierDefaults, deal_id: id, executed_qualifies: false, match_rule: 'all', criteria: [], source: 'mcp', dry_run: false }, {} as Parameters<typeof upsertTool.handler>[1])).toMatchObject({ changed: false, record: { criteria: [], executed_qualifies: false } });
  });
});