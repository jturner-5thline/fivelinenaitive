import type { Deal } from '@/types/deal';

function norm(s: unknown): string {
  return String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export interface NudgePermissionInput {
  deal: Pick<Deal, 'manager' | 'dealOwner'>;
  userFullName?: string | null;
  userEmail?: string | null;
  isAdmin?: boolean | null;
  /** When true, viewer is known read-only — never show. */
  isReadOnly?: boolean | null;
}

/**
 * Owner / Manager / Admin only. Read-only viewers never see the nudge.
 * Manager + owner are matched by display name OR email local-part
 * because the `Deal.manager` / `Deal.dealOwner` fields are free-text.
 */
export function canSeeStaleStatusNudge(input: NudgePermissionInput): boolean {
  if (input.isReadOnly) return false;
  if (input.isAdmin) return true;
  const name = norm(input.userFullName);
  const emailLocal = norm(input.userEmail).split('@')[0];
  const manager = norm(input.deal.manager);
  const owner = norm(input.deal.dealOwner);
  if (!name && !emailLocal) return false;
  if (name && (manager === name || owner === name)) return true;
  if (emailLocal && (manager.includes(emailLocal) || owner.includes(emailLocal))) return true;
  // Loose contains match — e.g. manager "Ian Phillips" vs name "ian phillips"
  if (name && (manager.includes(name) || owner.includes(name))) return true;
  return false;
}