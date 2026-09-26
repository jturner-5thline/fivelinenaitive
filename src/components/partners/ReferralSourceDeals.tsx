import { isExcludedDealName } from '@/utils/excludedDeals';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTriStateSort } from '@/hooks/useTriStateSort';
import { SortableHeader } from '@/components/ui/sortable-header';
import { format } from 'date-fns';
import { liquidGlassCard, liquidGlassKPI, liquidGlassSectionTitle } from '@/components/metrics/liquidGlass';
import { useOptionalSalesBdDateRange } from '@/contexts/SalesBdDateRangeContext';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTtmActivePipelineConversion } from '@/lib/salesBdActivePipelineConversion';
import { useDealReferralSources } from '@/hooks/useDealReferralSources';
import { useDealFirstActivityDates, filterByEffectiveDate } from '@/hooks/useDealFirstActivityDates';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const kpiCard = "h-full rounded-lg border border-border bg-card/60 p-4 flex flex-col gap-2 justify-between";

function KpiTile({ label, value, subtext, badge, onClick }: { label: React.ReactNode; value: string | number; subtext?: string; badge?: React.ReactNode; onClick?: () => void }) {
  return (
    <div
      className={`${kpiCard} ${onClick ? 'cursor-pointer transition-colors hover:border-[hsl(var(--chart-2)/0.5)] hover:bg-card/80' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#FFFFFF] leading-tight">
          {label}
        </p>
        {badge ?? (onClick ? <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap">Drill →</span> : null)}
      </div>
      <p className="text-3xl font-bold tabular-nums leading-none text-[#FFFFFF]">{value}</p>
      {subtext ? <p className="text-[11px] text-muted-foreground leading-snug">{subtext}</p> : null}
    </div>
  );
}

function formatCurrencyCompact(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toLocaleString()}`;
}

interface DealRow {
  id: string;
  company: string;
  value: number | null;
  stage: string | null;
  referred_by: string | null;
  sourced_via: string | null;
  created_at: string;
  closing_date: string | null;
}

export function ReferralSourceDeals({
  kpisOnly = false,
  hideKpis = false,
  kpiGridClassName,
}: {
  /** Render only the 6 KPI tiles (no title, no details table). */
  kpisOnly?: boolean;
  /** Render title + collapsible details only (skip the 6 KPI tiles). */
  hideKpis?: boolean;
  /** Override the grid class used for the KPI tiles. */
  kpiGridClassName?: string;
} = {}) {
  const { company } = useCompany();
  const dateCtx = useOptionalSalesBdDateRange();
  const rangeStart = dateCtx?.start ?? null;
  const rangeEnd = dateCtx?.end ?? null;

  const [showDetails, setShowDetails] = useState(false);
  const { sortField: sortCol, sortDir, handleSort } = useTriStateSort({
    field: 'created_at',
    direction: 'desc',
  });

  // Deals are fetched without a date filter — `created_at` is the CRM import
  // timestamp. Timeframe filtering uses each deal's effective activity date
  // (earliest stage-history event, else created_at) — same basis as
  // useDealReferralSources.
  const { data: dealsRaw = [] } = useQuery({
    queryKey: ['firm_pipeline_deals', company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { getNaitivePipelineId } = await import('@/utils/naitivePipelineExclusion');
      const naitivePipelineId = await getNaitivePipelineId();
      let query = supabase
        .from('deals')
        .select('id, company, value, stage, referred_by, sourced_via, created_at, closing_date, pipeline_id')
        .eq('company_id', company!.id);
      if (naitivePipelineId) query = query.neq('pipeline_id', naitivePipelineId);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as DealRow[];
    },
  });

  const dealIds = useMemo(() => dealsRaw.map(d => d.id), [dealsRaw]);
  const { data: firstActivityByDeal = new Map<string, string>() } = useDealFirstActivityDates(dealIds);
  const deals = useMemo(
    () => filterByEffectiveDate(dealsRaw, firstActivityByDeal, rangeStart, rangeEnd),
    [dealsRaw, firstActivityByDeal, rangeStart, rangeEnd],
  );

  // All deals in the result set already match sourced_via ~ 'Referral%'.
  const matchedDeals = deals;


  // "On Board" = deals that ENTERED (or became) the "NDA / Needs List Sent"
  // stage of the Active pipeline within the selected timeframe, sourced via
  // Referral. Entry date = the stage_enter event in deal_stage_history when
  // one exists, otherwise the deal's created_at (stage-history tracking is
  // recent, so most deals only have their creation date).
  const ACTIVE_PIPELINE_ID = 'b78ad452-b489-4c89-8a91-789347c05f79';
  const NDA_STAGE_ID = 'ndaneeds-list-sent';
  // Stages that imply the deal reached NDA / Needs List Sent. `on-hold` and
  // `closed-lost` are excluded because a deal can land there without ever
  // having reached the NDA stage.
  const REACHED_NDA_STAGES = [
    'ndaneeds-list-sent',
    'pre-credit-needs',
    'initial-lender-review',
    'initial-feedback',
    'proposal-in-development',
    'proposal-issued',
    'agreement-pending',
    'final-credit-items',
    'client-strategy-review',
    'write-up-pending',
    'submitted-to-lenders',
    'lenders-in-review',
    'terms-issued',
    'in-due-diligence',
    'funded-invoiced',
    'closed-won',
  ];

  // Firm-wide "Deals on the Board" — mirrors the Debt Advisory Metrics
  // calculation: distinct deals with a stage_enter into NDA / Needs List Sent
  // on the Active Pipeline within the timeframe, excluding John Moffitt-owned
  // or -authored entries and de-duped by company name. All acquisition
  // channels are included (not referral-only).
  const NDA_EXCLUDED_OWNERS = ['john moffitt'];
  const NDA_EXCLUDED_CHANGED_BY = ['2e65a4b1-bd94-46ef-87c6-9afe697b3180'];
  void REACHED_NDA_STAGES;

  const { data: onBoardDeals = [] } = useQuery({
    queryKey: [
      'firm_on_board_deals',
      company?.id,
      rangeStart?.toISOString() ?? null,
      rangeEnd?.toISOString() ?? null,
    ],
    enabled: !!company?.id,
    queryFn: async () => {
      const select = 'id, company, value, stage, referred_by, sourced_via, created_at, deal_owner';
      let hq = supabase
        .from('deal_stage_history')
        .select(`deal_id, changed_at, changed_by, pipeline_id, deals!inner(${select}, company_id, pipeline_id)`)
        .eq('event_type', 'stage_enter')
        .or(`to_stage_id.eq.${NDA_STAGE_ID},to_stage.eq.${NDA_STAGE_ID}`)
        .eq('deals.company_id', company!.id)
        .order('changed_at', { ascending: true });
      if (rangeStart) hq = hq.gte('changed_at', rangeStart.toISOString());
      if (rangeEnd) hq = hq.lte('changed_at', rangeEnd.toISOString());
      const { data, error } = await hq;
      if (error) throw error;

      const seenIds = new Set<string>();
      const seenNames = new Set<string>();
      const rows: DealRow[] = [];
      for (const r of (data || []) as any[]) {
        const d = r.deals;
        if (!d?.id) continue;
        if (r.pipeline_id && r.pipeline_id !== ACTIVE_PIPELINE_ID) continue;
        if (!r.pipeline_id && d.pipeline_id !== ACTIVE_PIPELINE_ID) continue;
        if (r.changed_by && NDA_EXCLUDED_CHANGED_BY.includes(r.changed_by)) continue;
        if (NDA_EXCLUDED_OWNERS.includes(String(d.deal_owner || '').toLowerCase().trim())) continue;
        if (isExcludedDealName(d.company)) continue;
        const nameKey = String(d.company || '').toLowerCase().trim();
        if (seenIds.has(d.id) || (nameKey && seenNames.has(nameKey))) continue;
        seenIds.add(d.id);
        if (nameKey) seenNames.add(nameKey);
        rows.push({
          id: d.id,
          company: d.company,
          value: d.value,
          stage: d.stage,
          referred_by: d.referred_by,
          sourced_via: d.sourced_via,
          created_at: r.changed_at,
          closing_date: null,
        });
      }
      rows.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      return rows;
    },
  });




  const totalValue = onBoardDeals.reduce((sum, d) => sum + (d.value || 0), 0);


  // Conversion Rate is TTM (trailing 12 months) and INDEPENDENT of the header
  // date filter — see useTtmActivePipelineConversion for the exact formula.
  const ttm = useTtmActivePipelineConversion({ kind: 'referral' });
  const conversionRateLabel = ttm.label;

  // Aggregate referral sources totals (unfiltered) to display alongside the
  // referral-deal KPIs. These are the same numbers previously shown at the top
  // of ReferralSourcesView.
  const { referralSources, totalCount: sourcesCount, totalDeals: sourcesDeals, totalVolume: sourcesVolume } =
    useDealReferralSources({ channelFilter: [], pipelineFilter: 'all' });

  const [drill, setDrill] = useState<null | 'deals' | 'value' | 'conversion' | 'sources' | 'sourceDeals' | 'volume'>(null);

  if (typeof window !== 'undefined') {
    (window as any).__salesBdReferralTtm = ttm;
  }

  const sorted = useMemo(() => {
    if (!sortCol || !sortDir) return matchedDeals;
    return [...matchedDeals].sort((a, b) => {
      let av: any, bv: any;
      switch (sortCol) {
        case 'company': av = a.company; bv = b.company; break;
        case 'value': av = a.value || 0; bv = b.value || 0; break;
        case 'stage': av = a.stage || ''; bv = b.stage || ''; break;
        case 'referred_by': av = a.referred_by || ''; bv = b.referred_by || ''; break;
        default: av = a.created_at; bv = b.created_at;
      }
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [matchedDeals, sortCol, sortDir]);

  const SortHeader = ({ col, children }: { col: string; children: React.ReactNode }) => (
    <SortableHeader
      field={col}
      activeField={sortCol}
      direction={sortDir}
      onSort={handleSort}
    >
      {children}
    </SortableHeader>
  );

  const drillMeta: Record<string, { title: string; kind: 'deals' | 'sources' | 'conversion' }> = {
    deals: { title: 'Deals on the Board · entered NDA / Needs List Sent', kind: 'deals' },
    value: { title: 'Dollars on the Board · entered NDA / Needs List Sent', kind: 'deals' },
    conversion: { title: 'Conversion Rate · trailing 12 months', kind: 'conversion' },
    sources: { title: 'Referral Sources · linked CRM records', kind: 'sources' },
    sourceDeals: { title: 'Referred Deals · by referral source', kind: 'sources' },
    volume: { title: 'Total Referred Volume · by referral source', kind: 'sources' },
  };

  const drillDialog = (
    <Dialog open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
      <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">{drill ? drillMeta[drill].title : ''}</DialogTitle>
        </DialogHeader>

        {drill && drillMeta[drill].kind === 'conversion' ? (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-border bg-card/60 p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Reached Final Credit</p>
                <p className="text-2xl font-bold tabular-nums text-[#FFFFFF]">{ttm.numerator}</p>
              </div>
              <div className="rounded-lg border border-border bg-card/60 p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Referral deals (TTM)</p>
                <p className="text-2xl font-bold tabular-nums text-[#FFFFFF]">{ttm.denominator}</p>
              </div>
              <div className="rounded-lg border border-border bg-card/60 p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Rate</p>
                <p className="text-2xl font-bold tabular-nums text-[#FFFFFF]">{conversionRateLabel}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Trailing-12-month conversion: active-pipeline deals sourced via Referral that reached the Final Credit
              Items stage, divided by all active-pipeline referral deals added in the trailing 12 months. Independent of
              the header date filter.
            </p>
          </div>
        ) : drill && drillMeta[drill].kind === 'sources' ? (
          referralSources.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No linked referral sources.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead>Source</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead className="text-right">Deals</TableHead>
                  <TableHead className="text-right">Volume</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...referralSources]
                  .sort((a, b) => (drill === 'sourceDeals' ? b.dealCount - a.dealCount : b.totalVolume - a.totalVolume))
                  .map((s) => (
                    <TableRow key={`${s.contactId ?? ''}-${s.crmCompanyId ?? ''}-${s.referredBy}`} className="border-border hover:bg-muted/40">
                      <TableCell className="text-sm font-medium text-foreground">{s.referredBy}</TableCell>
                      <TableCell className="text-sm text-foreground/80">{s.companyName || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{s.channelType || '—'}</TableCell>
                      <TableCell className="text-sm text-right tabular-nums">{s.dealCount}</TableCell>
                      <TableCell className="text-sm text-right tabular-nums">{formatCurrencyCompact(s.totalVolume)}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )
        ) : onBoardDeals.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No deals found.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead>Deal Name</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Referral Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...onBoardDeals]
                .sort((a, b) =>
                  drill === 'value'
                    ? (b.value || 0) - (a.value || 0)
                    : new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
                )
                .map((d) => (
                  <TableRow key={d.id} className="border-border hover:bg-muted/40">
                    <TableCell className="text-sm font-medium text-foreground">{d.company}</TableCell>
                    <TableCell className="text-sm text-right tabular-nums text-foreground/80">
                      {d.value ? `$${d.value.toLocaleString()}` : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{d.stage || '—'}</TableCell>
                    <TableCell className="text-sm text-foreground/80">{d.referred_by || d.sourced_via || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(d.created_at), 'MMM d, yyyy')}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );

  const kpiGrid = (
    <div
      className={
        kpiGridClassName ??
        'grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 mb-3'
      }
    >
        <KpiTile label="Deals on the Board" value={onBoardDeals.length} subtext="entered NDA / Needs List Sent" onClick={() => setDrill('deals')} />
        <KpiTile label="Dollars on the Board" value={formatCurrencyCompact(totalValue)} subtext="entered NDA / Needs List Sent" onClick={() => setDrill('value')} />


        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="cursor-help h-full">
                <KpiTile
                  label="Conversion Rate"
                  value={conversionRateLabel}
                  subtext="trailing 12 months"
                  onClick={() => setDrill('conversion')}
                  badge={
                    <span className="rounded-full border border-border/60 bg-muted/40 px-1.5 py-px text-[9px] font-medium text-muted-foreground">TTM</span>
                  }
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
              Trailing-12-month conversion rate: deals added to active pipeline sourced via Referral that reached the Final Credit Items stage, divided by all deals added to active pipeline sourced via Referral in the trailing 12 months. Independent of the header date filter.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <KpiTile label="Referral Sources" value={sourcesCount} subtext="linked CRM records" onClick={() => setDrill('sources')} />
        <KpiTile label="Referred Deals" value={sourcesDeals} subtext="across all referral sources" onClick={() => setDrill('sourceDeals')} />
        <KpiTile label="Total Referred Volume" value={formatCurrencyCompact(sourcesVolume)} subtext="across all referral sources" onClick={() => setDrill('volume')} />
    </div>
  );

  if (kpisOnly) {
    return (
      <>
        {kpiGrid}
        {drillDialog}
      </>
    );
  }


  return (
    <div>
      <h3 className={`${liquidGlassSectionTitle} mb-3`}>Referral-Source Deals</h3>

      {!hideKpis && kpiGrid}

      <Collapsible open={showDetails} onOpenChange={setShowDetails}>
        <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors mb-2">
          {showDetails ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          View Details ({matchedDeals.length} deals)
        </CollapsibleTrigger>
        <CollapsibleContent>
          {matchedDeals.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No deals found.</p>
          ) : (
            <div className={`${liquidGlassCard} overflow-hidden`}>
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <SortHeader col="company">Deal Name</SortHeader>
                    <SortHeader col="value">Amount</SortHeader>
                    <SortHeader col="stage">Stage</SortHeader>
                    <SortHeader col="referred_by">Referral Source</SortHeader>
                    <SortHeader col="created_at">Referral Date</SortHeader>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map(d => (
                    <TableRow key={d.id} className="border-border hover:bg-muted/40">
                      <TableCell className="text-sm text-foreground font-medium">{d.company}</TableCell>
                      <TableCell className="text-sm text-foreground/80">
                        {d.value ? `$${d.value.toLocaleString()}` : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{d.stage || '—'}</TableCell>
                      <TableCell className="text-sm text-foreground/80">{d.referred_by || d.sourced_via || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(d.created_at), 'MMM d, yyyy')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
      {drillDialog}
    </div>
  );
}