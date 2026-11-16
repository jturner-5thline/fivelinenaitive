export { aggregateHarvest } from '../../supabase/functions/sync-harvest/logic';
export type { HarvestEntry } from '../../supabase/functions/sync-harvest/logic';
export function harvestRate(numerator: number, billableHours: number) {
  return billableHours > 0 ? numerator / billableHours : null;
}