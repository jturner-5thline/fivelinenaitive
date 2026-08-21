import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDealReferralSources, type DealReferralSourceEntry } from '@/hooks/useDealReferralSources';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatSlug } from '@/utils/dealTypeLabels';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { DollarSign, Users, TrendingUp, Briefcase, ChevronDown, ChevronUp, X, RotateCcw, ExternalLink, Pencil, Search, ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';
import { format } from 'date-fns';
import { ReferralSourceEditDialog } from './ReferralSourceEditDialog';
import { Input } from '@/components/ui/input';
import { useTriStateSort } from '@/hooks/useTriStateSort';

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
type TierValue = typeof TIER_OPTIONS[number]['value'];

function formatCurrency(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toLocaleString()}`;
}

const glassCard = [
  "relative isolate rounded-lg overflow-hidden",
  "border border-[rgba(126,184,247,0.22)]",
  "bg-[#0b1226]",
  "shadow-[inset_0_1px_0_rgba(200,225,255,0.09),0_1px_2px_rgba(0,0,0,0.32),0_12px_32px_-16px_rgba(0,0,0,0.62)]",
].join(" ");

const glassCardKPI = [
  glassCard,
  "hover:bg-[#101836] hover:border-[rgba(126,184,247,0.4)]",
  "hover:shadow-[inset_0_1px_0_rgba(200,225,255,0.12),0_2px_4px_rgba(0,0,0,0.4),0_18px_40px_-16px_rgba(0,0,0,0.7)]",
  "transition-all duration-200",
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

function SortHeaderCell({
  field,
  sortField,
  sortDir,
  onSort,
  align = 'left',
  children,
}: {
  field: string;
  sortField: string | null;
  sortDir: 'asc' | 'desc' | null;
  onSort: (f: string) => void;
  align?: 'left' | 'right';
  children: React.ReactNode;
}) {
  const active = sortField === field && !!sortDir;
  const Icon = !active ? ChevronsUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className={`p-3 text-muted-foreground font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${active ? 'text-foreground' : ''} ${align === 'right' ? 'flex-row-reverse' : ''}`}
      >
        <span>{children}</span>
        <Icon className={`h-3 w-3 ${active ? 'opacity-100' : 'opacity-40'}`} />
      </button>
    </th>
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
            <p className="text-muted-foreground text-[10px]">{deal.pipelineName} · {formatSlug(deal.stage)}</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${deal.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : deal.status === 'archived' ? 'bg-muted text-muted-foreground' : 'bg-amber-500/10 text-amber-400'}`}>
              {formatSlug(deal.status)}
            </span>
            <span className="font-mono tabular-nums text-foreground">{formatCurrency(deal.value)}</span>
            <ExternalLink className="h-3 w-3 text-muted-foreground" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ReferralSourcesView({ hideKpis = false, initialSearch }: { hideKpis?: boolean; initialSearch?: string } = {}) {
  const [channelFilter, setChannelFilter] = useState<string[]>([]);
  const [pipelineFilter, setPipelineFilter] = useState<'all' | 'active' | 'in-development'>('all');
  const [tierFilter, setTierFilter] = useState<TierValue[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<DealReferralSourceEntry | null>(null);
  const [quickView, setQuickView] = useState<QuickViewTarget | null>(null);
  const [search, setSearch] = useState(initialSearch || '');
  useEffect(() => {
    if (typeof initialSearch === 'string') setSearch(initialSearch);
  }, [initialSearch]);
  const { sortField, sortDir, handleSort } = useTriStateSort({ field: 'totalVolume', direction: 'desc' });

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
    // Prefer manual override from referral_sources table; otherwise use the
    // hook's computed tier (sales_bd_rules-driven).
    const manual = tierLookup.get(norm(entry.referredBy));
    if (manual) return manual;
    return entry.tier ? `Tier ${entry.tier}` : null;
  };

  const [companyFilter, setCompanyFilter] = useState<string[]>([]);
  const filteredSources = useMemo(() => {
    let list = referralSources;
    if (companyFilter.length) {
      list = list.filter(r => r.companyName && companyFilter.includes(r.companyName));
    }
    if (tierFilter.length > 0) {
      list = list.filter(r => {
        const t = getTier(r);
        return !!t && tierFilter.includes(t as TierValue);
      });
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(r =>
        r.referredBy.toLowerCase().includes(q) ||
        (r.companyName || '').toLowerCase().includes(q) ||
        (r.channelType || '').toLowerCase().includes(q) ||
        (r.latestDeal.company || '').toLowerCase().includes(q) ||
        (r.latestDeal.stage || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [referralSources, companyFilter, tierFilter, tierLookup, search]);

  const sortedSources = useMemo(() => {
    if (!sortField || !sortDir) return filteredSources;
    const dir = sortDir === 'asc' ? 1 : -1;
    const tierRank = (t: string | null) => {
      if (t === 'Tier 1') return 1;
      if (t === 'Tier 2') return 2;
      if (t === 'Tier 3') return 3;
      return 99;
    };
    const val = (r: DealReferralSourceEntry): string | number => {
      switch (sortField) {
        case 'referredBy': return r.referredBy.toLowerCase();
        case 'companyName': return (r.companyName || '').toLowerCase();
        case 'channelType': return (r.channelType || '').toLowerCase();
        case 'tier': return tierRank(getTier(r));
        case 'dealCount': return r.dealCount;
        case 'totalVolume': return r.totalVolume;
        case 'latestDeal': return (r.latestDeal.company || '').toLowerCase();
        case 'stage': return (r.latestDeal.stage || '').toLowerCase();
        default: return 0;
      }
    };
    return [...filteredSources].sort((a, b) => {
      const av = val(a); const bv = val(b);
      if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
  }, [filteredSources, sortField, sortDir, tierLookup]);

  const hasActiveFilters = channelFilter.length > 0 || companyFilter.length > 0 || pipelineFilter !== 'all' || tierFilter.length > 0 || search.length > 0;
  const clearAll = () => { setChannelFilter([]); setCompanyFilter([]); setPipelineFilter('all'); setTierFilter([]); setSearch(''); };

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
        {/* Pipeline filter (single-select dropdown) */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={`h-7 text-xs gap-1.5 border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] ${pipelineFilter !== 'all' ? 'border-primary/30 text-foreground' : 'text-muted-foreground'}`}
            >
              {pipelineFilter === 'all' ? 'All Pipelines' : pipelineFilter === 'active' ? 'Active' : 'In Development'}
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-1" align="start">
            {([
              { value: 'all', label: 'All Pipelines' },
              { value: 'active', label: 'Active' },
              { value: 'in-development', label: 'In Development' },
            ] as { value: 'all' | 'active' | 'in-development'; label: string }[]).map(p => (
              <button
                key={p.value}
                onClick={() => setPipelineFilter(p.value)}
                className={`w-full text-left px-2 py-1.5 rounded-md text-xs hover:bg-accent/40 ${pipelineFilter === p.value ? 'text-primary font-medium' : 'text-foreground'}`}
              >
                {p.label}
              </button>
            ))}
          </PopoverContent>
        </Popover>

        <div className="h-4 w-px bg-white/[0.08]" />

        <MultiSelectFilter
          label="Channels"
          options={CHANNEL_OPTIONS}
          selected={channelFilter}
          onChange={setChannelFilter}
        />

        {/* Tier filter (multi-select) */}
        <MultiSelectFilter
          label="All Tiers"
          options={TIER_OPTIONS.map(t => ({ value: t.value, label: t.label }))}
          selected={tierFilter}
          onChange={(v) => setTierFilter(v as TierValue[])}
        />

        {companyOptions.length > 0 && (
          <MultiSelectFilter
            label="Companies"
            options={companyOptions}
            selected={companyFilter}
            onChange={setCompanyFilter}
          />
        )}

        <div className="relative ml-auto">
          <Search className="h-3 w-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sources…"
            className="h-7 pl-7 pr-7 text-xs w-52 bg-white/[0.03] border-white/[0.08]"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

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
      {!hideKpis && (
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
      )}

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
            <h3 className="text-sm font-medium text-foreground">Referral Sources</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {sortedSources.length} source{sortedSources.length !== 1 ? 's' : ''} · Click headers to sort · Click any row to expand deals
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/[0.06] bg-[hsl(260,18%,12%,0.4)] backdrop-blur-sm">
                  <th className="text-left p-3 text-muted-foreground font-medium w-8"></th>
                  <SortHeaderCell field="referredBy" sortField={sortField} sortDir={sortDir} onSort={handleSort}>Referral Source</SortHeaderCell>
                  <SortHeaderCell field="companyName" sortField={sortField} sortDir={sortDir} onSort={handleSort}>Company</SortHeaderCell>
                  <SortHeaderCell field="channelType" sortField={sortField} sortDir={sortDir} onSort={handleSort}>Channel</SortHeaderCell>
                  <SortHeaderCell field="tier" sortField={sortField} sortDir={sortDir} onSort={handleSort}>Tier</SortHeaderCell>
                  <SortHeaderCell field="dealCount" sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right">Deals</SortHeaderCell>
                  <SortHeaderCell field="totalVolume" sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right">Volume</SortHeaderCell>
                  <SortHeaderCell field="latestDeal" sortField={sortField} sortDir={sortDir} onSort={handleSort}>Latest Deal</SortHeaderCell>
                  <SortHeaderCell field="stage" sortField={sortField} sortDir={sortDir} onSort={handleSort}>Stage</SortHeaderCell>
                  <th className="text-right p-3 text-muted-foreground font-medium w-10"></th>
                </tr>
              </thead>
              <tbody>
                {sortedSources.map((entry) => {
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
                        <td className="p-3 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            onClick={(e) => { e.stopPropagation(); setEditTarget(entry); }}
                            title="Edit referral source"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={10} className="p-0">
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

      <ReferralSourceEditDialog
        open={!!editTarget}
        onOpenChange={(v) => { if (!v) setTimeout(() => setEditTarget(null), 200); }}
        referredBy={editTarget?.referredBy ?? ''}
        initialCompany={editTarget?.companyName}
      />
    </div>
  );
}
