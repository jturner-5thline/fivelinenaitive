import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Static-analysis tests that protect the Insights / Weekly Rundown page
 * from regressing back to multiple competing period selectors.
 *
 * Background: there used to be three competing pickers on the page
 *   1. The "Apr-26" month <Select> in the top-right header
 *   2. The "Apr, 2026" badge next to the title
 *   3. The "Q2 2026" dropdown inside the Weekly Rundown section
 *
 * The canonical selector now lives in the page header (`<PeriodPicker>`)
 * and drives every widget via the `selectedQuarter` prop chain.
 *
 * These tests fail loudly if anyone:
 *   • re-introduces the legacy month picker / "Apr-26" UI
 *   • adds a second internal quarter <Select> inside a Weekly Rundown widget
 *   • forgets to wire a Weekly Rundown widget into the shared quarter state
 */

const repoRoot = resolve(__dirname, '../../../..');
const insightsPagePath = join(repoRoot, 'src/pages/Insights.tsx');
const dashboardsDir = join(repoRoot, 'src/components/metrics/dashboards');

const read = (p: string) => readFileSync(p, 'utf-8');

/** Files that compose the Weekly Rundown experience and MUST defer to the page-level quarter state. */
const WEEKLY_RUNDOWN_WIDGET_FILES = [
  'ManagementSnapshotDashboard.tsx',
  'SignedDealsAndARSection.tsx',
  'PipelineMetricsSection.tsx',
  'ProfitByEntitySection.tsx',
  'RevenueOverviewDashboard.tsx',
  'WeeklyRundownCarousel.tsx',
  'WeeklyRundownPipelineClientsPage.tsx',
  'WeeklyRundownOpsProjectsPage.tsx',
  'WeeklyRundownReadOnlyCashflow.tsx',
].map(f => join(dashboardsDir, f));

/** Dashboards that legitimately own their OWN period selector (separate routes / standalone dashboards). */
const STANDALONE_DASHBOARDS_ALLOWED_OWN_SELECTOR = new Set([
  'SalesTeamBoardDashboard.tsx',
  'FinServFinancialMetricsDashboard.tsx',
  'ControllerDashboard.tsx',
  'ConsolidatedDebtPipelineDashboard.tsx',
  'ExecutiveDashboard.tsx',
  'QuickBooksFinancialDashboard.tsx',
  'SalesBDROIDashboard.tsx',
  'SalesCommissionBoardDashboard.tsx',
  'IncomeBoardDashboard.tsx',
  'HarvestMonthlyTrackingDashboard.tsx',
  'ManagementReviewDashboard.tsx',
  'ManagementReviewCarousel.tsx',
  'WeeklyCashflowDashboard.tsx',
  'BenchmarkForecastsPage.tsx',
  'KeyMetricsPage.tsx',
  'DealStageTimelineDashboard.tsx',
  'ChandlerSalesCommissionDashboard.tsx',
]);

describe('Insights shared quarter state — page-level header', () => {
  const src = read(insightsPagePath);

  it('does not render the legacy "Apr-26" month select or "Apr, 2026" badge', () => {
    // The retired UI literally read "Apr-26" / "Apr, 2026". Catch any string
    // resembling a hard-coded month-year label that would imply a separate picker.
    expect(src, 'Insights.tsx contains a legacy "Apr-26" string').not.toMatch(/Apr-?26\b/);
    expect(src, 'Insights.tsx contains a legacy "Apr, 2026" badge').not.toMatch(/Apr,\s*2026/);
  });

  it('does not contain the legacy in-section "All sections synchronized…" subtitle', () => {
    expect(src, 'Legacy synchronization subtitle should be removed').not.toMatch(
      /All sections synchronized to the selected period/,
    );
  });

  it('uses exactly one PeriodPicker as the canonical timeframe control', () => {
    const pickerOpens = src.match(/<PeriodPicker[\s>]/g) ?? [];
    expect(pickerOpens.length, 'Expected exactly one <PeriodPicker> on Insights').toBe(1);
  });

  it('threads dashboardSelectedQuarter into ManagementSnapshotDashboard', () => {
    expect(src).toMatch(/selectedQuarter=\{dashboardSelectedQuarter\}/);
  });
});

