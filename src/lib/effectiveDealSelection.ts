import type { Deal } from '@/types/deal';
import { isActiveDeal } from '@/lib/deals';

const normalizeCompany = (value?: string | null) =>
  (value || '').trim().toLowerCase().replace(/\s+/g, ' ');

export function findActiveSameCompanyDeal(deals: Deal[], initialDeal?: Deal | null): Deal | undefined {
  if (!initialDeal) return undefined;
  if (isActiveDeal(initialDeal)) return initialDeal;

  const company = normalizeCompany(initialDeal.company || initialDeal.name);
  if (!company) return initialDeal;

  return deals.find((deal) => {
    if (deal.id === initialDeal.id || !isActiveDeal(deal)) return false;
    return normalizeCompany(deal.company || deal.name) === company;
  }) || initialDeal;
}

export function rankActiveDuplicateFirst<T extends { deal: Deal; score: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aCompany = normalizeCompany(a.deal.company || a.deal.name);
    const bCompany = normalizeCompany(b.deal.company || b.deal.name);
    const sameCompany = !!aCompany && aCompany === bCompany;
    const aActive = isActiveDeal(a.deal);
    const bActive = isActiveDeal(b.deal);

    if (sameCompany && aActive !== bActive) {
      return aActive ? -1 : 1;
    }
    const scoreDelta = b.score - a.score;
    if (scoreDelta !== 0) return scoreDelta;
    if (aActive !== bActive) return aActive ? -1 : 1;
    return 0;
  });
}