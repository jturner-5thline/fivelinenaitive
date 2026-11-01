import type { Deal } from '@/types/deal';

const has = (n: number | null | undefined) => Number.isFinite(Number(n)) && Number(n) > 0;

/** True when a deal has no fee information in Hours & Fees (no total, retainer, milestone or success fee %). */
export function isMissingFeeInfo(
  deal: Pick<Deal, 'totalFee' | 'retainerFee' | 'milestoneFee' | 'successFeePercent'>,
): boolean {
  return !has(deal.totalFee) && !has(deal.retainerFee) && !has(deal.milestoneFee) && !has(deal.successFeePercent);
}
