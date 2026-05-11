import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Regression guard for the Deal Rundown → "Pipeline & Clients" tab.
 *
 * The Grid view was removed; Memo is the only render path. This test
 * pins the contract so a future edit can't silently re-introduce the
 * Grid/Memo toggle, the legacy `briefing_pipeline_view_mode` pref, or
 * the unused `useCatchUpData` / `LayoutGrid` / NEWS_CATEGORY_CONFIG
 * dependencies that powered the grid.
 *
 * Other Deal Rundown tabs (Catch Up & News, Email, Financial,
 * Operational) are unaffected — only Pipeline & Clients is locked here.
 */
describe('DailyBriefingModal.tsx — Pipeline tab Grid removal', () => {
  const source = readFileSync(
    resolve(__dirname, '../DailyBriefingModal.tsx'),
    'utf8',
  );
  const memoViewSource = readFileSync(
    resolve(__dirname, '../../../pages/pipeline/PipelineMemoView.tsx'),
    'utf8',
  );
  const memoCardSource = readFileSync(
    resolve(__dirname, '../memo/PipelineMemoCard.tsx'),
    'utf8',
  );

  it('does not render a Grid/Memo view toggle anywhere', () => {
    expect(source).not.toMatch(/\bsetViewMode\b/);
    expect(source).not.toMatch(/\bviewMode === 'grid'\b/);
    expect(source).not.toMatch(/aria-pressed=\{viewMode === 'grid'\}/);
  });

  it('no longer reads the legacy briefing_pipeline_view_mode pref', () => {
    // The pref key may still appear inside the localStorage cleanup
    // (`removeItem('ui_pref_briefing_pipeline_view_mode')`), but it must
    // never be read again via useUiPreference.
    expect(source).not.toMatch(
      /useUiPreference[^)]*briefing_pipeline_view_mode/,
    );
  });

  it('clears the legacy pref from localStorage on mount', () => {
    expect(source).toMatch(
      /localStorage\.removeItem\('ui_pref_briefing_pipeline_view_mode'\)/,
    );
  });

  it('drops grid-only deps (LayoutGrid, useCatchUpData, NEWS_CATEGORY_CONFIG)', () => {
    expect(source).not.toMatch(/\bLayoutGrid\b/);
    expect(source).not.toMatch(/\buseCatchUpData\b/);
    expect(source).not.toMatch(/\bNEWS_CATEGORY_CONFIG\b/);
  });

  it('still renders the PipelineMemoView (memo path preserved)', () => {
    expect(source).toMatch(/<PipelineMemoView\b/);
  });

  it('renders memo tiles in natural document flow with real spacing', () => {
    expect(memoViewSource).toMatch(/flex flex-col gap-3/);
    expect(memoViewSource).not.toMatch(/useVirtualizer/);
    expect(memoViewSource).not.toMatch(/absolute left-0 right-0/);
  });

  it('does not clip memo cards or force equal-height insight columns', () => {
    expect(memoCardSource).not.toMatch(/overflow-hidden/);
    expect(memoCardSource).not.toMatch(/contain:\s*'layout paint'/);
    expect(memoCardSource).toMatch(/style=\{\{ contain: 'paint' \} as React\.CSSProperties\}/);
    expect(memoCardSource).toMatch(/grid\s+items-start/);
  });
});