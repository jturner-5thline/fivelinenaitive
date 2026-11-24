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
    expect(buildMasterPlan([], [], undefined, 'both').tabs.map(t => t.key)).toEqual(['financials', 'entity-metrics', 'headcount', 'sales-dashboard', 'sales-bd-roi']);
    expect(masterPlanCatalog()[0].sections.flatMap(s => s.rows).filter(r => r.editable)).toHaveLength(28);
  });
  it('puts TTM rows on KPIs & Metrics by segment and Debt Advisory/FinServ on Sales Dashboard', () => {
    const cat = masterPlanCatalog();
    expect(cat[0].sections.flatMap(s => s.rows).filter(r => r.editable).some(r => r.key.startsWith('ttm-'))).toBe(false);
    const kpis = cat.find(t => t.key === 'entity-metrics')!;
    expect(kpis.sections.map(s => s.label)).toEqual(['Consolidated / Parent', 'FinServ', 'Debt Services', 'Tech']);
    expect(kpis.sections.flatMap(s => s.rows).filter(r => r.editable)).toHaveLength(17);
    expect(kpis.sections[0].rows.filter(r => r.editable)[0].metric_key).toBe('plan:financials:consolidated:ttm-avg-headcount');
    const sales = cat.find(t => t.key === 'sales-dashboard')!;
    expect(sales.sections.map(s => s.label)).toEqual(['FinServ', 'Debt Advisory']);
    expect(sales.sections.flatMap(s => s.rows)).toHaveLength(39);
  });
  it('reports conversion timing rows in months under their original keys', () => {
    const rows = masterPlanCatalog().find(t => t.key === 'sales-dashboard')!.sections.flatMap(s => s.rows).filter(r => r.key.startsWith('conv-days-'));
    expect(rows).toHaveLength(5);
    for (const r of rows) { expect(r).toMatchObject({ unit: 'months' }); expect(r.label).toContain('(months)'); expect(r.metric_key).toBe(`plan:consolidated-debt-pipeline:${r.key}`); }
    const saved = buildMasterPlan([{ metric_key: 'plan:consolidated-debt-pipeline:conv-days-proposal-engage', period_month: '2027-01', target_value: 1.5 }], [], 2027, 'monthly', 'sales-dashboard');
    expect(saved.tabs[0].sections.flatMap(s => s.rows).find(r => r.key === 'conv-days-proposal-engage')!.cells[0].value).toBe(1.5);
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
  it('writes Sales Dashboard KPIs only to their own row and preserves explicit null clears', () => {
    const updates = normalizeTargetUpdates([{ metric_key: 'plan:consolidated-debt-pipeline:deals-signed', period: '2028-Q2', value: null }]);
    expect(updates.map(u => u.metric_key)).toEqual(['plan:consolidated-debt-pipeline:deals-signed']);
    expect(updates.every(u => u.value === null && u.period === '2028-Q2')).toBe(true);
  });
  it('rejects old Sales Dashboard and unknown row keys', () => {
    expect(() => normalizeTargetUpdates([{ metric_key: 'plan:sales-dashboard-v2:deals-signed', period: '2027-01', value: 2 }])).toThrow('Unknown');
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
  it('validates periods, finite values, and headcount limits', () => {
    for (const p of ['2027-00','2027-13','2027-Q5','2025-12']) expect(planPeriod.safeParse(p).success).toBe(false);
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
describe('calculated TTM sum rows', () => {
  it('keeps all five sum rows in Financials only for every group, preserving KPI efficiency rows', () => {
    const tabs = buildMasterPlan([], [], 2027, 'monthly').tabs;
    const financials = tabs.find(t => t.key === 'financials');
    const kpis = tabs.find(t => t.key === 'entity-metrics');
    if (!financials || !kpis) throw new Error('Missing Master Plan tabs');
    const sumKeys = ['ttm-sum-revenue', 'ttm-sum-gross-margin', 'ttm-sum-total-opex', 'ttm-sum-total-expenses', 'ttm-sum-net-operating-income'];
    for (const group of ['consolidated', 'finserv', 'debt', 'tech']) {
      expect(financials.sections.find(s => s.key === group)?.rows.filter(r => r.key.startsWith('ttm-sum-')).map(r => r.key)).toEqual(sumKeys);
      const rows = kpis.sections.find(s => s.key === group)?.rows;
      expect(rows?.map(r => r.key)).toEqual([
        ...(group === 'consolidated' ? ['ttm-avg-headcount'] : []),
        'ttm-revenue-per-head', 'ttm-gross-profit-per-head', 'ttm-operating-profit-per-head', 'ttm-operating-cashflow-per-head',
      ]);
    }
  });
  it('are read-only, computed from 2026 inputs for Jan 2027, and reject writes', () => {
    const targets = Array.from({ length: 12 }, (_, i) => ({ metric_key: 'plan:financials:debt:revenue', period_month: `2026-${String(i + 1).padStart(2, '0')}`, target_value: 10 }));
    const fin = buildMasterPlan(targets, [], 2027, 'monthly').tabs.find(t => t.key === 'financials')!;
    const row = fin.sections.find(s => s.key === 'debt')!.rows.find(r => r.key === 'ttm-sum-revenue')!;
    expect(row.editable).toBe(false);
    expect(row.cells[0].value).toBe(110); // Feb-26..Jan-27 = 11 × 10
    expect(() => normalizeTargetUpdates([{ metric_key: 'plan:financials:debt:ttm-sum-revenue', period: '2027-01', value: 1 }])).toThrow(/calculated/);
  });
});