describe('Weekly Rundown widgets — no rogue period selectors', () => {
  for (const file of WEEKLY_RUNDOWN_WIDGET_FILES) {
    const name = file.split('/').pop()!;
    it(`${name} reads selectedQuarter from props (no internal getCurrentQuarter() / Apr-26 picker)`, () => {
      const src = read(file);

      // 1. Must not own internal quarter state
      expect(src, `${name} should not call getCurrentQuarter() (use shared prop)`).not.toMatch(
        /getCurrentQuarter\s*\(/,
      );

      // 2. Must not render its own period <Select> wrapping QuarterOption choices
      //    (legacy pattern: a <Select> whose options come from buildQuarterOptions).
      const hasBuildQuarterOptions = /buildQuarterOptions\s*\(/.test(src);
      const hasOwnSelect = /<Select[\s\S]*?onValueChange[\s\S]*?<\/Select>/.test(src);
      expect(
        hasBuildQuarterOptions && hasOwnSelect,
        `${name} appears to render its own quarter <Select> driven by buildQuarterOptions — should consume shared state`,
      ).toBe(false);

      // 3. Must not contain hard-coded "Apr-26" / "Apr, 2026" labels
      expect(src, `${name} contains a legacy hard-coded Apr-26 label`).not.toMatch(/Apr-?26\b/);
      expect(src, `${name} contains a legacy hard-coded Apr, 2026 label`).not.toMatch(/Apr,\s*2026/);
    });
  }
});

describe('Weekly Rundown widgets — connected to shared QuarterOption', () => {
  // Every *Section.tsx file that participates in the Weekly Rundown must
  // accept `selectedQuarter` as a prop (the canonical fan-out from Insights).
  const SECTION_FILES = WEEKLY_RUNDOWN_WIDGET_FILES.filter(f => /Section\.tsx$/.test(f));

  for (const file of SECTION_FILES) {
    const name = file.split('/').pop()!;
    it(`${name} accepts a selectedQuarter prop`, () => {
      const src = read(file);
      expect(
        src,
        `${name} must accept { selectedQuarter } (QuarterOption) as a prop`,
      ).toMatch(/selectedQuarter\s*[:?]?\s*[:{]?/);
      // Also assert it imports the QuarterOption type so the wiring is type-safe.
      expect(src, `${name} should reference the QuarterOption type`).toMatch(/QuarterOption/);
    });
  }
});

describe('No new dashboard file regresses to a hard-coded "Apr-26" picker', () => {
  // Walk every file in src/components/metrics/dashboards and assert no one
  // ever puts the literal Apr-26 / Apr, 2026 text in a dashboard component.
  const files = readdirSync(dashboardsDir).filter(f => f.endsWith('.tsx'));

  for (const f of files) {
    it(`${f} does not contain legacy Apr-26 / Apr, 2026 literals`, () => {
      const fullPath = join(dashboardsDir, f);
      const stat = statSync(fullPath);
      if (!stat.isFile()) return;
      const src = read(fullPath);
      expect(src, `${f} contains a legacy Apr-26 literal`).not.toMatch(/Apr-?26\b/);
      expect(src, `${f} contains a legacy "Apr, 2026" literal`).not.toMatch(/Apr,\s*2026/);
    });
  }

  it('only standalone dashboards may own their own getCurrentQuarter() state', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const fullPath = join(dashboardsDir, f);
      if (!statSync(fullPath).isFile()) continue;
      const src = read(fullPath);
      if (!/getCurrentQuarter\s*\(/.test(src)) continue;
      if (STANDALONE_DASHBOARDS_ALLOWED_OWN_SELECTOR.has(f)) continue;
      offenders.push(f);
    }
    expect(
      offenders,
      `These files own their own getCurrentQuarter() state but should consume shared state instead: ${offenders.join(', ')}`,
    ).toEqual([]);
  });
});