import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { usePartners } from '@/hooks/usePartnersPipeline';

import { ChevronDown, ChevronRight, DollarSign, Hash, TrendingUp } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTriStateSort } from '@/hooks/useTriStateSort';
import { SortableHeader } from '@/components/ui/sortable-header';
import { format } from 'date-fns';
import { liquidGlassCard, liquidGlassSectionTitle } from '@/components/metrics/liquidGlass';
import { useOptionalSalesBdDateRange } from '@/contexts/SalesBdDateRangeContext';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTtmActivePipelineConversion } from '@/lib/salesBdActivePipelineConversion';
import { useDealFirstActivityDates, filterByEffectiveDate } from '@/hooks/useDealFirstActivityDates';


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

const kpiCard = [
  "[container-type:inline-size] relative isolate rounded-xl overflow-hidden p-4",
  "border border-[hsl(260,40%,50%,0.12)]",
  "ring-1 ring-inset ring-white/[0.05]",
  "bg-[linear-gradient(145deg,hsl(260,25%,16%,0.72)_0%,hsl(255,20%,11%,0.58)_50%,hsl(250,18%,9%,0.65)_100%)]",
  "backdrop-blur-2xl backdrop-saturate-150",
  "shadow-[0_2px_4px_hsl(0,0%,0%,0.2),0_8px_32px_hsl(260,40%,8%,0.5)]",
  "hover:border-[hsl(263,50%,55%,0.2)] transition-all duration-300",
].join(" ");

const metricValueClass =
  "font-bold font-mono tabular-nums text-foreground truncate text-[clamp(1rem,2.2cqi+0.75rem,1.5rem)]";

function formatCurrencyCompact(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toLocaleString()}`;
}

interface PartnerSourcedDealsProps {
  kpisOnly?: boolean;
  hideKpis?: boolean;
  kpiGridClassName?: string;
}

export function PartnerSourcedDeals({
  kpisOnly = false,
  hideKpis = false,
  kpiGridClassName,
}: PartnerSourcedDealsProps = {}) {
  const { company } = useCompany();
  const { data: partners = [] } = usePartners();
  const dateCtx = useOptionalSalesBdDateRange();
  const rangeStart = dateCtx?.start ?? null;
  const rangeEnd = dateCtx?.end ?? null;
  const granularity = dateCtx?.range.granularity ?? null;
  
  const [showDetails, setShowDetails] = useState(false);
  const { sortField: sortCol, sortDir, handleSort } = useTriStateSort({
    field: 'created_at',
    direction: 'desc',
  });

  // Get all deal names that could match partners/referral sources
  const partnerNames = useMemo(
    () => new Set(partners.map(p => p.name.toLowerCase())),
    [partners]
  );

  // Timeframe filtering uses each deal's effective activity date (earliest
  // stage-history event, else created_at) — same basis as the referral metrics.
  const { data: dealsRaw = [] } = useQuery({
    queryKey: ['partner_referred_deals', company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { getNaitivePipelineId } = await import('@/utils/naitivePipelineExclusion');
      const naitivePipelineId = await getNaitivePipelineId();
      let query = supabase
        .from('deals')
        .select('id, company, value, stage, referred_by, sourced_via, created_at, closing_date, pipeline_id')
        .eq('company_id', company!.id)
        .not('referred_by', 'is', null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dealsRaw, firstActivityByDeal, rangeStart, rangeEnd, granularity],
  );


  // Filter deals that match partner/referral source names
  const matchedDeals = useMemo(() => {
    return deals.filter(d => {
      const ref = (d.referred_by || d.sourced_via || '').toLowerCase();
      return ref && partnerNames.has(ref);
    });
  }, [deals, partnerNames]);

  const totalValue = matchedDeals.reduce((sum, d) => sum + (d.value || 0), 0);

  // Conversion Rate is TTM and independent of the header date filter.
  // Denominator mirrors the "partner-sourced" definition used by Total Referred:
  // a deal whose referred_by matches a known partner name.
  const partnerNamesList = useMemo(() => partners.map(p => p.name), [partners]);
  const ttm = useTtmActivePipelineConversion({
    kind: 'partner',
    partnerNames: partnerNamesList,
    enabled: partnerNamesList.length > 0,
  });
  const conversionRateLabel = ttm.label;

  if (typeof window !== 'undefined') {
    (window as any).__salesBdPartnerTtm = ttm;
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
    <div className={kpiGridClassName ?? 'grid grid-cols-1 md:grid-cols-3 gap-3 mb-3'}>
      <div className={kpiCard}>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-[hsl(263,60%,55%,0.15)] shrink-0">
            <Hash className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className={metricValueClass}>{matchedDeals.length}</p>
            <p className="text-[10px] text-muted-foreground truncate">Total Referred</p>
          </div>
        </div>
      </div>
      <div className={kpiCard}>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-[hsl(160,65%,45%,0.15)] shrink-0">
            <DollarSign className="h-4 w-4" style={{ color: 'hsl(160, 65%, 45%)' }} />
          </div>
          <div className="min-w-0">
            <p className={metricValueClass}>{formatCurrencyCompact(totalValue)}</p>
            <p className="text-[10px] text-muted-foreground truncate">Referred Value</p>
          </div>
        </div>
      </div>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`${kpiCard} cursor-help`}>
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-[hsl(38,92%,55%,0.15)] shrink-0">
                  <TrendingUp className="h-4 w-4" style={{ color: 'hsl(38, 92%, 55%)' }} />
                </div>
                <div className="min-w-0">
                  <p className={metricValueClass}>{conversionRateLabel}</p>
                  <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                    Conversion Rate
                    <span className="rounded-full border border-border/60 bg-muted/40 px-1 py-px text-[9px] font-medium">TTM</span>
                  </p>
                </div>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
            Trailing-12-month conversion rate: deals added to active pipeline sourced via Partner that reached the Final Credit Items stage, divided by all deals added to active pipeline sourced via Partner in the trailing 12 months. Independent of the header date filter.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );

  if (kpisOnly) {
    return kpiGrid;
  }

  const details = (
    <Collapsible open={showDetails} onOpenChange={setShowDetails}>
        <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors mb-2">
          {showDetails ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          View Details ({matchedDeals.length} deals)
        </CollapsibleTrigger>
        <CollapsibleContent>
          {matchedDeals.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No partner-referred deals found.</p>
          ) : (
            <div className={`${liquidGlassCard} overflow-hidden`}>
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <SortHeader col="company">Deal Name</SortHeader>
                    <SortHeader col="value">Amount</SortHeader>
                    <SortHeader col="stage">Stage</SortHeader>
                    <SortHeader col="referred_by">Referring Partner</SortHeader>
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
  );

  return (
    <div>
      {!hideKpis && kpiGrid}
      {details}
    </div>
  );
}
