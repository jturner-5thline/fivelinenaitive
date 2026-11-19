import { describe, it, expect } from 'vitest';
import { introEvidenceUrl, labelize } from './lenderIntroPaths';
describe('lender intro paths', () => {
  it('links URLs and Gmail ids only', () => {
    expect(introEvidenceUrl('linkedin', 'https://linkedin.com/x')).toBe('https://linkedin.com/x');
    expect(introEvidenceUrl('intro_email', '18c2f0a1b2c3d4e5')).toBe('https://mail.google.com/mail/u/0/#all/18c2f0a1b2c3d4e5');
    expect(introEvidenceUrl('manual', 'met at dinner')).toBeNull();
  });
  it('labels path types', () => { expect(labelize('former_colleague')).toBe('Former colleague'); });
});
