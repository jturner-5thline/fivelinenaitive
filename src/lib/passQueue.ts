import { senderKind } from '../../supabase/functions/_shared/lenderPassSender';

export interface PassRow {
  id: string; gmail_message_id: string; sender_email: string | null; deal_lender_id: string | null;
  is_pass: boolean; status: string; created_at: string; [k: string]: unknown;
}

/** Lender-side = external non-automated sender, or a 5thline.co forward attributed to a deal lender. */
export function isLenderSide(r: Pick<PassRow, 'sender_email' | 'deal_lender_id'>): boolean {
  const kind = senderKind(r.sender_email || '');
  return kind === 'external' || (kind === 'internal' && !!r.deal_lender_id);
}

/** Display-only queue view: likely passes from lender-side senders, one row per gmail message. */
export function passQueueView<T extends PassRow>(rows: T[], showAll: boolean): Array<T & { duplicate_count: number }> {
  if (showAll) return rows.map((r) => ({ ...r, duplicate_count: 1 }));
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    if (!r.is_pass || !isLenderSide(r)) continue;
    const g = groups.get(r.gmail_message_id) ?? [];
    g.push(r); groups.set(r.gmail_message_id, g);
  }
  return [...groups.values()].map((g) => {
    const best = [...g].sort((a, b) => Number(!!b.deal_lender_id) - Number(!!a.deal_lender_id) || a.created_at.localeCompare(b.created_at))[0];
    return { ...best, duplicate_count: g.length };
  }).sort((a, b) => b.created_at.localeCompare(a.created_at));
}
