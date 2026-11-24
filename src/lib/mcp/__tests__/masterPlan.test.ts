import { describe, expect, it, vi, beforeEach } from 'vitest';
vi.mock('@lovable.dev/mcp-js', () => ({ defineTool: (t: unknown) => t }));
vi.mock('../supabase', () => ({ requireAuth: vi.fn(() => null), supabaseForUser: vi.fn(), textResult: (data: unknown) => data, errorResult: (message: string) => ({ isError: true, message }) }));
import { assertMasterPlanAccess, buildMasterPlan, masterPlanCatalog, normalizeTargetUpdates, planPeriod, headcountMonth, headcountValue, HEADCOUNT_COMPANY_ID } from '../masterPlan';
import targetTool from '../tools/upsert-master-plan-targets';
import hcTool from '../tools/upsert-headcount';
import readTool from '../tools/get-master-plan';
import { requireAuth, supabaseForUser } from '../supabase';
import { HEADCOUNT_UNITS } from '@/lib/monthlyHeadcount';

const rpc = vi.fn();
const member = vi.fn();
const user = vi.fn();
function client() {
  const q = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: member };
  return { from: vi.fn(() => q), auth: { getUser: user }, rpc } as unknown as ReturnType<typeof supabaseForUser>;
}
const ctx = {} as Parameters<typeof targetTool.handler>[1];
const target = { metric_key: 'plan:financials:finserv:revenue', period: '2027-01', value: 125000 };
beforeEach(() => {
  vi.clearAllMocks(); member.mockResolvedValue({ data: { company_id: HEADCOUNT_COMPANY_ID }, error: null });
  user.mockResolvedValue({ data: { user: { id: 'user', email: 'jturner@5thline.co' } }, error: null });
  rpc.mockResolvedValue({ data: { updated: 1 }, error: null });
  vi.mocked(supabaseForUser).mockReturnValue(client());
});
describe('Master Plan catalog and calculations', () => {
  it('covers all five current tabs, without an All or hidden dashboard tab', () => {
    expect(buildMasterPlan([], [], undefined, 'both').tabs.map(t => t.key)).toEqual(['financials', 'entity-metrics', 'headcount', 'sales-dashboard-v2', 'sales-bd-roi']);
    expect(masterPlanCatalog()[0].sections.flatMap(s => s.rows)).toHaveLength(45);
  });
  it('keeps monthly and quarterly figures separate and returns blanks as null', () => {
    const result = buildMasterPlan([{ metric_key: target.metric_key, period_month: '2027-01', target_value: 125000 }, { metric_key: target.metric_key, period_month: '2027-Q1', target_value: 450000 }], [], 2027, 'both', 'financials');
    const row = result.tabs[0].sections[1].rows[0];
    expect(row.cells.find(c => c.period === '2027-01')?.value).toBe(125000);
    expect(row.cells.find(c => c.period === '2027-Q1')?.value).toBe(450000);
    expect(row.cells.find(c => c.period === '2027-02')?.value).toBeNull();
    expect(result.tabs[0].columns[0].label).toBe('Jan-27');
    expect(result.row_titles_editable).toBe(false);
  });
  it('fans linked KPI writes out to each dashboard and preserves explicit null clears', () => {
    const updates = normalizeTargetUpdates([{ metric_key: 'plan:consolidated-debt-pipeline:deals-signed', period: '2028-Q2', value: null }]);
    expect(updates.map(u => u.metric_key)).toEqual(['plan:sales-dashboard-v2:deals-signed', 'plan:consolidated-debt-pipeline:deals-signed']);
    expect(updates.every(u => u.value === null && u.period === '2028-Q2')).toBe(true);
  });
  it('rejects conflicting linked updates and unknown row keys', () => {
    expect(() => normalizeTargetUpdates([{ metric_key: 'plan:consolidated-debt-pipeline:deals-signed', period: '2027-01', value: 1 }, { metric_key: 'plan:sales-dashboard-v2:deals-signed', period: '2027-01', value: 2 }])).toThrow('Conflicting');
    expect(() => normalizeTargetUpdates([{ ...target, metric_key: 'plan:financials:finserv:made-up' }])).toThrow('Unknown');
  });
  it('derives Headcount quarters from entered months and deducts the firm duplicate', () => {
    const hc = [{ realm_id: HEADCOUNT_UNITS[0].realmId, month: '2027-01-01', headcount: 3 }, { realm_id: HEADCOUNT_UNITS[0].realmId, month: '2027-02-01', headcount: 5 }, { realm_id: HEADCOUNT_UNITS[1].realmId, month: '2027-01-01', headcount: 2 }];
    const tab = buildMasterPlan([], hc, 2027, 'both', 'headcount').tabs[0];
    const rows = tab.sections[0].rows;
    expect(rows[0].cells.find(c => c.period === '2027-Q1')).toMatchObject({ value: 4, editable: false });
    expect(rows[4].cells.find(c => c.period === '2027-01')).toMatchObject({ value: 4, editable: false });
    expect(rows[0].cells.find(c => c.period === '2027-03')?.value).toBeNull();
  });
  it('exposes stored linked conflicts rather than concealing them', () => {
    const tab = buildMasterPlan([{ metric_key: 'plan:consolidated-debt-pipeline:deals-signed', period_month: '2027-01', target_value: 1 }, { metric_key: 'plan:sales-dashboard-v2:deals-signed', period_month: '2027-01', target_value: 2 }], [], 2027, 'monthly', 'kpis').tabs[0];
    const row = tab.sections.flatMap(s => s.rows).find(r => r.metric_keys?.includes?.('plan:consolidated-debt-pipeline:deals-signed') || r.label === 'Deals Signed')!;
    expect(row.cells[0]).toMatchObject({ value: 1, linked_value_conflict: true });
  });
  it('validates periods, finite values, and headcount limits', () => {
    for (const p of ['2027-00','2027-13','2027-Q5','2026-01']) expect(planPeriod.safeParse(p).success).toBe(false);
    expect(headcountMonth.safeParse('2027-Q1').success).toBe(false);
    for (const v of [-1, 10000, 1.234, Infinity]) expect(headcountValue.safeParse(v).success).toBe(false);
    expect(headcountValue.parse(9999.99)).toBe(9999.99);
    expect(headcountValue.parse(null)).toBeNull();
  });
});
describe('Master Plan tool safety', () => {
  it('reads every page instead of truncating the target table at one page', async () => {
    const ranges = vi.fn().mockResolvedValueOnce({ data: Array.from({ length: 500 }, (_, i) => ({ metric_key: `legacy:${i}`, period_month: '2027-01', target_value: i })), error: null }).mockResolvedValueOnce({ data: [{ metric_key: target.metric_key, period_month: '2027-01', target_value: 125000 }], error: null });
    const targets = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), like: vi.fn().mockReturnThis(), gte: vi.fn().mockReturnThis(), lt: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range: ranges };
    const hc = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), gte: vi.fn().mockReturnThis(), lt: vi.fn().mockResolvedValue({ data: [], error: null }) };
    const sb = { auth: { getUser: user }, from: vi.fn((table: string) => table === 'insights_metric_targets' ? targets : table === 'monthly_entity_headcount' ? hc : { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: member }) }) }) }) } as unknown as ReturnType<typeof supabaseForUser>;
    vi.mocked(supabaseForUser).mockReturnValue(sb);
    const result = await readTool.handler({ tab: 'financials', year: 2027, period_type: 'monthly' }, ctx);
    expect(ranges.mock.calls).toEqual([[0, 499], [500, 999]]);
    if (!result || typeof result !== 'object' || !('tabs' in result)) throw new Error('Expected Master Plan tabs');
    const tabs = result.tabs as ReturnType<typeof buildMasterPlan>['tabs'];
    expect(tabs[0].sections[1].rows[0].cells[0].value).toBe(125000);
  });
  it('defaults both write tools to dry-run and no approval', () => {
    expect(targetTool.inputSchema.dry_run.parse(undefined)).toBe(true);
    expect(hcTool.inputSchema.dry_run.parse(undefined)).toBe(true);
    expect(targetTool.inputSchema.confirm.parse(undefined)).toBe(false);
  });
  it('requires explicit confirmation before a real write', async () => {
    expect(await targetTool.handler({ updates: [target], dry_run: false, confirm: false, change_reason: undefined }, ctx)).toMatchObject({ isError: true });
    expect(rpc).not.toHaveBeenCalled();
  });
  it('forwards canonical labels, dates and nulls into one atomic RPC', async () => {
    await targetTool.handler({ updates: [{ ...target, value: null }], dry_run: true, confirm: false, change_reason: 'Preview' }, ctx);
    expect(rpc).toHaveBeenCalledWith('mcp_write_master_plan', { p_kind: 'targets', p_updates: [{ ...target, value: null, metric_label: 'Financials · FinServ · Revenue' }], p_dry_run: true, p_confirm: false, p_reason: 'Preview' });
  });
  it('rejects anonymous calls before any client or data access', async () => {
    vi.mocked(requireAuth).mockReturnValueOnce({ content: [], isError: true });
    await readTool.handler({ tab: undefined, year: undefined, period_type: 'both' }, ctx);
    expect(supabaseForUser).not.toHaveBeenCalled();
  });
  it('rejects other-workspace callers, including allowlisted emails', async () => {
    member.mockResolvedValueOnce({ data: null, error: null });
    await expect(assertMasterPlanAccess(client(), true)).rejects.toThrow('membership');
    expect(rpc).not.toHaveBeenCalled();
  });
  it('allows member reads but denies writes for non-editors', async () => {
    user.mockResolvedValue({ data: { user: { id: 'user', email: 'member@5thline.co' } }, error: null });
    await expect(assertMasterPlanAccess(client())).resolves.toBeUndefined();
    await expect(assertMasterPlanAccess(client(), true)).rejects.toThrow('editor access');
  });
  it('does not conceal database failures', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Audit insert denied' } });
    expect(await targetTool.handler({ updates: [target], dry_run: false, confirm: true, change_reason: undefined }, ctx)).toEqual({ isError: true, message: 'Audit insert denied' });
  });
  it('preserves monthly headcount null clears and rejects duplicate cells', async () => {
    const input = { updates: [{ realm_id: HEADCOUNT_UNITS[0].realmId, month: '2027-02', value: null }], dry_run: true, confirm: false, change_reason: undefined };
    await hcTool.handler(input, ctx);
    expect(rpc).toHaveBeenCalledWith('mcp_write_master_plan', expect.objectContaining({ p_updates: input.updates, p_kind: 'headcount' }));
    rpc.mockClear();
    expect(await hcTool.handler({ ...input, updates: [...input.updates, ...input.updates] }, ctx)).toMatchObject({ isError: true });
    expect(rpc).not.toHaveBeenCalled();
  });
});