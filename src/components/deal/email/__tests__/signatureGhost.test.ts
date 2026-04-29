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
 * Visual-contract test: the composer auto-prefills the signature into an empty
 * body once on first mount (gated by signatureInjectedRef), and otherwise
 * renders the ghost as an aria-hidden, select-none sibling so it can never be
 * accidentally selected/copied into the body during in-progress drafts.
 */
describe('signature ghost visual contract (composer source invariants)', () => {
  it('EmailComposerCard auto-prefills signature when empty and renders the ghost as a sibling otherwise', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const src = await fs.readFile(
      path.resolve(__dirname, '../EmailComposerCard.tsx'),
      'utf8',
    );

    // 1. Ghost is still gated by the runtime guard helper.
    expect(src).toMatch(/shouldShowSignatureGhost\(\s*signature\s*,\s*body\s*\)/);

    // 2. Ghost is aria-hidden so AT users never hear it as part of the body.
    expect(src).toMatch(/aria-hidden/);

    // 3. Ghost is non-selectable so it can't be copied into the body.
    expect(src).toMatch(/select-none/);

    // 4. The composer auto-prefills the signature exactly once via a ref
    //    guard. This intentionally replaces the older "never splice" contract
    //    after the rich-text composer upgrade.
    expect(src).toMatch(/signatureInjectedRef/);
  });
});