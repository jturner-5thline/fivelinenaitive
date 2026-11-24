import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { masterPlanCatalog } from '../masterPlan';

// The save RPC validates keys in SQL; every row get_master_plan offers as editable must pass it.
function latestRpcKeyCheck(): (k: string) => boolean {
  const dir = 'drizzle/migrations';
  const file = readdirSync(dir).filter(f => f.endsWith('.sql')).sort().reverse()
    .map(f => readFileSync(`${dir}/${f}`, 'utf8')).find(s => s.includes('FUNCTION public.mcp_write_master_plan'))!;
  const line = file.split('\n').find(l => l.includes("'Invalid Master Plan metric key'"))!;
  const regexes = [...line.matchAll(/k !~ '([^']+)'/g)].map(m => new RegExp(m[1]));
  const exact = [...line.matchAll(/k <> '([^']+)'/g)].map(m => m[1]);
  return k => regexes.some(r => r.test(k)) || exact.includes(k);
}
describe('Master Plan save validation matches get_master_plan', () => {
  it('accepts every editable key, including Tech and per-head rows', () => {
    const ok = latestRpcKeyCheck();
    const keys = masterPlanCatalog().flatMap(t => t.sections.flatMap(s => s.rows)).filter(r => r.editable).flatMap(r => r.metric_keys);
    expect(keys).toContain('plan:financials:tech:gross-margin-pct');
    expect(keys).toContain('plan:financials:consolidated:ttm-avg-headcount');
    expect(keys.filter(k => k.includes('-per-head'))).toHaveLength(16);
    expect(keys.filter(k => !ok(k))).toEqual([]);
    expect(ok('plan:financials:tech:made-up')).toBe(false);
  });
});
