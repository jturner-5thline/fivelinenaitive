// Per-week running balance math for Credit Facilities (LOC).
//
// Inputs:
//   - facilities: configured facilities
//   - scheduledItems: Configure entries; entries whose category starts with
//     "LOC Draw:" or "LOC Repayment:" followed by a facility name (or id)
//     are treated as draw / repayment events on that facility.
//   - visibleWeekKeys: ordered list of week keys (Saturday startKeys) to
//     compute balances for. Each week is treated as inclusive.
//
// Output: per-facility map of weekKey → { drawn, available }.

import { parseISO } from 'date-fns';
import type { CreditFacility } from './types';
import type { ScheduledCashFlow } from './scheduledCashFlows';

export const LOC_DRAW_PREFIX = 'LOC Draw:';
export const LOC_REPAY_PREFIX = 'LOC Repayment:';

export interface FacilityWeekState {
  drawn: number;
  available: number;
  active: boolean;
}

export type FacilityWeekStates = Record<string /*facilityId*/, Record<string /*weekKey*/, FacilityWeekState>>;

/** Resolve the facility a tagged scheduled entry refers to. Matches by id (suffix === facility.id) first, then by case-insensitive name. */
function resolveFacility(suffix: string, facilities: CreditFacility[]): CreditFacility | null {
  const trimmed = suffix.trim();
  if (!trimmed) return null;
  const byId = facilities.find((f) => f.id === trimmed);
  if (byId) return byId;
  const lower = trimmed.toLowerCase();
  return facilities.find((f) => f.name.toLowerCase() === lower) || null;
}

/** Returns true if the scheduled entry's date falls inside [weekStart, weekEnd] inclusive. */
function entryDateInWeek(entry: ScheduledCashFlow, weekStart: Date, weekEnd: Date): boolean {
  const candidate = entry.frequency_config?.one_time_date || entry.start_date;
  if (!candidate) return false;
  const d = parseISO(candidate);
  return d >= weekStart && d <= weekEnd;
}

/** Compute per-week drawn/available for each facility across the visible window. */
export function computeFacilityWeekStates(
  facilities: CreditFacility[],
  scheduledItems: ScheduledCashFlow[],
  visibleWeekKeys: string[],
  weekEndingByKey: Record<string, string>,
): FacilityWeekStates {
  const result: FacilityWeekStates = {};
  if (!Array.isArray(facilities) || facilities.length === 0) return result;

  for (const f of facilities) {
    const perWeek: Record<string, FacilityWeekState> = {};
    const facilityStart = f.start_date ? parseISO(f.start_date) : null;
    const facilityEnd = f.end_date ? parseISO(f.end_date) : null;
    const facAmount = Math.max(0, Number(f.facility_amount) || 0);
    const initialDrawn = Math.max(0, Math.min(facAmount, Number(f.initial_drawn) || 0));
    const overrides = f.drawn_overrides || {};

    let runningDrawn = initialDrawn;
    let started = false;

    for (const weekKey of visibleWeekKeys) {
      const weekStart = parseISO(weekKey);
      const endIso = weekEndingByKey[weekKey];
      const weekEnd = endIso ? parseISO(endIso) : new Date(weekStart.getTime() + 6 * 24 * 3600 * 1000);

      // Outside facility active window → no availability
      const beforeStart = facilityStart && weekEnd < facilityStart;
      const afterEnd = facilityEnd && weekStart > facilityEnd;
      if (beforeStart || afterEnd) {
        perWeek[weekKey] = { drawn: 0, available: 0, active: false };
        continue;
      }

      if (!started) {
        runningDrawn = initialDrawn;
        started = true;
      }

      // Apply tagged scheduled draws / repayments dated within this week
      for (const e of scheduledItems) {
        if (!e?.category) continue;
        let delta = 0;
        if (e.category.startsWith(LOC_DRAW_PREFIX)) {
          const fac = resolveFacility(e.category.slice(LOC_DRAW_PREFIX.length), facilities);
          if (fac && fac.id === f.id && entryDateInWeek(e, weekStart, weekEnd)) {
            delta += Math.abs(Number(e.amount) || 0);
          }
        } else if (e.category.startsWith(LOC_REPAY_PREFIX)) {
          const fac = resolveFacility(e.category.slice(LOC_REPAY_PREFIX.length), facilities);
          if (fac && fac.id === f.id && entryDateInWeek(e, weekStart, weekEnd)) {
            delta -= Math.abs(Number(e.amount) || 0);
          }
        }
        runningDrawn += delta;
      }

      // Manual per-week override pins the running balance for this week onward
      const ov = overrides[weekKey];
      if (ov !== undefined && ov !== null && Number.isFinite(ov)) {
        runningDrawn = Math.max(0, Math.min(facAmount, Number(ov)));
      }

      const drawn = Math.max(0, Math.min(facAmount, Math.round(runningDrawn)));
      const available = Math.max(0, facAmount - drawn);
      perWeek[weekKey] = { drawn, available, active: true };
    }

    result[f.id] = perWeek;
  }

  return result;
}

/** Sum available LOC across all facilities for a single week. */
export function totalAvailableLocForWeek(
  weekKey: string,
  states: FacilityWeekStates,
): number {
  let total = 0;
  for (const facId of Object.keys(states)) {
    total += states[facId]?.[weekKey]?.available || 0;
  }
  return total;
}