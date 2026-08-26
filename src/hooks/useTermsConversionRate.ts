import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { isExcludedDealName } from '@/utils/excludedDeals';
import { expandStageLabels } from '@/hooks/usePipelineStageMetrics';

const ACTIVE_PIPELINE_ID = 'b78ad452-b489-4c89-8a91-789347c05f79';

/** Deal stages whose entry (in the trailing 12 months) qualifies a deal. */
const QUALIFYING_STAGES = ['submitted-to-lenders', 'lenders-in-review'];

const norm = (s?: string | null) => (s || '').toLowerCase().replace(/[_-]+/g, ' ').trim();

/**
 * Stage labels that mean "Term Sheets or later" when we cannot resolve the
 * lender stage against a configured stage order (legacy free-text stages).
 */
const TERMS_OR_LATER_TOKENS = [
  'terms issued',
  'term sheet',
  'term sheets',
  'in diligence',
  'due diligence',
  'diligence',
  'approved',
  'closing',
  'closed & funded',
  'closed and funded',
  'funded',
  'closed won',
];

const NEVER_TERMS_LABELS = new Set(['passed', 'not a fit', 'unresponsive', 'declined', 'excluded']);

/** Token-based fallback used when the stage isn't present in a stage config. */
export function isLenderTermsOrLater(stage?: string | null, trackingStatus?: string | null): boolean {
  const s = norm(stage);
  const ts = norm(trackingStatus);
  if (!s) return false;
  if (ts === 'passed' || NEVER_TERMS_LABELS.has(s)) return false;
  return TERMS_OR_LATER_TOKENS.some(t => s.includes(t));
}

interface StageMeta {
  label: string;
  group: string;
  /** Position within the config's active-stage ladder, -1 when not active. */
  activeIndex: number;
  /** Position of the "Term Sheets" stage in that same ladder, -1 when absent. */
  termsIndex: number;
}

type StageLookup = Map<string, Map<string, StageMeta>>; // company_id ('' = global) -> stageId -> meta

function buildStageLookup(configs: Array<{ company_id: string | null; stages: unknown }>): StageLookup {
  const lookup: StageLookup = new Map();
  for (const cfg of configs) {
    const stages = Array.isArray(cfg.stages)
      ? (cfg.stages as Array<{ id?: string; label?: string; group?: string }>)
      : [];
    const active = stages.filter(s => (s?.group ?? 'active') === 'active');
    const termsIndex = active.findIndex(s => {
      const l = norm(s?.label);
      return l.includes('term sheet') || l.includes('terms issued');
    });
    const key = cfg.company_id ?? '';
    const target = lookup.get(key) ?? new Map<string, StageMeta>();
    lookup.set(key, target);
    for (const s of stages) {
      if (!s?.id) continue;
      target.set(s.id, {
        label: s.label ?? s.id,
        group: s.group ?? 'active',
        activeIndex: active.findIndex(a => a.id === s.id),
        termsIndex,
      });
    }
  }
  return lookup;
}

function resolveStage(lookup: StageLookup, companyId: string | null, stageId: string | null): StageMeta | null {
  if (!stageId) return null;
  // Only trust the deal's own workspace config (or the global one). Scanning
  // every tenant's config causes cross-tenant id collisions (e.g. "passed"
  // labelled "Review" in another workspace) and mis-classifies funding sources.
  const scoped = companyId ? lookup.get(companyId)?.get(stageId) : undefined;
  return scoped ?? lookup.get('')?.get(stageId) ?? null;
}


export interface TermsConversionDealRow {
  deal_id: string;
  company: string;
  value: number;
  manager: string | null;
  current_stage: string;
  entered_at: string;
  pipeline_id: string;
}

export interface TermsConversionRateResult {
  /** Funding sources that reached Term Sheets or later. */
  numerator: number;
  /** Total funding sources added across qualifying deals. */
  denominator: number;
  rate: number | null;
  /** Formatted percentage, or '—'. */
  value: string;
  dealCount: number;
  numeratorDeals: TermsConversionDealRow[];
  denominatorDeals: TermsConversionDealRow[];
  isLoading: boolean;
}

/**
 * Terms Conversion Rate (TTM).
 *
 * Cohort = every Active Pipeline deal that entered "Submitted to Lenders" or
 * "Lenders in Review" in the trailing 12 months. Rate = funding sources on
 * those deals whose stage is "Term Sheets" or later (resolved against the
 * workspace's configured lender stage ladder) ÷ ALL funding sources on those
 * deals.
 */
