import { describe, it, expect } from 'vitest';
import { openItemCompletionUpdates, moveOpenItem } from './openItemActions';
describe('Open Items persistence actions', () => {
  it('completion serializes both persisted status fields', () => {
    const stored = JSON.stringify(openItemCompletionUpdates(true));
    expect(JSON.parse(stored)).toEqual({ received: true, approved: true });
  });
  it('reopening clears both persisted status fields', () => {
    expect(openItemCompletionUpdates(false)).toEqual({ received: false, approved: false });
  });
  it('reorders without dropping or modifying item data', () => {
    const items = [{ id: 'a', text: 'Tax' }, { id: 'b', text: 'Debt' }];
    expect(moveOpenItem(items, 'a', 1)).toEqual([items[1], items[0]]);
    expect(items[0].id).toBe('a');
    expect(moveOpenItem(items, 'a', -1)).toBeNull();
    expect(moveOpenItem(items, 'missing', 1)).toBeNull();
  });
});