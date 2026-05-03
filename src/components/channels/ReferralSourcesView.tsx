import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDealReferralSources, type DealReferralSourceEntry } from '@/hooks/useDealReferralSources';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DollarSign, Users, TrendingUp, Briefcase, ChevronDown, ChevronUp, X, RotateCcw, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';

const CHANNEL_OPTIONS = [
  { value: 'Banks', label: 'Banks' },
  { value: 'M&A and Investment Bankers', label: 'M&A / IB' },
  { value: 'Service Providers', label: 'Service Providers' },
  { value: 'Investors', label: 'Investors' },
];

const TIER_OPTIONS = [
  { value: 'Tier 1', label: 'Tier 1' },
  { value: 'Tier 2', label: 'Tier 2' },
  { value: 'Tier 3', label: 'Tier 3' },
] as const;
type TierValue = typeof TIER_OPTIONS[number]['value'] | 'all';

function formatCurrency(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toLocaleString()}`;
}

const glassCard = [
  "relative isolate rounded-xl overflow-hidden",
  "border border-[hsl(260,40%,50%,0.12)]",
  "ring-1 ring-inset ring-white/[0.05]",
  "bg-[linear-gradient(145deg,hsl(260,25%,16%,0.72)_0%,hsl(255,20%,11%,0.58)_50%,hsl(250,18%,9%,0.65)_100%)]",
  "backdrop-blur-2xl backdrop-saturate-150",
  "shadow-[0_2px_4px_hsl(0,0%,0%,0.2),0_8px_32px_hsl(260,40%,8%,0.5)]",
  "before:pointer-events-none before:absolute before:inset-0 before:rounded-xl",
  "before:bg-[linear-gradient(175deg,hsl(0,0%,100%,0.07)_0%,transparent_50%)]",
  "after:pointer-events-none after:absolute after:inset-0 after:rounded-xl",
  "after:bg-[radial-gradient(ellipse_at_50%_100%,hsl(263,50%,40%,0.06)_0%,transparent_70%)]",
].join(" ");

const glassCardKPI = [
  glassCard,
  "hover:border-[hsl(263,50%,55%,0.2)] hover:shadow-[0_2px_4px_hsl(0,0%,0%,0.2),0_12px_40px_hsl(260,50%,10%,0.55)]",
  "transition-all duration-300",
].join(" ");

function MultiSelectFilter({ label, options, selected, onChange }: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (val: string) => {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`h-7 text-xs gap-1.5 border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] ${selected.length > 0 ? 'border-primary/30 text-foreground' : 'text-muted-foreground'}`}
        >
          {label}
          {selected.length > 0 && (
            <Badge variant="secondary" className="h-4 px-1 text-[9px] rounded-full bg-primary/20 text-primary">
              {selected.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2" align="start">
        <ScrollArea className="max-h-48">
          {options.map(opt => (
            <label
              key={opt.value}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent/40 cursor-pointer text-xs"
            >
              <Checkbox
                checked={selected.includes(opt.value)}
                onCheckedChange={() => toggle(opt.value)}
                className="h-3.5 w-3.5"
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </ScrollArea>
        {selected.length > 0 && (
          <Button variant="ghost" size="sm" className="w-full mt-1 h-6 text-[10px]" onClick={() => onChange([])}>
            Clear selection
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ExpandedDeals({ entry }: { entry: DealReferralSourceEntry }) {
  const navigate = useNavigate();
  return (
    <div className="px-4 pb-4 space-y-2">
      {entry.deals.map(deal => (
        <div
          key={deal.id}
          className="flex items-center justify-between gap-4 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] cursor-pointer transition-colors text-xs"
          onClick={() => navigate(`/deal/${deal.id}`)}
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground truncate">{deal.company}</p>
            <p className="text-muted-foreground text-[10px]">{deal.pipelineName} · {deal.stage}</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${deal.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : deal.status === 'archived' ? 'bg-muted text-muted-foreground' : 'bg-amber-500/10 text-amber-400'}`}>
              {deal.status}
            </span>
            <span className="font-mono tabular-nums text-foreground">{formatCurrency(deal.value)}</span>
            <ExternalLink className="h-3 w-3 text-muted-foreground" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ReferralSourcesView() {
  const [channelFilter, setChannelFilter] = useState<string[]>([]);
  const [pipelineFilter, setPipelineFilter] = useState<'all' | 'active' | 'in-development'>('all');
  const [tierFilter, setTierFilter] = useState<TierValue>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { referralSources, isLoading, totalCount, totalVolume, totalDeals, companyOptions } = useDealReferralSources({
    channelFilter,
    pipelineFilter,
  });

  const { company } = useCompany();
  const { data: tierRows = [] } = useQuery({
    queryKey: ['referral_source_tiers', company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('referral_sources')
        .select('name, contact_name, tier')
        .eq('company_id', company!.id);
      if (error) throw error;
      return (data || []) as { name: string | null; contact_name: string | null; tier: string | null }[];
    },
  });

  const tierLookup = useMemo(() => {
    const m = new Map<string, string>();
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
    for (const r of tierRows) {
      if (!r.tier) continue;
      if (r.name) m.set(norm(r.name), r.tier);
      if (r.contact_name) m.set(norm(r.contact_name), r.tier);
    }
    return m;
  }, [tierRows]);

  const getTier = (entry: DealReferralSourceEntry): string | null => {
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
    return tierLookup.get(norm(entry.referredBy)) || null;
  };

  const [companyFilter, setCompanyFilter] = useState<string[]>([]);
  const filteredSources = useMemo(() => {
    let list = referralSources;
    if (companyFilter.length) {
      list = list.filter(r => r.companyName && companyFilter.includes(r.companyName));
    }
    if (tierFilter !== 'all') {
      list = list.filter(r => getTier(r) === tierFilter);
    }
    return list;
  }, [referralSources, companyFilter, tierFilter, tierLookup]);

  const hasActiveFilters = channelFilter.length > 0 || companyFilter.length > 0 || pipelineFilter !== 'all' || tierFilter !== 'all';
  const clearAll = () => { setChannelFilter([]); setCompanyFilter([]); setPipelineFilter('all'); setTierFilter('all'); };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Pipeline filter */}
        <div className="flex items-center bg-[hsl(260,20%,14%,0.5)] backdrop-blur-xl border border-[hsl(260,30%,45%,0.1)] ring-1 ring-inset ring-white/[0.03] rounded-lg p-0.5 gap-0.5 shadow-[0_2px_8px_hsl(0,0%,0%,0.2)]">
          {[
            { value: 'all' as const, label: 'All Pipelines' },
            { value: 'active' as const, label: 'Active' },
            { value: 'in-development' as const, label: 'In Development' },
          ].map(p => (
            <button
              key={p.value}
              onClick={() => setPipelineFilter(p.value)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all duration-200 ${
                pipelineFilter === p.value
                  ? 'bg-[hsl(263,60%,55%,0.2)] text-primary shadow-[0_0_8px_hsl(263,60%,55%,0.15)] border border-[hsl(263,50%,55%,0.15)]'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.05]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-white/[0.08]" />

        <MultiSelectFilter
          label="Channels"
          options={CHANNEL_OPTIONS}
          selected={channelFilter}
          onChange={setChannelFilter}
        />

        {/* Tier filter */}
        <div className="flex items-center bg-[hsl(260,20%,14%,0.5)] backdrop-blur-xl border border-[hsl(260,30%,45%,0.1)] ring-1 ring-inset ring-white/[0.03] rounded-lg p-0.5 gap-0.5 shadow-[0_2px_8px_hsl(0,0%,0%,0.2)]">
          {([
            { value: 'all', label: 'All Tiers' },
            ...TIER_OPTIONS,
          ] as { value: TierValue; label: string }[]).map(t => (
            <button
              key={t.value}
              onClick={() => setTierFilter(t.value)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all duration-200 ${
                tierFilter === t.value
                  ? 'bg-[hsl(263,60%,55%,0.2)] text-primary shadow-[0_0_8px_hsl(263,60%,55%,0.15)] border border-[hsl(263,50%,55%,0.15)]'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.05]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {companyOptions.length > 0 && (
          <MultiSelectFilter
            label="Companies"
            options={companyOptions}
            selected={companyFilter}
            onChange={setCompanyFilter}
          />
        )}

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[11px] text-muted-foreground hover:text-foreground gap-1"
            onClick={clearAll}
          >
            <RotateCcw className="h-3 w-3" />
            Clear all
          </Button>
        )}
      </div>

      {/* Active filter chips */}
      {(channelFilter.length > 0 || companyFilter.length > 0) && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {channelFilter.map(ct => {
            const label = CHANNEL_OPTIONS.find(o => o.value === ct)?.label || ct;
            return (
              <Badge key={ct} variant="secondary" className="text-[10px] gap-1 pl-2 pr-1 py-0.5 bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 cursor-pointer" onClick={() => setChannelFilter(prev => prev.filter(v => v !== ct))}>
                {label} <X className="h-2.5 w-2.5" />
              </Badge>
            );
          })}
          {companyFilter.map(c => (
            <Badge key={c} variant="secondary" className="text-[10px] gap-1 pl-2 pr-1 py-0.5 bg-accent/20 text-accent-foreground border-accent/20 hover:bg-accent/30 cursor-pointer" onClick={() => setCompanyFilter(prev => prev.filter(v => v !== c))}>
              {c} <X className="h-2.5 w-2.5" />
            </Badge>
          ))}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className={`${glassCardKPI} p-4 space-y-2`}>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-[hsl(263,60%,55%,0.15)]">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="relative z-10 text-2xl font-bold font-mono tabular-nums text-foreground">{filteredSources.length}</p>
              <p className="relative z-10 text-[10px] text-muted-foreground">Referral Sources</p>
            </div>
          </div>
        </div>
        <div className={`${glassCardKPI} p-4 space-y-2`}>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-[hsl(160,65%,45%,0.15)]">
              <Briefcase className="h-4 w-4" style={{ color: 'hsl(160, 65%, 45%)' }} />
            </div>
            <div>
              <p className="relative z-10 text-2xl font-bold font-mono tabular-nums text-foreground">{filteredSources.reduce((s, r) => s + r.dealCount, 0)}</p>
              <p className="relative z-10 text-[10px] text-muted-foreground">Referred Deals</p>
            </div>
          </div>
        </div>
        <div className={`${glassCardKPI} p-4 space-y-2`}>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-[hsl(38,92%,55%,0.15)]">
              <DollarSign className="h-4 w-4" style={{ color: 'hsl(38, 92%, 55%)' }} />
            </div>
            <div>
              <p className="relative z-10 text-2xl font-bold font-mono tabular-nums text-foreground">{formatCurrency(filteredSources.reduce((s, r) => s + r.totalVolume, 0))}</p>
              <p className="relative z-10 text-[10px] text-muted-foreground">Total Referred Volume</p>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      {filteredSources.length === 0 ? (
        <div className={`${glassCard} p-12 text-center space-y-3`}>
          <Users className="h-8 w-8 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">No referral sources found.</p>
          <p className="text-xs text-muted-foreground/60">
            Referral sources appear here when deals in Active or In Development pipelines have a "Referred by" value.
          </p>
        </div>
      ) : (
        <div className={`${glassCard} overflow-hidden`}>
          <div className="relative z-10 p-4 border-b border-white/[0.06]">
            <h3 className="text-sm font-medium text-foreground">Referral Sources — Sorted by Volume</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {filteredSources.length} source{filteredSources.length !== 1 ? 's' : ''} · Click any row to expand deals
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/[0.06] bg-[hsl(260,18%,12%,0.4)] backdrop-blur-sm">
                  <th className="text-left p-3 text-muted-foreground font-medium w-8"></th>
                  <th className="text-left p-3 text-muted-foreground font-medium">Referral Source</th>
                  <th className="text-left p-3 text-muted-foreground font-medium">Company</th>
                  <th className="text-left p-3 text-muted-foreground font-medium">Channel</th>
                  <th className="text-left p-3 text-muted-foreground font-medium">Tier</th>
                  <th className="text-right p-3 text-muted-foreground font-medium">Deals</th>
                  <th className="text-right p-3 text-muted-foreground font-medium">Volume</th>
                  <th className="text-left p-3 text-muted-foreground font-medium">Latest Deal</th>
                  <th className="text-left p-3 text-muted-foreground font-medium">Stage</th>
                </tr>
              </thead>
              <tbody>
                {filteredSources.map((entry) => {
                  const isExpanded = expandedId === entry.referredBy;
                  return (
                    <React.Fragment key={entry.referredBy}>
                      <tr
                        className="border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors cursor-pointer"
                        onClick={() => setExpandedId(isExpanded ? null : entry.referredBy)}
                      >
                        <td className="p-3">
                          {isExpanded
                            ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                            : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                        </td>
                        <td className="p-3 font-medium text-foreground">{entry.referredBy}</td>
                        <td className="p-3 text-muted-foreground">{entry.companyName || '—'}</td>
                        <td className="p-3">
                          {entry.channelType ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-muted-foreground">
                              {entry.channelType === 'M&A and Investment Bankers' ? 'M&A / IB' : entry.channelType}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </td>
                        <td className="p-3">
                          {(() => {
                            const tier = getTier(entry);
                            if (!tier) return <span className="text-muted-foreground/50">—</span>;
                            const tone = tier === 'Tier 1'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : tier === 'Tier 2'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                              : 'bg-white/[0.06] text-muted-foreground border-white/[0.08]';
                            return (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${tone}`}>{tier}</span>
                            );
                          })()}
                        </td>
                        <td className="p-3 text-right font-mono tabular-nums">
                          <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary px-1.5">
                            {entry.dealCount}
                          </Badge>
                        </td>
                        <td className="p-3 text-right font-mono tabular-nums text-foreground font-medium">
                          {formatCurrency(entry.totalVolume)}
                        </td>
                        <td className="p-3 text-muted-foreground truncate max-w-[140px]">
                          {entry.latestDeal.company}
                        </td>
                        <td className="p-3">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-muted-foreground">
                            {entry.latestDeal.stage}
                          </span>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={9} className="p-0">
                            <ExpandedDeals entry={entry} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
