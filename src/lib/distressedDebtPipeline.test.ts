import { describe, it, expect } from 'vitest';
import { allowedMoveTargets, DISTRESSED_DEBT_STAGES } from './distressedDebtPipeline';

const pipes = [
  { id: 'a', name: 'Active Deals' },
  { id: 'b', name: 'In Development' },
  { id: 'dd', name: 'Distressed Debt' },
];

describe('Distressed Debt isolation', () => {
  it('a Distressed Debt deal cannot move to any other pipeline', () => {
    expect(allowedMoveTargets(pipes, 'dd').map((p) => p.id)).toEqual(['dd']);
  });
  it('other deals cannot move into Distressed Debt', () => {
    expect(allowedMoveTargets(pipes, 'a').map((p) => p.id)).toEqual(['a', 'b']);
  });
  it('has exactly the six requested stages in order', () => {
    expect(DISTRESSED_DEBT_STAGES.map((s) => s.label)).toEqual([
      'Initial Review', 'Preview', 'Diligence', 'Closed & Funded', 'Closed Won', 'Closed Lost',
    ]);
  });
});
