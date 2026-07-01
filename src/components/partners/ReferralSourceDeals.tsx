import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';

import { ChevronDown, ChevronRight, DollarSign, Hash, TrendingUp } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTriStateSort } from '@/hooks/useTriStateSort';
import { SortableHeader } from '@/components/ui/sortable-header';
import { format } from 'date-fns';
import { liquidGlassCard, liquidGlassKPI, liquidGlassSectionTitle } from '@/components/metrics/liquidGlass';
import { useOptionalSalesBdDateRange } from '@/contexts/SalesBdDateRangeContext';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTtmActivePipelineConversion } from '@/lib/salesBdActivePipelineConversion';

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

export function ReferralSourceDeals() {
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

  return (
    <div>
      <h3 className={`${liquidGlassSectionTitle} mb-3`}>Referral-Source Deals</h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        <div className={`${liquidGlassKPI} p-4 flex flex-col items-center`}>
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Hash className="h-3.5 w-3.5" /> Total Referred
          </div>
          <span className="text-2xl font-bold text-foreground">{matchedDeals.length}</span>
        </div>
        <div className={`${liquidGlassKPI} p-4 flex flex-col items-center`}>
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <DollarSign className="h-3.5 w-3.5" /> Referred Value
          </div>
          <span className="text-2xl font-bold text-foreground">
            {totalValue >= 1_000_000_000 ? `$${(totalValue / 1_000_000_000).toFixed(2)}B` : totalValue >= 1_000_000 ? `$${(totalValue / 1_000_000).toFixed(2)}MM` : totalValue >= 1_000 ? `$${(totalValue / 1_000).toFixed(2)}K` : `$${totalValue.toFixed(2)}`}
          </span>
        </div>
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={`${liquidGlassKPI} p-4 flex flex-col items-center cursor-help`}>
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <TrendingUp className="h-3.5 w-3.5" /> Conversion Rate
                  <span className="ml-1 rounded-full border border-border/60 bg-muted/40 px-1.5 py-px text-[10px] font-medium text-muted-foreground">
                    TTM
                  </span>
                </div>
                <span className="text-2xl font-bold text-foreground">{conversionRateLabel}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
              Trailing-12-month conversion rate: deals added to active pipeline sourced via Referral that reached the Final Credit Items stage, divided by all deals added to active pipeline sourced via Referral in the trailing 12 months. Independent of the header date filter.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

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