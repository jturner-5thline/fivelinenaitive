import { describe, it, expect } from 'vitest';
import { normalizeDealGrid, moveDealGridItem, resizeDealGridItem, DEFAULT_DEAL_GRID } from '../dealGridLayout';

describe('dealGridLayout', () => {
  it('keeps saved order and sizes, appends missing widgets', () => {
    const r = normalizeDealGrid([{ id: 'dealInfo', w: 'full', h: 'tall' }, { id: 'bogus' }, { id: 'dealInfo', w: 'sm' }]);
    expect(r[0]).toEqual({ id: 'dealInfo', w: 'full', h: 'tall' });
    expect(r).toHaveLength(DEFAULT_DEAL_GRID.length);
  });
  it('falls back to defaults for invalid sizes', () => {
    expect(normalizeDealGrid([{ id: 'tasks', w: 'huge', h: 'x' }])[0]).toEqual({ id: 'tasks', w: 'md', h: 'auto' });
  });
  it('moves an item to the drop target position', () => {
    const r = moveDealGridItem(DEFAULT_DEAL_GRID, 'finserv', 'tasks');
    expect(r[0].id).toBe('finserv');
  });
  it('resizes only the targeted widget', () => {
    const r = resizeDealGridItem(DEFAULT_DEAL_GRID, 'actions', { w: 'full' });
    expect(r.find((i) => i.id === 'actions')!.w).toBe('full');
    expect(r.find((i) => i.id === 'tasks')!.w).toBe('md');
  });
});
