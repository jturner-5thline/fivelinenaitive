import { describe, it, expect } from 'vitest';
import { TILES, CENSYS_DEAL_ID } from '../PipelineVelocitySection';

describe('Pipeline velocity Censys exclusion', () => {
  it('excludes Censys from the Signed to Funded / Invoiced tile', () => {
    const tile = TILES.find((t) => t.id === 'signed-to-funded');
    expect(tile?.excludeDealIds).toEqual([CENSYS_DEAL_ID]);
  });

  it('does not exclude Censys from any other velocity tile', () => {
    const others = TILES.filter((t) => t.id !== 'signed-to-funded');
    for (const t of others) expect(t.excludeDealIds ?? []).not.toContain(CENSYS_DEAL_ID);
  });
});
