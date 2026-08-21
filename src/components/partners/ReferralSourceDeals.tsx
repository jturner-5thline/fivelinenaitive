import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';

import { ChevronDown, ChevronRight, DollarSign, Hash, TrendingUp, Users, Briefcase } from 'lucide-react';
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

const kpiCard = "h-full rounded-lg border border-border bg-card/60 p-4 flex flex-col gap-2 justify-between";

function KpiTile({ label, value, subtext, badge }: { label: React.ReactNode; value: string | number; subtext?: string; badge?: React.ReactNode }) {
  return (
    <div className={kpiCard}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground leading-tight">
          {label}
        </p>
        {badge}
      </div>
      <p className="text-3xl font-bold tabular-nums leading-none text-[hsl(var(--chart-2))]">{value}</p>
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

  const { data: deals = [] } = useQuery({
    queryKey: [
      'referral_source_deals',
      company?.id,
      rangeStart?.toISOString() ?? null,
      rangeEnd?.toISOString() ?? null,
    ],
    enabled: !!company?.id,
    queryFn: async () => {
      const { getNaitivePipelineId } = await import('@/utils/naitivePipelineExclusion');
      const naitivePipelineId = await getNaitivePipelineId();
      let query = supabase
        .from('deals')
        .select('id, company, value, stage, referred_by, sourced_via, created_at, closing_date, pipeline_id')
        .eq('company_id', company!.id)
        .ilike('sourced_via', 'referral%');
      if (naitivePipelineId) query = query.neq('pipeline_id', naitivePipelineId);
      if (rangeStart) query = query.gte('created_at', rangeStart.toISOString());
      if (rangeEnd) query = query.lte('created_at', rangeEnd.toISOString());
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as DealRow[];
    },
  });

  // All deals in the result set already match sourced_via ~ 'Referral%'.
  const matchedDeals = deals;
  const totalValue = matchedDeals.reduce((sum, d) => sum + (d.value || 0), 0);

  // Conversion Rate is TTM (trailing 12 months) and INDEPENDENT of the header
  // date filter — see useTtmActivePipelineConversion for the exact formula.
  const ttm = useTtmActivePipelineConversion({ kind: 'referral' });
  const conversionRateLabel = ttm.label;

  // Aggregate referral sources totals (unfiltered) to display alongside the
  // referral-deal KPIs. These are the same numbers previously shown at the top
  // of ReferralSourcesView.
  const { totalCount: sourcesCount, totalDeals: sourcesDeals, totalVolume: sourcesVolume } =
    useDealReferralSources({ channelFilter: [], pipelineFilter: 'all' });

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

  const kpiGrid = (
    <div
      className={
        kpiGridClassName ??
        'grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 mb-3'
      }
    >
        <KpiTile label="Total Referred" value={matchedDeals.length} subtext="deals in selected timeframe" />
        <KpiTile label="Referred Value" value={formatCurrencyCompact(totalValue)} subtext="deal value in selected timeframe" />
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="cursor-help h-full">
                <KpiTile
                  label="Conversion Rate"
                  value={conversionRateLabel}
                  subtext="trailing 12 months"
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
        <KpiTile label="Referral Sources" value={sourcesCount} subtext="linked CRM records" />
        <KpiTile label="Referred Deals" value={sourcesDeals} subtext="across all referral sources" />
        <KpiTile label="Total Referred Volume" value={formatCurrencyCompact(sourcesVolume)} subtext="across all referral sources" />
    </div>
  );

  if (kpisOnly) {
    return kpiGrid;
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
            <p className="text-sm text-muted-foreground py-4 text-center">No referral-source deals found.</p>
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
    </div>
  );
}