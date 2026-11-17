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
import { useTtmActivePipelineConversion, ttmAnchorFromTimeframeEnd } from '@/lib/salesBdActivePipelineConversion';
import { loadReferralDealsOnBoard } from '@/lib/dashboardTiles/referralDeals';
import { useInsightsTimeframeOptional } from '@/contexts/InsightsTimeframeContext';
import { useDealReferralSources } from '@/hooks/useDealReferralSources';
import { useDealFirstActivityDates, filterByEffectiveDate } from '@/hooks/useDealFirstActivityDates';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const kpiCard = "h-full rounded-lg border border-border bg-card/60 p-4 flex flex-col gap-2 justify-between";

function KpiTile({ label, value, subtext, badge, onClick }: { label: React.ReactNode; value: React.ReactNode; subtext?: string; badge?: React.ReactNode; onClick?: () => void }) {
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
      <div className="text-3xl font-bold tabular-nums leading-none text-[#FFFFFF]">{value}</div>
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
  kpiKeys,
}: {
  /** Restrict which KPI tiles render. */
  kpiKeys?: Array<'board' | 'conversion' | 'sources' | 'referred'>;
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


  // "On Board" = referral-sourced deals entering NDA / Needs List Sent on the
  // Active Pipeline within the timeframe (shared with the MCP dashboard tool).
  const { data: onBoardDeals = [] } = useQuery({
    queryKey: [
      'firm_on_board_deals',
      company?.id,
      rangeStart?.toISOString() ?? null,
      rangeEnd?.toISOString() ?? null,
    ],
    enabled: !!company?.id,
    queryFn: async (): Promise<DealRow[]> => (await loadReferralDealsOnBoard(supabase, company!.id, rangeStart, rangeEnd)) as DealRow[],
  });




  const totalValue = onBoardDeals.reduce((sum, d) => sum + (d.value || 0), 0);


  // Conversion Rate is rolling TTM anchored to the END of the header timeframe
  // (capped at today) — see useTtmActivePipelineConversion for the formula.
  const headerTf = useInsightsTimeframeOptional()?.timeframe;
  const ttmAsOf = useMemo(() => ttmAnchorFromTimeframeEnd(headerTf?.end), [headerTf?.end]);
  const ttm = useTtmActivePipelineConversion({ kind: 'referral', asOf: ttmAsOf });
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
        'grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3'
      }
    >
        {(!kpiKeys || kpiKeys.includes('board')) && <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="h-full">
                <KpiTile
                  label="Deals & Dollars on the Board"
                  value={`${onBoardDeals.length} · ${formatCurrencyCompact(totalValue)}`}
                  onClick={() => setDrill('deals')}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">entered NDA / Needs List Sent</TooltipContent>
          </Tooltip>
        </TooltipProvider>}


        {(!kpiKeys || kpiKeys.includes('conversion')) && <TooltipProvider delayDuration={200}>
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
              Trailing-12-month conversion rate: deals added to active pipeline sourced via Referral that reached the Final Credit Items stage, divided by all deals added to active pipeline sourced via Referral in the 12 months ending at the close of the selected header timeframe.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>}
        {(!kpiKeys || kpiKeys.includes('sources')) && <KpiTile label="Referral Sources" value={sourcesCount} subtext="linked CRM records" onClick={() => setDrill('sources')} />}
        {(!kpiKeys || kpiKeys.includes('referred')) && (() => {
          const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '—');
          return (
            <KpiTile
              label="Referred Deals"
              value={
                <span className="inline-flex items-start gap-3">
                  <span className="flex flex-col items-start">
                    <span>{sourcesDeals}</span>
                    <span className="mt-1 text-[11px] font-medium text-muted-foreground" title={`${sourcesDeals} of ${onBoardDeals.length} deals on the board`}>{pct(sourcesDeals, onBoardDeals.length)}</span>
                  </span>
                  <span>·</span>
                  <span className="flex flex-col items-start">
                    <span>{formatCurrencyCompact(sourcesVolume)}</span>
                    <span className="mt-1 text-[11px] font-medium text-muted-foreground" title={`${formatCurrencyCompact(sourcesVolume)} of ${formatCurrencyCompact(totalValue)} on the board`}>{pct(sourcesVolume, totalValue)}</span>
                  </span>
                </span>
              }
              onClick={() => setDrill('sourceDeals')}
            />
          );
        })()}
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