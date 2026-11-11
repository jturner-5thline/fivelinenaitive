import { describe, it, expect } from 'vitest';
import { noteImageStoragePath } from '../noteImageStorage';

describe('noteImageStoragePath', () => {
  it('prefers explicit storage path', () => {
    expect(noteImageStoragePath('x', 'd/notes/a.png')).toBe('d/notes/a.png');
  });
  it('parses legacy signed URLs', () => {
    expect(noteImageStoragePath('https://h/storage/v1/object/sign/deal-space/d1/notes/a%20b.png?token=t')).toBe('d1/notes/a b.png');
  });
  it('ignores other URLs', () => {
    expect(noteImageStoragePath('https://example.com/a.png')).toBeNull();
    expect(noteImageStoragePath('https://h/storage/v1/object/sign/other/a.png?token=t')).toBeNull();
  });
});
