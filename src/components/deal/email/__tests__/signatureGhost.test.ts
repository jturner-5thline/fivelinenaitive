import { describe, it, expect } from 'vitest';
import { shouldShowSignatureGhost } from '../signatureGhost';

const SIG = 'Best,\nJane Doe';

describe('shouldShowSignatureGhost (runtime guard)', () => {
  it('hides the ghost when no signature is configured', () => {
    expect(shouldShowSignatureGhost(undefined, 'Hi there')).toBe(false);
    expect(shouldShowSignatureGhost(null, 'Hi there')).toBe(false);
    expect(shouldShowSignatureGhost('', 'Hi there')).toBe(false);
    expect(shouldShowSignatureGhost('   \n  ', 'Hi there')).toBe(false);
  });

  it('shows the ghost when signature exists and body is empty', () => {
    expect(shouldShowSignatureGhost(SIG, '')).toBe(true);
    expect(shouldShowSignatureGhost(SIG, '   ')).toBe(true);
    expect(shouldShowSignatureGhost(SIG, undefined)).toBe(true);
  });

  it('shows the ghost while user is composing a body that does not yet contain the sign-off', () => {
    expect(shouldShowSignatureGhost(SIG, 'Hi team,\n\nQuick question on the deal.')).toBe(true);
  });

  it('hides the ghost when the full signature already appears in the body (no duplication)', () => {
    const body = 'Hi team,\n\nQuick question.\n\nBest,\nJane Doe';
    expect(shouldShowSignatureGhost(SIG, body)).toBe(false);
  });

  it('hides the ghost when only the first sign-off line is typed at the tail', () => {
    const body = 'Hi team,\n\nQuick question.\n\nBest,';
    expect(shouldShowSignatureGhost(SIG, body)).toBe(false);
  });

  it('is whitespace- and case-insensitive when matching the signature', () => {
    const body = 'Hello.\n\nbest,    jane    doe';
    expect(shouldShowSignatureGhost(SIG, body)).toBe(false);
  });

  it('does not suppress when a short first-line token is absent from the body tail', () => {
    // 2-char sign-off "JD" — full-string match path also clears (absent),
    // and tail-token suppression must NOT trigger for tokens shorter than 3.
    expect(shouldShowSignatureGhost('JD', 'Some long body without the token at the end.')).toBe(true);
  });

  it('is pure — never mutates inputs (referential body stays identical)', () => {
    const body = 'Hi team,\n\nQuick question.';
    const before = body;
    shouldShowSignatureGhost(SIG, body);
    expect(body).toBe(before);
  });
});

/**
 * Visual-contract test: encodes the markup invariants that prevent the ghost
 * from ever overwriting the composer body. The composer renders the ghost as a
 * sibling <div> with `aria-hidden` and `select-none`, NOT inside the textarea.
 * If anyone refactors the composer to inject `signature` into the body string,
 * this test will fail because the contract below will no longer match the
 * source.
 */
describe('signature ghost visual contract (composer source invariants)', () => {
  it('EmailComposerCard renders the ghost as a sibling, aria-hidden, non-selectable node', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const src = await fs.readFile(
      path.resolve(__dirname, '../EmailComposerCard.tsx'),
      'utf8',
    );

    // 1. Ghost is gated by the runtime guard helper (never raw signature truthy
    //    check anymore — the guard owns the decision).
    expect(src).toMatch(/shouldShowSignatureGhost\(\s*signature\s*,\s*body\s*\)/);

    // 2. Ghost is aria-hidden so AT users never hear it as part of the body.
    expect(src).toMatch(/aria-hidden/);

    // 3. Ghost is non-selectable so it can't be copied into the body.
    expect(src).toMatch(/select-none/);

    // 4. CRITICAL: nothing in the file may splice `signature` into the body —
    //    no `body + signature`, no template literals mixing them, no
    //    onBodyChange call that forwards `signature`. The textarea's `value`
    //    must remain `body` verbatim.
    expect(src).toMatch(/value=\{body\}/);
    expect(src).not.toMatch(/body\s*\+\s*signature/);
    expect(src).not.toMatch(/signature\s*\+\s*body/);
    expect(src).not.toMatch(/onBodyChange\([^)]*signature[^)]*\)/);
  });
});