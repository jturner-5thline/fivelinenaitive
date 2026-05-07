import { useMemo, useState } from 'react';
import { Deal } from '@/types/deal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList,
  PieChart, Pie,
} from 'recharts';
import { format } from 'date-fns';

const ICP_CATEGORIES = ['Debt Advisory', 'M&A', 'Equity', 'Placement Agent', 'Broker', 'Other'] as const;
const PROSPECT_TYPES = ['Decision Maker', 'Gatekeeper', 'Connector', 'Market Intelligence'] as const;

const ICP_HEX: Record<string, string> = {
  'Debt Advisory': '#3b82f6',
  'M&A': '#a855f7',
  'Equity': '#22c55e',
  'Placement Agent': '#f97316',
  'Broker': '#14b8a6',
  'Other': '#9ca3af',
};

const PROSPECT_HEX: Record<string, string> = {
  'Decision Maker': '#3b82f6',
  'Gatekeeper': '#f59e0b',
  'Connector': '#22c55e',
  'Market Intelligence': '#a855f7',
};

const OUTCOMES = ['Not a fit', 'Tabled', 'Feedback only', 'Disqualified'] as const;

const REASONS = [
  'Wrong persona — not the deal executor',
  'Wrong segment — vertical CRM solves the problem',
  'Built own solution — DIY platform or AI workflows in place',
  'Entrenched stack — switching cost too high',
  'Product gap — specific feature missing',
  'Timing',
  'No close attempt made',
] as const;

const REASON_SHORT: Record<string, string> = {
  'Wrong persona — not the deal executor': 'Wrong persona',
  'Wrong segment — vertical CRM solves the problem': 'Wrong segment',
  'Built own solution — DIY platform or AI workflows in place': 'Built own solution',
  'Entrenched stack — switching cost too high': 'Entrenched stack',
  'Product gap — specific feature missing': 'Product gap',
  'Timing': 'Timing',
  'No close attempt made': 'No close attempt',
};

const TOOLTIP_STYLE = {
  background: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 8,
  fontSize: 12,
  color: 'hsl(var(--foreground))',
  padding: '8px 10px',
} as const;

function normalizeOutcome(o?: string): typeof OUTCOMES[number] | null {
  if (!o) return null;
  const v = o.toLowerCase();
  if (v.includes('not a fit') || v.includes('not-a-fit')) return 'Not a fit';
  if (v.includes('tabled')) return 'Tabled';
  if (v.includes('feedback')) return 'Feedback only';
  if (v.includes('disqual')) return 'Disqualified';
  return null;
}

function splitReasons(value?: string): string[] {
  if (!value) return [];
  return value
    .split(/\n|;|\u2022|,/g)
    .map((s) => s.replace(/^[-*\s]+/, '').trim())
    .filter(Boolean);
}

function matchReason(raw: string): string | null {
  const v = raw.toLowerCase();
  const hit = REASONS.find((r) => {
    const head = r.split('—')[0].trim().toLowerCase();
    return v.includes(head);
  });
  return hit || null;
}

interface Props {
  deals: Deal[];
}

