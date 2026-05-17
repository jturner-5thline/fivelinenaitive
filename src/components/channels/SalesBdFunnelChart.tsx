import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useChannelEntries } from '@/hooks/useChannelEntries';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import {
  FunnelChart, Funnel, LabelList, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { liquidGlassCard, LIQUID_GLASS_SERIES } from '@/components/metrics/liquidGlass';
import { Link } from 'react-router-dom';
import { Building2, UserCheck, Network, ExternalLink, TrendingDown, TrendingUp } from 'lucide-react';

// ── Types ──
type Period = '30d' | 'qtd' | 'last-q' | '6m' | '12m';
type GroupBy = 'channels' | 'companies' | 'sources';

interface FunnelDeal {
  id: string;
  company: string | null;
  value: number | null;
  stage: string | null;
  status: string | null;
  referred_by: string | null;
  sourced_via: string | null;
  crm_company_id: string | null;
  created_at: string;
}

interface StageDef { key: string; label: string; rank: number; }

const STAGES: StageDef[] = [
  { key: 'added',     label: 'Deals Added',              rank: 1 },
  { key: 'nda',       label: 'NDA / Needs List Sent +',  rank: 2 },
  { key: 'proposal',  label: 'Proposal Issued +',        rank: 3 },
  { key: 'submitted', label: 'Submitted to Lenders +',   rank: 4 },
  { key: 'terms',     label: 'Terms Issued +',           rank: 5 },
  { key: 'funded',    label: 'Funded / Closed Won',      rank: 6 },
];

function rankFor(stage: string | null | undefined): number {
  const s = (stage || '').toLowerCase();
  if (/funded|invoiced|closed.?won/.test(s) && !/not/.test(s)) return 6;
  if (/terms.?issued|due.?diligence/.test(s)) return 5;
  if (/submit.*lender|lenders.?in.?review/.test(s)) return 4;
  if (/proposal|agreement.?pending|final.?credit|client.?strategy|write.?up/.test(s)) return 3;
  if (/nda|needs.?list/.test(s)) return 2;
  return 1;
}

function periodRange(p: Period): { start: Date; end: Date } {
  const now = new Date();
  const d = new Date(now);
  if (p === '30d')     { d.setDate(now.getDate() - 30); return { start: d, end: now }; }
  if (p === '6m')      { d.setMonth(now.getMonth() - 6); return { start: d, end: now }; }
  if (p === '12m')     { d.setMonth(now.getMonth() - 12); return { start: d, end: now }; }
  if (p === 'qtd') {
    const q = Math.floor(now.getMonth() / 3);
    return { start: new Date(now.getFullYear(), q * 3, 1), end: now };
  }
  // last-q
  const q = Math.floor(now.getMonth() / 3);
  const start = new Date(now.getFullYear(), (q - 1) * 3, 1);
  const end   = new Date(now.getFullYear(), q * 3, 1);
  return { start, end };
}

function priorRange(p: Period): { start: Date; end: Date } {
  const cur = periodRange(p);
  const len = cur.end.getTime() - cur.start.getTime();
  return { start: new Date(cur.start.getTime() - len), end: cur.start };
}

function fmtMoney(n: number) {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

// ── Component ──
export function SalesBdFunnelChart() {
  const { company } = useCompany();
  const [period, setPeriod] = useState<Period>('12m');
  const [groupBy, setGroupBy] = useState<GroupBy>('channels');
  const [compare, setCompare] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [drillStage, setDrillStage] = useState<StageDef | null>(null);

  const { data: channelEntries = [] } = useChannelEntries();

  const { data: deals = [], isLoading } = useQuery({
    queryKey: ['sales_bd_funnel_deals', company?.id],
    enabled: !!company?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('id, company, value, stage, status, referred_by, sourced_via, crm_company_id, created_at')
        .eq('company_id', company!.id)
        .neq('status', 'archived');
      if (error) throw error;
      return (data || []) as FunnelDeal[];
    },
  });

  // Map deal → group label
  const groupForDeal = useMemo(() => {
    const nameToChannel = new Map<string, string>();
    const idToChannel = new Map<string, string>();
    channelEntries.forEach(ce => {
      const n = (ce.crm_company?.name || ce.contact?.full_name || '').toLowerCase().trim();
      if (n) nameToChannel.set(n, ce.channel_type);
      if (ce.crm_company_id) idToChannel.set(ce.crm_company_id, ce.channel_type);
    });
    return (d: FunnelDeal): string | null => {
      if (groupBy === 'sources') return (d.referred_by || d.sourced_via || '').trim() || null;
      if (groupBy === 'companies') return (d.company || '').trim() || null;
      // channels
      if (d.crm_company_id && idToChannel.has(d.crm_company_id)) return idToChannel.get(d.crm_company_id)!;
      const ref = (d.referred_by || d.sourced_via || '').toLowerCase().trim();
      if (ref && nameToChannel.has(ref)) return nameToChannel.get(ref)!;
      for (const [k, v] of nameToChannel) {
        if (ref && (ref.includes(k) || k.includes(ref))) return v;
      }
      return null;
    };
  }, [channelEntries, groupBy]);

  // Filter deals by current/prior windows
  const { current, prior } = useMemo(() => {
    const cur = periodRange(period);
    const prv = priorRange(period);
    const inRange = (d: FunnelDeal, r: { start: Date; end: Date }) => {
      const t = new Date(d.created_at).getTime();
      return t >= r.start.getTime() && t <= r.end.getTime();
    };
    const match = (d: FunnelDeal) => {
      if (!selected) return true;
      return groupForDeal(d) === selected;
    };
    return {
      current: deals.filter(d => inRange(d, cur) && match(d)),
      prior:   deals.filter(d => inRange(d, prv) && match(d)),
    };
  }, [deals, period, selected, groupForDeal]);

  // Compute funnel rows
  const buildRows = (set: FunnelDeal[]) => {
    return STAGES.map((s, i) => {
      const subset = set.filter(d => rankFor(d.stage) >= s.rank);
      const count = subset.length;
      const volume = subset.reduce((a, d) => a + (d.value || 0), 0);
      // top contributors
      const tally = new Map<string, number>();
      subset.forEach(d => {
        const g = groupForDeal(d) || 'Unattributed';
        tally.set(g, (tally.get(g) || 0) + 1);
      });
      const contributors = [...tally.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, n]) => ({ name, n }));
      return { ...s, idx: i, count, volume, contributors, deals: subset };
    });
  };

  const rows = useMemo(() => buildRows(current), [current, groupForDeal]);
  const priorRows = useMemo(() => (compare ? buildRows(prior) : []), [compare, prior, groupForDeal]);

  const max = Math.max(1, ...rows.map(r => r.count));

  const funnelData = rows.map((r, i) => ({
    name: r.label,
    value: Math.max(r.count, 1),
    actualCount: r.count,
    volume: r.volume,
    conversion: i === 0 ? 100 : rows[i - 1].count > 0 ? Math.round((r.count / rows[i - 1].count) * 100) : 0,
    contributors: r.contributors,
    fill: LIQUID_GLASS_SERIES[i % LIQUID_GLASS_SERIES.length],
    stage: r,
  }));

  // Legend items
  const legend = useMemo(() => {
    const tally = new Map<string, number>();
    current.forEach(d => {
      const g = groupForDeal(d);
      if (!g) return;
      tally.set(g, (tally.get(g) || 0) + 1);
    });
    return [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [current, groupForDeal]);

  const PERIOD_PILLS: { v: Period; l: string }[] = [
    { v: '30d', l: '30D' }, { v: 'qtd', l: 'QTD' }, { v: 'last-q', l: 'Last Q' },
    { v: '6m', l: '6M' }, { v: '12m', l: '12M' },
  ];

  const GROUP_PILLS: { v: GroupBy; l: string; icon: any }[] = [
    { v: 'channels', l: 'Channels', icon: Network },
    { v: 'companies', l: 'Companies', icon: Building2 },
    { v: 'sources', l: 'Referral Sources', icon: UserCheck },
  ];

  return (
    <div className={`${liquidGlassCard} p-4 space-y-4`}>
      {/* Header + Controls */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-semibold tracking-tight">Pipeline Funnel</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Deal progression by stage{selected ? ` · filtered to ${selected}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Time range */}
          <div className="flex items-center bg-card border border-border rounded-lg p-0.5 gap-0.5">
            {PERIOD_PILLS.map(p => (
              <button
                key={p.v}
                onClick={() => setPeriod(p.v)}
                className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors ${
                  period === p.v
                    ? 'bg-primary/15 text-primary border border-primary/25'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {p.l}
              </button>
            ))}
          </div>
          {/* Group by */}
          <div className="flex items-center bg-card border border-border rounded-lg p-0.5 gap-0.5">
            {GROUP_PILLS.map(g => {
              const Icon = g.icon;
              return (
                <button
                  key={g.v}
                  onClick={() => { setGroupBy(g.v); setSelected(null); }}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors ${
                    groupBy === g.v
                      ? 'bg-primary/15 text-primary border border-primary/25'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {g.l}
                </button>
              );
            })}
          </div>
          {/* Compare */}
          <div className="flex items-center gap-1.5">
            <Switch id="cmp" checked={compare} onCheckedChange={setCompare} />
            <Label htmlFor="cmp" className="text-[10px] text-muted-foreground cursor-pointer">
              Compare to prior
            </Label>
          </div>
        </div>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="space-y-2">
          {STAGES.map((_, i) => <Skeleton key={i} className="h-8 w-full" style={{ maxWidth: `${100 - i * 12}%` }} />)}
        </div>
      ) : current.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-sm text-muted-foreground">No deals in this window</p>
          {(selected || period !== '12m') && (
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => { setSelected(null); setPeriod('12m'); }}>
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-4">
          {/* Funnel */}
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <FunnelChart>
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 8,
                    fontSize: 11,
                  }}
                  content={({ active, payload }: any) => {
                    if (!active || !payload?.[0]) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-popover border border-border rounded-md p-2.5 shadow-lg min-w-[200px]">
                        <p className="text-xs font-semibold text-foreground">{d.name}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {d.actualCount} deals · {fmtMoney(d.volume)} · {d.conversion}% conv.
                        </p>
                        {d.contributors?.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-border/40 space-y-0.5">
                            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Top {groupBy}</p>
                            {d.contributors.map((c: any) => (
                              <div key={c.name} className="flex justify-between text-[10px]">
                                <span className="truncate text-foreground/80">{c.name}</span>
                                <span className="text-muted-foreground tabular-nums ml-2">{c.n}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }}
                />
                {compare && priorRows.length > 0 && (
                  <Funnel
                    dataKey="value"
                    data={priorRows.map((r, i) => ({
                      name: r.label, value: Math.max(r.count, 1),
                      fill: 'hsl(var(--muted))',
                    }))}
                    isAnimationActive
                  />
                )}
                <Funnel
                  dataKey="value"
                  data={funnelData}
                  isAnimationActive
                  onClick={(d: any) => setDrillStage(d?.stage || null)}
                  cursor="pointer"
                >
                  <LabelList
                    position="right"
                    fill="hsl(var(--foreground))"
                    stroke="none"
                    fontSize={11}
                    dataKey={(entry: any) =>
                      `${entry.name} — ${entry.actualCount} · ${fmtMoney(entry.volume)} (${entry.conversion}%)`
                    }
                  />
                  {funnelData.map((entry, i) => {
                    const prior = priorRows[i]?.count;
                    const delta = prior != null && prior > 0
                      ? Math.round(((entry.actualCount - prior) / prior) * 100)
                      : null;
                    return <Cell key={i} fill={entry.fill} />;
                  })}
                </Funnel>
              </FunnelChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div className="border border-border/40 rounded-md p-2 bg-background/30 space-y-1 max-h-[320px] overflow-y-auto">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground px-1 pb-1">
              {groupBy} ({legend.length})
            </p>
            {legend.length === 0 && (
              <p className="text-[10px] text-muted-foreground px-1">No {groupBy} attributed</p>
            )}
            {legend.map(([name, n]) => (
              <button
                key={name}
                onClick={() => setSelected(selected === name ? null : name)}
                className={`w-full flex items-center justify-between text-left px-2 py-1 rounded text-[11px] transition-colors ${
                  selected === name
                    ? 'bg-primary/15 text-primary'
                    : 'hover:bg-muted/60 text-foreground/80'
                }`}
              >
                <span className="truncate">{name}</span>
                <span className="ml-2 tabular-nums text-muted-foreground">{n}</span>
              </button>
            ))}
            {selected && (
              <button
                onClick={() => setSelected(null)}
                className="w-full text-[10px] text-muted-foreground hover:text-foreground py-1 mt-1 border-t border-border/40"
              >
                Clear selection
              </button>
            )}
          </div>
        </div>
      )}

      {/* Compare deltas */}
      {compare && !isLoading && current.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-2 border-t border-border/40">
          {rows.map((r, i) => {
            const p = priorRows[i]?.count ?? 0;
            const delta = p > 0 ? Math.round(((r.count - p) / p) * 100) : null;
            const up = (delta ?? 0) >= 0;
            return (
              <div key={r.key} className="text-center">
                <p className="text-[9px] text-muted-foreground truncate">{r.label}</p>
                <p className="text-[11px] font-medium flex items-center justify-center gap-1">
                  {delta == null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <Badge variant="outline" className={`text-[10px] gap-0.5 ${up ? 'text-emerald-400 border-emerald-400/30' : 'text-red-400 border-red-400/30'}`}>
                      {up ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                      {up ? '+' : ''}{delta}%
                    </Badge>
                  )}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Drilldown */}
      <Sheet open={!!drillStage} onOpenChange={(o) => !o && setDrillStage(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{drillStage?.label}</SheetTitle>
            <SheetDescription>
              Deals at this stage or later · {period.toUpperCase()}
              {selected ? ` · ${selected}` : ''}
            </SheetDescription>
          </SheetHeader>
          {drillStage && (() => {
            const stageDeals = current.filter(d => rankFor(d.stage) >= drillStage.rank);
            if (stageDeals.length === 0) {
              return <p className="text-sm text-muted-foreground py-8 text-center">No deals.</p>;
            }
            return (
              <div className="mt-4 border border-border/40 rounded-md overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr className="text-left text-[10px] uppercase text-muted-foreground">
                      <th className="px-2 py-1.5">Deal</th>
                      <th className="px-2 py-1.5">Stage</th>
                      <th className="px-2 py-1.5 text-right">Value</th>
                      <th className="px-2 py-1.5">Source</th>
                      <th className="px-2 py-1.5 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {stageDeals.map(d => (
                      <tr key={d.id} className="border-t border-border/40 hover:bg-muted/30">
                        <td className="px-2 py-1.5 truncate max-w-[180px]">{d.company || '—'}</td>
                        <td className="px-2 py-1.5 text-muted-foreground truncate max-w-[140px]">{d.stage || '—'}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{d.value ? fmtMoney(d.value) : '—'}</td>
                        <td className="px-2 py-1.5 text-muted-foreground truncate max-w-[140px]">{d.referred_by || d.sourced_via || '—'}</td>
                        <td className="px-2 py-1.5">
                          <Link to={`/deals/${d.id}`} className="text-primary hover:underline">
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}