export const HEADCOUNT_COMPANY_ID = '44556c46-9127-4b12-b14e-d6fee784afcf';
export const HEADCOUNT_UNITS = [
  { realmId: '193514877331929', label: 'Debt', name: '5th Line Capital Advisors LLC' },
  { realmId: '9341451968897660', label: 'FinServ', name: '5th Line Financial Services, LLC' },
  { realmId: '9130350272677286', label: 'Tech', name: '5th Line Technologies LLC' },
  { realmId: '123146077561874', label: 'Capital', name: '5th Line Capital, LLC' },
] as const;
export const HEADCOUNT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export type HeadcountDraft = Record<string, string>;
export function headcountKey(realmId: string, month: number) { return `${realmId}:${month}`; }
export function parseHeadcount(value: string): number | null {
  if (!value.trim()) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(value) || Number(value) > 9999.99) throw new Error('Enter a headcount from 0 to 9,999.99 with up to two decimal places.');
  return Number(value);
}
export function headcountSummary(values: string[]) {
  const entered = values.map(parseHeadcount).filter((n): n is number => n !== null);
  return { total: entered.reduce((sum, n) => sum + n, 0), average: entered.length ? entered.reduce((sum, n) => sum + n, 0) / entered.length : null };
}
export function buildHeadcountChanges(companyId: string, year: number, draft: HeadcountDraft, baseline: HeadcountDraft) {
  if (companyId !== HEADCOUNT_COMPANY_ID) throw new Error('Headcount is only available in the 5th Line workspace.');
  return HEADCOUNT_UNITS.flatMap(unit => HEADCOUNT_MONTHS.flatMap((_, index) => {
    const key = headcountKey(unit.realmId, index);
    const value = parseHeadcount(draft[key] ?? '');
    const previous = parseHeadcount(baseline[key] ?? '');
    return value === previous ? [] : [{ company_id: companyId, realm_id: unit.realmId, month: `${year}-${String(index + 1).padStart(2, '0')}-01`, headcount: value }];
  }));
}