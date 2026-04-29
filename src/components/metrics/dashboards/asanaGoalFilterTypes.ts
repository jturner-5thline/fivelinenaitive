/**
 * Shared Asana Goal filter constants & types.
 *
 * Extracted out of QuarterlyInsightsReport.tsx to break a circular import:
 *   QuarterlyInsightsReport → useAsanaGoalFilterPrefs → QuarterlyInsightsReport
 *
 * That cycle caused a TDZ ReferenceError ("Cannot access 'mt' before
 * initialization") on /insights when the bundler initialized the hook
 * module first and tried to evaluate its top-level `DEFAULTS` constant
 * before QuarterlyInsightsReport had bound its exports.
 *
 * Both modules now import from this leaf file with no back-references.
 */

export type QKey = 'Q1' | 'Q2' | 'Q3' | 'Q4';
export type HKey = 'H1' | 'H2';

export interface AsanaGoalFilterTemplates {
  quarters: Record<QKey, string>;
  halves: Record<HKey, string>;
}

export const DEFAULT_ASANA_GOAL_FILTERS: AsanaGoalFilterTemplates = {
  quarters: {
    Q1: 'Q1 {year}',
    Q2: 'Q2 {year}',
    Q3: 'Q3 {year}',
    Q4: 'Q4 {year}',
  },
  halves: {
    H1: 'H1 {year}',
    H2: 'H2 {year}',
  },
};
