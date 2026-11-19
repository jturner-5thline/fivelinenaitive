import { describe, it, expect } from 'vitest';
import { parsePerformanceDimensions, dimensionLabel } from './lenderPerformance';

describe('parsePerformanceDimensions', () => {
  it('keeps null scores and clamps to 0-100', () => {
    expect(parsePerformanceDimensions({ speed: { score: 120, driver: 'fast' }, fit: { score: null, driver: null } }))
      .toEqual([{ key: 'speed', score: 100, driver: 'fast' }, { key: 'fit', score: null, driver: null }]);
  });
  it('returns nothing for non-objects', () => {
    expect(parsePerformanceDimensions(null)).toEqual([]);
    expect(parsePerformanceDimensions([1])).toEqual([]);
  });
  it('labels keys', () => expect(dimensionLabel('response_speed')).toBe('Response Speed'));
});
