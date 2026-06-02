import { describe, it, expect } from 'vitest';
import { extractMentions, renderMentionText } from '../useTaskMentions';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

describe('extractMentions', () => {
  it('extracts a single mention id', () => {
    expect(extractMentions(`hi @[Alice](${A}) can you look?`)).toEqual([A]);
  });

  it('extracts multiple distinct ids', () => {
    expect(
      extractMentions(`@[Alice](${A}) and @[Bob](${B}) please review`),
    ).toEqual([A, B]);
  });

  it('dedupes repeated mentions of the same user', () => {
    expect(
      extractMentions(`@[Alice](${A}) ping @[Alice](${A}) again`),
    ).toEqual([A]);
  });

  it('ignores plain @handles with no parens', () => {
    expect(extractMentions('@alice and @bob no parens')).toEqual([]);
  });

  it('ignores malformed mentions', () => {
    expect(extractMentions('@[Alice](not-a-uuid) @[Bob]()')).toEqual([]);
  });

  it('returns [] for empty / non-mention text', () => {
    expect(extractMentions('')).toEqual([]);
    expect(extractMentions('plain comment, no mentions')).toEqual([]);
  });
});

describe('renderMentionText', () => {
  it('renders @[Name](id) tokens as @Name plain text', () => {
    expect(
      renderMentionText(`hey @[James Turner](${A}), ping @[Niki](${B})`),
    ).toBe('hey @James Turner, ping @Niki');
  });

  it('leaves non-mention text untouched', () => {
    expect(renderMentionText('no mentions here')).toBe('no mentions here');
  });
});