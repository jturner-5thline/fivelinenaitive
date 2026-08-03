import type {
  ConsolidatedDebtPipelineMetrics,
  StageEntryDeal,
} from '@/hooks/usePipelineStageMetrics';

const keep = (deals: StageEntryDeal[], allowed: Set<string>) =>
  deals.filter((d) => allowed.has(d.deal_id));

function filterStage(metric: any, allowed: Set<string>) {
  if (!metric) return metric;
  const deals = keep(metric.deals ?? [], allowed);
  return {
    ...metric,
    deals,
    count: deals.length,
    dollarVolume: deals.reduce((s, d) => s + (Number(d.value) || 0), 0),
    ...(metric.mrr !== undefined
      ? { mrr: deals.reduce((s, d) => s + (Number(d.mrr) || 0), 0) }
      : {}),
  };
}

function filterAverage(metric: any, allowed: Set<string>) {
  if (!metric) return metric;
  const deals = keep(metric.deals ?? [], allowed);
  const numerator = deals.reduce((s, d) => s + (Number(d.value) || 0), 0);
  const denominator = deals.length;
  return {
    ...metric,
    deals,
    numerator,
    denominator,
    value: denominator > 0 ? numerator / denominator : null,
  };
}

function filterTrendBuckets(buckets: any[] | undefined, allowed: Set<string>) {
  return (buckets ?? []).map((b) => {
    const deals = keep(b.deals ?? [], allowed);
    const next: any = { ...b, deals };
    if (b.count !== undefined) next.count = deals.length;
    if (b.dollarVolume !== undefined) {
      next.dollarVolume = deals.reduce((s: number, d: StageEntryDeal) => s + (Number(d.value) || 0), 0);
    }
    if (b.fundedInvoicedCount !== undefined) {
      next.fundedInvoicedCount = deals.filter((d) => d.to_stage !== 'closed-won').length;
      next.closedWonCount = deals.filter((d) => d.to_stage === 'closed-won').length;
      next.total = deals.length;
    }
    return next;
  });
}

function filterTrend(series: any, allowed: Set<string>) {
  if (!series) return series;
  const next: any = {
    ...series,
    monthly: filterTrendBuckets(series.monthly, allowed),
    quarterly: filterTrendBuckets(series.quarterly, allowed),
    monthlyTtm: filterTrendBuckets(series.monthlyTtm, allowed),
    quarterlyTtm: filterTrendBuckets(series.quarterlyTtm, allowed),
  };
  if (series.total !== undefined) {
    next.total = next.quarterly.reduce((s: number, b: any) => s + (b.total ?? b.count ?? 0), 0);
  }
  return next;
}

function filterIdSet(set: Set<string> | undefined, allowed: Set<string>) {
  const out = new Set<string>();
  set?.forEach((id) => {
    if (allowed.has(id)) out.add(id);
  });
  return out;
}

/**
 * Applies the deal owner / deal manager selection to every metric surface on
 * the Debt Advisory dashboard. `allowed === null` means "no filter".
 */
export function filterDebtMetricsByPeople(
  m: ConsolidatedDebtPipelineMetrics,
  allowed: Set<string> | null,
): ConsolidatedDebtPipelineMetrics {
  if (!allowed) return m;
  return {
    ...m,
    ndaNeedsList: filterStage(m.ndaNeedsList, allowed),
    proposalsIssued: filterStage(m.proposalsIssued, allowed),
    finalCreditItems: filterStage(m.finalCreditItems, allowed),
    fundedInvoiced: filterStage(m.fundedInvoiced, allowed),
    fundedInvoicedOnly: filterStage(m.fundedInvoicedOnly, allowed),
    termsIssued: filterStage(m.termsIssued, allowed),
    inDueDiligence: filterStage(m.inDueDiligence, allowed),
    fundedInvoicedTrend: filterTrend(m.fundedInvoicedTrend, allowed),
    ndaNeedsListTrend: filterTrend(m.ndaNeedsListTrend, allowed),
    finalCreditItemsTrend: filterTrend(m.finalCreditItemsTrend, allowed),
    closedSplitTrend: filterTrend(m.closedSplitTrend, allowed),
    averageDealOnBoard: filterAverage(m.averageDealOnBoard, allowed),
    averageDealSigned: filterAverage(m.averageDealSigned, allowed),
    averageDealClosed: filterAverage(m.averageDealClosed, allowed),
    averageRevenuePerDealSigned: filterAverage(m.averageRevenuePerDealSigned, allowed),
    averageRevenuePerDealClosed: filterAverage(m.averageRevenuePerDealClosed, allowed),
    revenuePerDealHour: filterAverage(m.revenuePerDealHour, allowed),
    ttmCounts: {
      ...m.ttmCounts,
      proposalIssued: filterStage(m.ttmCounts?.proposalIssued, allowed),
      finalCreditItems: filterStage(m.ttmCounts?.finalCreditItems, allowed),
      submittedToLenders: filterStage(m.ttmCounts?.submittedToLenders, allowed),
      termsIssued: filterStage(m.ttmCounts?.termsIssued, allowed),
      inDueDiligence: filterStage(m.ttmCounts?.inDueDiligence, allowed),
      fundedInvoiced: filterStage(m.ttmCounts?.fundedInvoiced, allowed),
    },
    priors: {
      ndaNeedsList: filterStage(m.priors?.ndaNeedsList, allowed),
      proposalsIssued: filterStage(m.priors?.proposalsIssued, allowed),
      finalCreditItems: filterStage(m.priors?.finalCreditItems, allowed),
      termsIssued: filterStage(m.priors?.termsIssued, allowed),
      inDueDiligence: filterStage(m.priors?.inDueDiligence, allowed),
      fundedInvoicedOnly: filterStage(m.priors?.fundedInvoicedOnly, allowed),
    },
    lifetimeStageDealIds: {
      ...m.lifetimeStageDealIds,
      proposalIssued: filterIdSet(m.lifetimeStageDealIds?.proposalIssued, allowed),
      finalCreditItems: filterIdSet(m.lifetimeStageDealIds?.finalCreditItems, allowed),
      submittedToLenders: filterIdSet(m.lifetimeStageDealIds?.submittedToLenders, allowed),
      termsIssued: filterIdSet(m.lifetimeStageDealIds?.termsIssued, allowed),
      inDueDiligence: filterIdSet(m.lifetimeStageDealIds?.inDueDiligence, allowed),
      fundedInvoiced: filterIdSet(m.lifetimeStageDealIds?.fundedInvoiced, allowed),
    },
  };
}
