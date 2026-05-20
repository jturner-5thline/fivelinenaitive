import { Deal } from '@/types/deal';

type FinServMonetaryPatch = Partial<Pick<Deal, 'dealClass' | 'mrr' | 'oneTimeRevenue' | 'value'>>;

const hasOwn = <T extends object>(obj: T, key: PropertyKey) =>
  Object.prototype.hasOwnProperty.call(obj, key);

const toNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function patchTouchesFinServMonetaryFields(patch: FinServMonetaryPatch) {
  return hasOwn(patch, 'mrr') || hasOwn(patch, 'oneTimeRevenue');
}

export function computeFinServValue(
  patch: FinServMonetaryPatch,
  currentDeal?: Pick<Deal, 'mrr' | 'oneTimeRevenue'> | null,
) {
  const nextMrr = hasOwn(patch, 'mrr') ? patch.mrr : currentDeal?.mrr;
  const nextOtr = hasOwn(patch, 'oneTimeRevenue') ? patch.oneTimeRevenue : currentDeal?.oneTimeRevenue;

  return toNumber(nextMrr) + toNumber(nextOtr);
}

export function syncFinServValuePatch<T extends FinServMonetaryPatch>(
  patch: T,
  currentDeal?: Pick<Deal, 'dealClass' | 'mrr' | 'oneTimeRevenue'> | null,
): T {
  const isFinServ = patch.dealClass === 'finserv' || currentDeal?.dealClass === 'finserv';

  if (!isFinServ || !patchTouchesFinServMonetaryFields(patch)) {
    return patch;
  }

  return {
    ...patch,
    value: computeFinServValue(patch, currentDeal),
  };
}

export function warnIfFinServValueMismatch(
  deal: Pick<Deal, 'id' | 'name' | 'company' | 'dealClass' | 'mrr' | 'oneTimeRevenue' | 'value'>,
  source: string,
) {
  if (!import.meta.env.DEV || deal.dealClass !== 'finserv') return;

  const expectedValue = computeFinServValue({}, deal);
  const actualValue = toNumber(deal.value);

  if (actualValue === expectedValue) return;

  console.warn('[finserv-value-drift]', {
    source,
    dealId: deal.id,
    company: deal.company || deal.name,
    value: actualValue,
    expectedValue,
    mrr: toNumber(deal.mrr),
    oneTimeRevenue: toNumber(deal.oneTimeRevenue),
  });
}