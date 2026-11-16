export const HARVEST_COMPANY_ID = '44556c46-9127-4b12-b14e-d6fee784afcf';
export const HARVEST_START = '2024-01-01';
export function canSyncHarvest(companyId: string, role: string) {
  return companyId === HARVEST_COMPANY_ID && ['owner', 'admin'].includes(role);
}
export interface HarvestEntry {
  spent_date: string; hours: number; billable: boolean; billable_rate: number | null;
  currency: string | null; user_name: string | null;
}
export function aggregateHarvest(entries: HarvestEntry[]) {
  const months: Record<string, { hours: number; billableHours: number; amount: number; missingRates: number; people: Record<string, { hours: number; billableHours: number }> }> = {};
  for (const e of entries) {
    if (e.spent_date < HARVEST_START) continue;
    const m = months[e.spent_date.slice(0, 7)] ||= { hours: 0, billableHours: 0, amount: 0, missingRates: 0, people: {} };
    m.hours += e.hours;
    const person = m.people[e.user_name ?? 'Unknown'] ||= { hours: 0, billableHours: 0 };
    person.hours += e.hours;
    if (e.billable) {
      m.billableHours += e.hours;
      person.billableHours += e.hours;
      if (e.billable_rate == null || e.currency !== 'USD') m.missingRates++;
      else m.amount += e.hours * e.billable_rate;
    }
  }
  return months;
}