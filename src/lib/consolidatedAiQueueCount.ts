/**
 * Shared helper mirroring the bundling logic in `ActionQueuePanel` so the
 * badge/tile counts around the app reflect the number of *visible* approval
 * queue items (per-deal email drafts and per-deal funding-source / lender
 * status updates each collapse into a single bundle entry).
 */
export function consolidatedAiQueueCount(items: readonly any[] | null | undefined): number {
  if (!items || items.length === 0) return 0;
  const byDeal = new Map<string, any[]>();
  for (const it of items) {
    const key = (it as any).deal_id || '__unassigned__';
    if (!byDeal.has(key)) byDeal.set(key, []);
    byDeal.get(key)!.push(it);
  }
  let total = 0;
  for (const arr of byDeal.values()) {
    const drafts = arr.filter((it) => it.action_type === 'draft_email');
    const fsUpdates = arr.filter(
      (it) =>
        it.action_type === 'update_funding_source' ||
        it.action_type === 'update_lender_status',
    );
    // Terms Issued bundles: collapse items sharing the same bundle_key
    // ("terms_issued:{deal}:{lender}") into a single card.
    const termsByKey = new Map<string, number>();
    for (const it of arr) {
      const nv = (it as any).new_values || (it as any).payload?.on_approve_execution_payload?.new_values || {};
      const bk = typeof nv?.bundle_key === 'string' ? nv.bundle_key : '';
      if (!bk.startsWith('terms_issued:')) continue;
      termsByKey.set(bk, (termsByKey.get(bk) ?? 0) + 1);
    }
    let count = arr.length;
    for (const n of termsByKey.values()) {
      if (n >= 1) count -= n - 1;
    }
    if (drafts.length >= 2) count -= drafts.length - 1;
    if (fsUpdates.length >= 2) count -= fsUpdates.length - 1;
    total += count;
  }
  return total;
}