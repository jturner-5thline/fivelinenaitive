import { describe, it, expect } from 'vitest';
import { isSameViewConfig, type DealViewConfig } from '@/hooks/useDealSavedViews';

const base = { filters: { search: '' } as any, sortField: 'updatedAt', sortDirection: 'desc', viewMode: 'grid', groupBy: null } as DealViewConfig;

describe('isSameViewConfig', () => {
  it('matches identical configs', () => expect(isSameViewConfig(base, { ...base })).toBe(true));
  it('detects sort change', () => expect(isSameViewConfig(base, { ...base, sortDirection: 'asc' })).toBe(false));
  it('detects grouping change', () => expect(isSameViewConfig(base, { ...base, groupBy: 'stage' })).toBe(false));
  it('detects layout change', () => expect(isSameViewConfig(base, { ...base, viewMode: 'list' })).toBe(false));
  it('detects filter change', () => expect(isSameViewConfig(base, { ...base, filters: { search: 'x' } as any })).toBe(false));
});
