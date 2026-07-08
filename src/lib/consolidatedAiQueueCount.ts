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
    let count = arr.length;
    if (drafts.length >= 2) count -= drafts.length - 1;
    if (fsUpdates.length >= 2) count -= fsUpdates.length - 1;
    total += count;
  }
  return total;
}