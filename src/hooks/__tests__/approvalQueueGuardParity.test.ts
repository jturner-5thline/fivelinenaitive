import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIFTH_LINE_COMPANY_ID } from '@/hooks/useNaitivePipelineAccess';

/**
 * Regression guard: the Approval Queue access rule MUST stay in lock-step
 * between the frontend hook (`useApprovalQueueAccess` →
 * `useNaitivePipelineAccess` → FIFTH_LINE_COMPANY_ID) and the database
 * helper `public.can_use_approval_queue(uuid)` defined by the most recent
 * migration. If either side drifts (email-domain check sneaks back in,
 * feature-flag dependency reappears, or the company id changes), the
 * Approval Queue silently empties for legitimate 5th Line users — that's
 * exactly the bug this test exists to prevent.
 */
describe('Approval Queue guard parity (frontend ↔ DB)', () => {
  const repoRoot = join(__dirname, '..', '..', '..');
  const migrationsDir = join(repoRoot, 'supabase', 'migrations');

  function latestApprovalQueueMigration(): string {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readdirSync } = require('node:fs') as typeof import('node:fs');
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    const matches = files.filter((f) => {
      const body = readFileSync(join(migrationsDir, f), 'utf8');
      return /can_use_approval_queue\s*\(/i.test(body);
    });
    if (matches.length === 0) {
      throw new Error('No migration defines can_use_approval_queue()');
    }
    return readFileSync(join(migrationsDir, matches[matches.length - 1]!), 'utf8');
  }

  const sql = latestApprovalQueueMigration();

  it('frontend canonical 5th Line company id matches the DB helper', () => {
    expect(sql).toContain(FIFTH_LINE_COMPANY_ID);
  });

  it('DB helper uses company_members membership (not email-domain)', () => {
    expect(sql).toMatch(/from\s+public\.company_members/i);
    expect(sql).not.toMatch(/auth\.users[^)]*email/i);
    expect(sql).not.toMatch(/@5thline\.co/i);
  });

  it('DB helper does not depend on the approval_queue_enabled feature flag', () => {
    expect(sql).not.toMatch(/feature_flags/i);
    expect(sql).not.toMatch(/approval_queue_enabled/i);
  });
});