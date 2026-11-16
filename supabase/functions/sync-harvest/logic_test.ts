import { canSyncHarvest, HARVEST_COMPANY_ID, aggregateHarvest } from './logic.ts';
const assert = (value: boolean) => { if (!value) throw new Error('Assertion failed'); };
Deno.test('Harvest sync requires an internal workspace owner or admin', () => {
  assert(canSyncHarvest(HARVEST_COMPANY_ID, 'owner'));
  assert(canSyncHarvest(HARVEST_COMPANY_ID, 'admin'));
  assert(!canSyncHarvest(HARVEST_COMPANY_ID, 'member'));
  assert(!canSyncHarvest('other-tenant', 'owner'));
});
Deno.test('Harvest ignores pre-2024 entries and excludes nonbillable denominator hours', () => {
  const m = aggregateHarvest([
    { spent_date: '2023-12-31', hours: 100, billable: true, billable_rate: 100, currency: 'USD', user_name: 'Scott' },
    { spent_date: '2024-01-01', hours: 2, billable: true, billable_rate: 100, currency: 'USD', user_name: 'Scott' },
    { spent_date: '2024-01-01', hours: 8, billable: false, billable_rate: 100, currency: 'USD', user_name: 'Scott' },
  ])['2024-01'];
  assert(m.billableHours === 2 && m.hours === 10 && m.amount === 200);
});