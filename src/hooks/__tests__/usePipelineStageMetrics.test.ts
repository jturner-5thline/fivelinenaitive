import { describe, it, expect } from 'vitest';
import {
  expandMetricStageLabels,
  expandStageLabels,
  normalizeMetricStageSlug,
  normalizeStageSlug,
} from '../usePipelineStageMetrics';

const ACTIVE_PIPELINE_ID = 'b78ad452-b489-4c89-8a91-789347c05f79';

describe('stage label normalization (regression: OpConnect Mar/Apr 2026)', () => {
  it('expands canonical slugs to all observed label/slug variants', () => {
    const labels = expandStageLabels(['funded-invoiced', 'closed-won']);
    expect(labels).toEqual(expect.arrayContaining([
      'funded-invoiced', 'Funded/Invoiced', 'Funded / Invoiced', 'Closed & Funded',
      'closed-won', 'Closed Won', 'Closed won',
    ]));
  });

  it('resolves live OpConnect rows (to_stage_id empty) to canonical slugs', () => {
    // OpConnect #1 — live trigger wrote to_stage='Funded / Invoiced', to_stage_id=''
    expect(normalizeStageSlug('Funded / Invoiced', '')).toBe('funded-invoiced');
    // OpConnect #2 — live trigger wrote to_stage='closed-won', to_stage_id=''
    expect(normalizeStageSlug('closed-won', '')).toBe('closed-won');
  });

  it('does NOT count "Indication of Interest" (In Development pipeline overload) as Closed Won', () => {
    // 478 historical rows have to_stage_id='closed-won' but to_stage='Indication of Interest'
    expect(normalizeStageSlug('Indication of Interest', 'closed-won')).toBeNull();
  });

  it('treats Active Pipeline closed-won history rows as funded for funded-only KPIs', () => {
    expect(expandMetricStageLabels(['funded-invoiced'], ACTIVE_PIPELINE_ID)).toEqual(expect.arrayContaining([
      'funded-invoiced', 'Funded / Invoiced', 'closed-won', 'Closed Won',
    ]));
    expect(normalizeMetricStageSlug('closed-won', '', ACTIVE_PIPELINE_ID, ['funded-invoiced'])).toBe('funded-invoiced');
  });
});