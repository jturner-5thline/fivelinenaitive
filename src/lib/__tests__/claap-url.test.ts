import { describe, expect, it } from 'vitest';
import { extractClaapRecordingCandidates, extractClaapRecordingId, formatClaapTitleFromUrl } from '@/lib/claap-url';

describe('claap URL parsing', () => {
  it('extracts the recording id from Claap share URLs with slug and c marker', () => {
    const url = 'https://app.claap.io/5th-line/odk-5th-line-kick-off-call-c-Ep7dCCCqK8-zYZ1frBaISQu';

    expect(extractClaapRecordingId(url)).toBe('zYZ1frBaISQu');
    expect(extractClaapRecordingCandidates(url).map((c) => c.id)).toEqual([
      'zYZ1frBaISQu',
      'Ep7dCCCqK8',
    ]);
  });

  it('keeps bare recording ids valid for manual linking', () => {
    expect(extractClaapRecordingId('UwmN1OwKt46z')).toBe('UwmN1OwKt46z');
  });

  it('formats a readable fallback title from a share URL', () => {
    expect(formatClaapTitleFromUrl('https://app.claap.io/5th-line/odk-5th-line-kick-off-call-c-Ep7dCCCqK8-zYZ1frBaISQu'))
      .toBe('Odk 5th Line Kick Off Call');
  });
});