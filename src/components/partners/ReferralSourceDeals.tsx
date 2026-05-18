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
import { liquidGlassCard, liquidGlassKPI, liquidGlassSectionTitle } from '@/components/metrics/liquidGlass';

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
  const { data: partners = [] } = usePartners();

  const [showDetails, setShowDetails] = useState(false);
  const { sortField: sortCol, sortDir, handleSort } = useTriStateSort({
    field: 'created_at',
    direction: 'desc',
  });

  const partnerNames = useMemo(
    () => new Set(partners.map(p => p.name.toLowerCase())),
    [partners]
  );

  const { data: deals = [] } = useQuery({
    queryKey: ['referral_source_deals', company?.id],
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

  // Referral-source deals: have a referred_by value but it does NOT match a known partner name.
  const matchedDeals = useMemo(() => {
    return deals.filter(d => {
      const ref = (d.referred_by || d.sourced_via || '').trim().toLowerCase();
      if (!ref) return false;
      return !partnerNames.has(ref);
    });
  }, [deals, partnerNames]);

  const totalValue = matchedDeals.reduce((sum, d) => sum + (d.value || 0), 0);
  const conversionRate = deals.length > 0 ? Math.round((matchedDeals.length / deals.length) * 100) : 0;

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
        <div className={`${liquidGlassKPI} p-4 flex flex-col items-center`}>
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <TrendingUp className="h-3.5 w-3.5" /> Conversion Rate
          </div>
          <span className="text-2xl font-bold text-foreground">{conversionRate}%</span>
        </div>
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