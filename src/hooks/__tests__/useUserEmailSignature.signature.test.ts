import { describe, it, expect } from 'vitest';
import { DEFAULT_SIGNATURE_PLAINTEXT_BY_EMAIL } from '../useUserEmailSignature';

// REGRESSION GUARD — see useUserEmailSignature.ts. If a future edit drops the
// full default signature block (so the composer falls back to the bare
// "Best, <Name>" stub for jturner@5thline.co), this test fails immediately.
describe('useUserEmailSignature default signature block', () => {
  const sig = DEFAULT_SIGNATURE_PLAINTEXT_BY_EMAIL['jturner@5thline.co'];

  it('exposes the full James H. Turner V default block', () => {
    expect(sig).toBeDefined();
    expect(sig).toContain('James H. Turner V | Founder & CEO');
    expect(sig).toContain('5th | Line');
    expect(sig).toContain('o | (510) 871-4351');
    expect(sig).toContain('w | www.5thline.co');
    expect(sig).toContain('proprietary and confidential');
  });

  it('is NOT the minimal "Best, James Turner" stub', () => {
    expect(sig?.trim()).not.toMatch(/^Best,\s*James Turner\s*$/);
  });
});
