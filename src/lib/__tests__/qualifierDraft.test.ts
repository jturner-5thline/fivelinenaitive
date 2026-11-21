import { describe, it, expect } from 'vitest';
import { diffQualifiers, hasChanges } from '../qualifierDraft';

const saved = [
  { id: 'a', text: 'Rate below 13.5%', is_met: false, position: 0 },
  { id: 'b', text: 'No personal guarantees', is_met: true, position: 1 },
];

describe('diffQualifiers', () => {
  it('reports no changes for an untouched draft', () => {
    expect(hasChanges(diffQualifiers(saved, saved))).toBe(false);
  });
  it('stages a checkbox toggle as an update', () => {
    const c = diffQualifiers(saved, [{ ...saved[0], is_met: true }, saved[1]]);
    expect(c.updates).toEqual([{ id: 'a', text: 'Rate below 13.5%', is_met: true, position: 0 }]);
  });
  it('treats removed and blanked rows as deletes and drops blank new rows', () => {
    const c = diffQualifiers(saved, [{ ...saved[0], text: '  ' }, { id: 'n', text: '', is_met: false, position: 2, isNew: true }]);
    expect(c.deletes.sort()).toEqual(['a', 'b']);
    expect(c.inserts).toEqual([]);
  });
  it('inserts new rows with trimmed text', () => {
    const c = diffQualifiers(saved, [...saved, { id: 'n', text: ' IO 6 months ', is_met: false, position: 2, isNew: true }]);
    expect(c.inserts).toEqual([{ text: 'IO 6 months', is_met: false, position: 2 }]);
  });
});