export function NaitiveDidNotMoveInsights({ deals }: Props) {
  const filtered = useMemo(
    () => deals.filter((d) => normalizeOutcome(d.outcome) !== null),
    [deals],
  );

  // Cross-chart filters — clicking any chart element toggles the corresponding filter
  const [reasonFilter, setReasonFilter] = useState<string | null>(null);
  const [cellFilter, setCellFilter] = useState<{ icp: string; outcome: string } | null>(null);
  const [prospectFilter, setProspectFilter] = useState<string | null>(null);

  const toggle = <T,>(curr: T | null, next: T, eq: (a: T, b: T) => boolean) =>
    curr && eq(curr, next) ? null : next;

  const feedDeals = useMemo(() => {
    return filtered.filter((d) => {
      if (reasonFilter) {
        const tokens = splitReasons(d.whyNotMovingForward)
          .map((t) => matchReason(t))
          .filter(Boolean) as string[];
        if (!tokens.includes(reasonFilter)) return false;
      }
      if (cellFilter) {
        const icp = (ICP_CATEGORIES as readonly string[]).includes(d.icpCategory || '')
          ? (d.icpCategory as string)
          : 'Other';
        const o = normalizeOutcome(d.outcome);
        if (icp !== cellFilter.icp || o !== cellFilter.outcome) return false;
      }
      if (prospectFilter) {
        if ((d.prospectType || '') !== prospectFilter) return false;
      }
      return true;
    });
  }, [filtered, reasonFilter, cellFilter, prospectFilter]);

  const hasFilter = !!(reasonFilter || cellFilter || prospectFilter);
  const clearAll = () => { setReasonFilter(null); setCellFilter(null); setProspectFilter(null); };

  // Reason counts
  const reasonRows = useMemo(() => {
    const counts = new Map<string, number>();
    REASONS.forEach((r) => counts.set(r, 0));
    for (const d of filtered) {
      const tokens = splitReasons(d.whyNotMovingForward);
      for (const t of tokens) {
        const m = matchReason(t);
        if (m) counts.set(m, (counts.get(m) || 0) + 1);
      }
    }
    const total = Array.from(counts.values()).reduce((s, n) => s + n, 0);
    return Array.from(counts.entries())
      .map(([reason, count]) => ({
        reason,
        short: REASON_SHORT[reason],
        count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [filtered]);

  const topReason = reasonRows[0]?.count ? reasonRows[0] : null;

  // Outcome × ICP heatmap
  const heatmap = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    ICP_CATEGORIES.forEach((icp) => {
      map[icp] = {};
      OUTCOMES.forEach((o) => (map[icp][o] = 0));
    });
    let max = 0;
    for (const d of filtered) {
      const icp = (ICP_CATEGORIES as readonly string[]).includes(d.icpCategory || '')
        ? (d.icpCategory as string)
        : 'Other';
      const o = normalizeOutcome(d.outcome);
      if (!o) continue;
      map[icp][o]++;
      if (map[icp][o] > max) max = map[icp][o];
    }
    return { map, max };
  }, [filtered]);

  // Prospect type pie
  const prospectData = useMemo(() => {
    const counts: Record<string, number> = {};
    PROSPECT_TYPES.forEach((p) => (counts[p] = 0));
    for (const d of filtered) {
      const p = (PROSPECT_TYPES as readonly string[]).includes(d.prospectType || '')
        ? (d.prospectType as string)
        : null;
      if (p) counts[p]++;
    }
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    return PROSPECT_TYPES.map((p) => ({
      name: p,
      value: counts[p],
      pct: total > 0 ? Math.round((counts[p] / total) * 100) : 0,
      color: PROSPECT_HEX[p],
    }));
  }, [filtered]);

  const prospectTotal = prospectData.reduce((s, x) => s + x.value, 0);

  // AI insights
  const insights = useMemo(() => {
    const out: string[] = [];
    const totalNonProgress = filtered.length;

    // 1) Actual #1 disqualification reason with count + pct
    if (topReason && topReason.count > 0) {
      out.push(
        `${topReason.short} is your #1 disqualification reason — ${topReason.count} ${
          topReason.count === 1 ? 'deal' : 'deals'
        } (${topReason.pct}% of all reasons logged). Consider whether this is a specific feature gap or a positioning issue.`,
      );
    }

    // 2) Most common ICP × Outcome cell across the entire heatmap
    let topCell: { icp: string; outcome: string; n: number } | null = null;
    ICP_CATEGORIES.forEach((icp) => {
      OUTCOMES.forEach((o) => {
        const n = heatmap.map[icp][o];
        if (n > 0 && (!topCell || n > topCell.n)) topCell = { icp, outcome: o, n };
      });
    });
    if (topCell) {
      const pct = totalNonProgress > 0 ? Math.round((topCell.n / totalNonProgress) * 100) : 0;
      out.push(
        `${topCell.icp} → ${topCell.outcome} is your most common non-progression pattern — ${topCell.n} ${
          topCell.n === 1 ? 'deal' : 'deals'
        } (${pct}% of non-progressions). ${
          topCell.outcome === 'Feedback only'
            ? 'Valuable for market research but not converting — reduce time investment.'
            : topCell.outcome === 'Not a fit' || topCell.outcome === 'Disqualified'
            ? 'Re-evaluate ICP fit or upstream qualification for this segment.'
            : 'Investigate what is stalling this segment.'
        }`,
      );
    }

    // 3) Persona targeting callout with exact counts
    const gate = prospectData.find((p) => p.name === 'Gatekeeper');
    const mi = prospectData.find((p) => p.name === 'Market Intelligence');
    const gateMICount = (gate?.value || 0) + (mi?.value || 0);
    const gateMIPct = (gate?.pct || 0) + (mi?.pct || 0);
    if (gateMIPct > 30 && gateMICount > 0) {
      out.push(
        `Gatekeepers + Market Intelligence account for ${gateMICount} ${
          gateMICount === 1 ? 'deal' : 'deals'
        } (${gateMIPct}% of non-progressions) — a targeting signal worth addressing upstream.`,
      );
    }

    if (out.length === 0)
      out.push('Not enough non-progression data yet — patterns will appear as deals are dispositioned.');
    return out.slice(0, 3);
  }, [topReason, heatmap, prospectData, filtered.length]);

  // Heatmap color (cell intensity)
  const cellStyle = (count: number) => {
    if (count === 0) return { background: 'hsl(var(--muted) / 0.3)', color: 'hsl(var(--muted-foreground))' };
    const intensity = heatmap.max > 0 ? count / heatmap.max : 0;
    const opacity = 0.15 + intensity * 0.65;
    return {
      background: `hsl(var(--destructive) / ${opacity})`,
      color: intensity > 0.5 ? 'hsl(var(--destructive-foreground))' : 'hsl(var(--foreground))',
    };
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-foreground">Calls That Did Not Move and Why</h3>
        <p className="text-sm text-muted-foreground">
          Every prospect that didn't progress. Over time this surfaces disqualification patterns and
          tells us whether our ICP definition is right or needs adjusting.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 1 - Top Disqualification Reasons */}
        <Card>
          <CardHeader className="pb-3 pt-5 px-5">
            <CardTitle className="text-base font-semibold tracking-tight text-foreground">
              Top Disqualification Reasons
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 pt-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground py-8 text-center">No data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={reasonRows}
                  layout="vertical"
                  margin={{ top: 4, right: 48, left: 4, bottom: 4 }}
                  barCategoryGap={8}
                >
                  <XAxis type="number" hide allowDecimals={false} />
                  <YAxis
                    dataKey="short"
                    type="category"
                    width={130}
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'hsl(var(--muted) / 0.25)' }}
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v: number, _n, ctx: any) => {
                      const r = ctx?.payload;
                      return [`${v} (${r?.pct ?? 0}%)`, r?.reason || 'Reason'];
                    }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {reasonRows.map((r, i) => (
                      <Cell
                        key={r.reason}
                        fill={i === 0 && r.count > 0 ? 'hsl(var(--destructive))' : 'hsl(var(--muted-foreground) / 0.6)'}
                        cursor={r.count > 0 ? 'pointer' : 'default'}
                        opacity={reasonFilter && reasonFilter !== r.reason ? 0.4 : 1}
                        onClick={() => {
                          if (r.count > 0) setReasonFilter((prev) => (prev === r.reason ? null : r.reason));
                        }}
                      />
                    ))}
                    <LabelList
                      dataKey="count"
                      position="right"
                      formatter={(v: number, _e: any, ctx: any) => {
                        const pct = ctx?.payload?.pct ?? 0;
                        return v > 0 ? `${v}  ${pct}%` : '';
                      }}
                      style={{ fontSize: 11, fill: 'hsl(var(--foreground))' }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* 2 - Outcome x ICP Heatmap */}
        <Card>
          <CardHeader className="pb-3 pt-5 px-5">
            <CardTitle className="text-base font-semibold tracking-tight text-foreground">
              Which ICPs Aren't Converting?
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 pt-1">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-separate" style={{ borderSpacing: 4 }}>
                <thead>
                  <tr>
                    <th className="text-left font-medium text-muted-foreground pb-1">ICP</th>
                    {OUTCOMES.map((o) => (
                      <th key={o} className="font-medium text-muted-foreground pb-1 text-center">
                        {o}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ICP_CATEGORIES.map((icp) => (
                    <tr key={icp}>
                      <td className="text-foreground font-medium pr-2 whitespace-nowrap">{icp}</td>
                      {OUTCOMES.map((o) => {
                        const count = heatmap.map[icp][o];
                        const active = cellFilter?.icp === icp && cellFilter?.outcome === o;
                        return (
                          <td
                            key={o}
                            className={
                              'text-center font-mono rounded-md py-2 min-w-[40px] ' +
                              (count > 0 ? 'cursor-pointer transition-all ' : '') +
                              (active ? 'ring-2 ring-primary ring-offset-1 ring-offset-card' : '')
                            }
                            style={{
                              ...cellStyle(count),
                              opacity: cellFilter && !active ? 0.5 : 1,
                            }}
                            onClick={() => {
                              if (count > 0) setCellFilter((prev) => (prev?.icp === icp && prev?.outcome === o ? null : { icp, outcome: o }));
                            }}
                          >
                            {count}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* 3 - Prospect Type Donut */}
        <Card>
          <CardHeader className="pb-3 pt-5 px-5">
            <CardTitle className="text-base font-semibold tracking-tight text-foreground">
              Who Are We Talking To That Isn't Moving?
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 pt-1">
            {prospectTotal === 0 ? (
              <p className="text-xs text-muted-foreground py-8 text-center">No data yet.</p>
            ) : (
              <div className="flex items-center gap-4">
                <div className="w-[55%] min-w-0">
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={prospectData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={40}
                        outerRadius={72}
                        paddingAngle={2}
                        onClick={(slice: any) => {
                          const name = slice?.name;
                          if (!name) return;
                          const v = prospectData.find((p) => p.name === name)?.value || 0;
                          if (v > 0) setProspectFilter((prev) => (prev === name ? null : name));
                        }}
                      >
                        {prospectData.map((p) => (
                          <Cell
                            key={p.name}
                            fill={p.color}
                            cursor={p.value > 0 ? 'pointer' : 'default'}
                            opacity={prospectFilter && prospectFilter !== p.name ? 0.4 : 1}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(v: number, _n, ctx: any) => [
                          `${v} (${ctx?.payload?.pct ?? 0}%)`,
                          ctx?.payload?.name,
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-2 min-w-0 flex-1">
                  {prospectData.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      disabled={p.value === 0}
                      onClick={() =>
                        setProspectFilter((prev) => (prev === p.name ? null : p.name))
                      }
                      className={
                        'flex items-center gap-2 text-xs text-left rounded px-1 py-0.5 transition-colors ' +
                        (p.value === 0 ? 'opacity-50 cursor-default' : 'hover:bg-muted/40 ') +
                        (prospectFilter === p.name ? 'bg-muted/60 ' : '')
                      }
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                        style={{ background: p.color }}
                      />
                      <span className="text-muted-foreground truncate">{p.name}</span>
                      <span className="font-semibold text-foreground tabular-nums ml-auto">{p.pct}%</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Individual record feed */}
      <Card>
        <CardHeader className="pb-3 pt-5 px-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base font-semibold tracking-tight text-foreground">
              Records — did not progress
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {feedDeals.length} of {filtered.length}
              </span>
            </CardTitle>
            {hasFilter && (
              <div className="flex flex-wrap items-center gap-1.5">
                {reasonFilter && (
                  <Badge variant="secondary" className="text-[10px] gap-1">
                    Reason: {REASON_SHORT[reasonFilter] || reasonFilter}
                    <button onClick={() => setReasonFilter(null)} className="hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {cellFilter && (
                  <Badge variant="secondary" className="text-[10px] gap-1">
                    {cellFilter.icp} · {cellFilter.outcome}
                    <button onClick={() => setCellFilter(null)} className="hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {prospectFilter && (
                  <Badge variant="secondary" className="text-[10px] gap-1">
                    Persona: {prospectFilter}
                    <button onClick={() => setProspectFilter(null)} className="hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={clearAll}>
                  Clear
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-5 pt-1">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4">No records yet.</p>
          ) : feedDeals.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4">
              No records match the current filter.{' '}
              <button onClick={clearAll} className="underline text-primary">Clear filters</button>
            </p>
          ) : (
            <div className="max-h-[420px] overflow-y-auto pr-1 space-y-2">
              {[...feedDeals]
                .sort(
                  (a, b) =>
                    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
                )
                .map((d) => {
                  const outcome = normalizeOutcome(d.outcome);
                  const reasons = splitReasons(d.whyNotMovingForward)
                    .map((r) => matchReason(r))
                    .filter(Boolean) as string[];
                  const icpColor = ICP_HEX[d.icpCategory || 'Other'] || ICP_HEX.Other;
                  const prospect = (PROSPECT_TYPES as readonly string[]).includes(d.prospectType || '')
                    ? (d.prospectType as string)
                    : null;
                  return (
                    <div
                      key={d.id}
                      className="rounded-md border border-border bg-card/40 p-3 space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-foreground truncate">
                            {d.company || d.name}
                          </div>
                          {d.contact && (
                            <div className="text-xs text-muted-foreground truncate">{d.contact}</div>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 shrink-0 justify-end">
                          {d.icpCategory && (
                            <Badge
                              variant="outline"
                              className="text-[10px] border"
                              style={{ borderColor: icpColor, color: icpColor }}
                            >
                              {d.icpCategory}
                            </Badge>
                          )}
                          {prospect && (
                            <Badge
                              variant="outline"
                              className="text-[10px] border"
                              style={{
                                borderColor: PROSPECT_HEX[prospect],
                                color: PROSPECT_HEX[prospect],
                              }}
                            >
                              {prospect}
                            </Badge>
                          )}
                          {outcome && (
                            <Badge variant="secondary" className="text-[10px]">
                              {outcome}
                            </Badge>
                          )}
                        </div>
                      </div>
                      {reasons.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {Array.from(new Set(reasons)).map((r) => (
                            <Badge
                              key={r}
                              variant="outline"
                              className="text-[10px] border-destructive/30 text-destructive bg-destructive/5"
                            >
                              {REASON_SHORT[r] || r}
                            </Badge>
                          ))}
                        </div>
                      )}
                      <div className="text-[10px] text-muted-foreground">
                        Last activity {format(new Date(d.updatedAt), 'MMM d, yyyy')}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI insight callouts */}
      <div className="space-y-1.5">
        {insights.map((line, i) => (
          <div key={i} className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
            <p className="text-xs text-foreground">
              <span className="font-semibold text-primary">AI insight:</span> {line}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}