export function useTermsConversionRate(): TermsConversionRateResult {
  const { user } = useAuth();

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['terms-conversion-rate-ttm', ACTIVE_PIPELINE_ID],
    queryFn: async () => {
      const start = new Date();
      start.setMonth(start.getMonth() - 12);
      const startIso = start.toISOString();

      const empty = {
        numerator: 0,
        denominator: 0,
        dealCount: 0,
        numeratorDeals: [] as TermsConversionDealRow[],
        denominatorDeals: [] as TermsConversionDealRow[],
      };

      const { data: histRows, error: histErr } = await supabase
        .from('deal_stage_history')
        .select('deal_id, changed_at')
        .eq('event_type', 'stage_enter')
        .eq('pipeline_id', ACTIVE_PIPELINE_ID)
        .in('to_stage', expandStageLabels(QUALIFYING_STAGES))
        .gte('changed_at', startIso);
      if (histErr) throw histErr;

      const enteredAt = new Map<string, string>();
      for (const r of (histRows ?? []) as any[]) {
        if (!r.deal_id) continue;
        const prev = enteredAt.get(r.deal_id);
        if (!prev || (r.changed_at && r.changed_at < prev)) enteredAt.set(r.deal_id, r.changed_at);
      }
      const dealIds = Array.from(enteredAt.keys());
      if (dealIds.length === 0) return empty;

      const [dealRes, cfgRes] = await Promise.all([
        supabase.from('deals').select('id, company, company_id, amount, manager, pipeline_id').in('id', dealIds),
        supabase.from('lender_stage_configs').select('company_id, stages').limit(500),
      ]);
      if (dealRes.error) throw dealRes.error;
      if (cfgRes.error) throw cfgRes.error;

      const kept = (dealRes.data ?? []).filter((d: any) => !isExcludedDealName(d.company));
      const keptIds = kept.map((d: any) => d.id);
      if (keptIds.length === 0) return empty;
      const dealById = new Map(kept.map((d: any) => [d.id, d]));
      const lookup = buildStageLookup((cfgRes.data ?? []) as any[]);

      const { data: lenderRows, error: lenderErr } = await supabase
        .from('deal_lenders')
        .select('id, deal_id, name, stage, tracking_status')
        .in('deal_id', keptIds);
      if (lenderErr) throw lenderErr;

      const rows = lenderRows ?? [];

      const classify = (r: any) => {
        const deal: any = dealById.get(r.deal_id) ?? {};
        const meta = resolveStage(lookup, deal.company_id ?? null, r.stage ?? null);
        const label = meta?.label ?? r.stage ?? '—';
        let qualifies: boolean;
        if (meta && meta.termsIndex >= 0) {
          qualifies = meta.group === 'active'
            && meta.activeIndex >= 0
            && meta.activeIndex >= meta.termsIndex
            && !NEVER_TERMS_LABELS.has(norm(label));
        } else {
          qualifies = isLenderTermsOrLater(label, r.tracking_status);
        }
        return { label, qualifies, deal };
      };

      const toRow = (r: any, label: string, deal: any): TermsConversionDealRow => ({
        deal_id: r.deal_id,
        company: `${deal.company ?? 'Unknown deal'} · ${r.name ?? 'Funding source'}`,
        value: Number(deal.amount) || 0,
        manager: deal.manager ?? null,
        current_stage: label,
        entered_at: enteredAt.get(r.deal_id) ?? '',
        pipeline_id: deal.pipeline_id ?? ACTIVE_PIPELINE_ID,
      });

      const denominatorDeals: TermsConversionDealRow[] = [];
      const numeratorDeals: TermsConversionDealRow[] = [];
      for (const r of rows as any[]) {
        const { label, qualifies, deal } = classify(r);
        const row = toRow(r, label, deal);
        denominatorDeals.push(row);
        if (qualifies) numeratorDeals.push(row);
      }

      return {
        numerator: numeratorDeals.length,
        denominator: denominatorDeals.length,
        dealCount: keptIds.length,
        numeratorDeals,
        denominatorDeals,
      };
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  return useMemo(() => {
    const loading = isLoading || isFetching;
    const numerator = data?.numerator ?? 0;
    const denominator = data?.denominator ?? 0;
    const rate = denominator > 0 ? numerator / denominator : null;
    return {
      numerator,
      denominator,
      rate,
      value: rate === null ? '—' : `${(rate * 100).toFixed(1)}%`,
      dealCount: data?.dealCount ?? 0,
      numeratorDeals: data?.numeratorDeals ?? [],
      denominatorDeals: data?.denominatorDeals ?? [],
      isLoading: loading,
    };
  }, [data, isLoading, isFetching]);
}
