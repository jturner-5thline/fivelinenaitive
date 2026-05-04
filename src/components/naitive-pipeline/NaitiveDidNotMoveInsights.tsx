import { useMemo } from 'react';
import { Deal } from '@/types/deal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList,
  PieChart, Pie,
} from 'recharts';
import { format } from 'date-fns';

const ICP_CATEGORIES = ['Debt Advisory', 'M&A', 'Equity', 'Placement Agent', 'Broker', 'Other'] as const;
const PROSPECT_TYPES = ['Prospect', 'Gatekeeper', 'Connector', 'Market Intelligence'] as const;

const ICP_HEX: Record<string, string> = {
  'Debt Advisory': '#3b82f6',
  'M&A': '#a855f7',
  'Equity': '#22c55e',
  'Placement Agent': '#f97316',
  'Broker': '#14b8a6',
  'Other': '#9ca3af',
};

const PROSPECT_HEX: Record<string, string> = {
  'Prospect': '#3b82f6',
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
    if (topReason) {
      out.push(
        `${topReason.short} is your #1 disqualification reason at ${topReason.pct}% — consider whether this is a specific feature or a positioning issue.`,
      );
    }
    // ICP × outcome — find ICP with highest "Feedback only"
    let bestFeedback: { icp: string; n: number } | null = null;
    ICP_CATEGORIES.forEach((icp) => {
      const n = heatmap.map[icp]['Feedback only'];
      if (n > 0 && (!bestFeedback || n > bestFeedback.n)) bestFeedback = { icp, n };
    });
    if (bestFeedback) {
      out.push(
        `${bestFeedback.icp} contacts are producing the most Feedback only outcomes — valuable for market research but not converting. Reduce time investment.`,
      );
    }
    // Gatekeeper / Market Intelligence callout
    const gateMI =
      (prospectData.find((p) => p.name === 'Gatekeeper')?.pct || 0) +
      (prospectData.find((p) => p.name === 'Market Intelligence')?.pct || 0);
    if (gateMI > 30) {
      out.push(
        `Gatekeepers + Market Intelligence make up ${gateMI}% of non-progressions — that's a targeting signal worth addressing upstream.`,
      );
    }
    if (out.length === 0)
      out.push('Not enough non-progression data yet — patterns will appear as deals are dispositioned.');
    return out.slice(0, 3);
  }, [topReason, heatmap, prospectData]);

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
                        return (
                          <td
                            key={o}
                            className="text-center font-mono rounded-md py-2 min-w-[40px]"
                            style={cellStyle(count)}
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
                      >
                        {prospectData.map((p) => (
                          <Cell key={p.name} fill={p.color} />
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
                    <div key={p.name} className="flex items-center gap-2 text-xs">
                      <span
                        className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                        style={{ background: p.color }}
                      />
                      <span className="text-muted-foreground truncate">{p.name}</span>
                      <span className="font-semibold text-foreground tabular-nums ml-auto">{p.pct}%</span>
                    </div>
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
          <CardTitle className="text-base font-semibold tracking-tight text-foreground">
            Records — did not progress
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5 pt-1">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4">No records yet.</p>
          ) : (
            <div className="max-h-[420px] overflow-y-auto pr-1 space-y-2">
              {[...filtered]
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