import { useMemo, useState } from 'react';
import { Deal } from '@/types/deal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { format } from 'date-fns';

const ICP_HEX: Record<string, string> = {
  'Debt Advisory': '#3b82f6',
  'M&A': '#a855f7',
  'Equity': '#22c55e',
  'Placement Agent': '#f97316',
  'Broker': '#14b8a6',
  'Other': '#9ca3af',
};

const STAGE_ORDER = [
  'prospects', 'dormant', 'on-hold', 'qual-call', 'demo-access',
  'pilot-agreed', 'onboarding', 'active', 'churned', 'closed-lost',
] as const;

function reachedDemo(deal: Deal): boolean {
  const idx = STAGE_ORDER.indexOf(deal.stage as any);
  const demoIdx = STAGE_ORDER.indexOf('demo-access');
  // include onboarding/trial/converted; closed-lost has higher index but
  // still counts since linear journey crossed demo.
  return idx >= demoIdx && idx !== -1;
}

function splitTokens(value?: string): string[] {
  if (!value) return [];
  return value
    .split(/\n|•|;|,|\u2022/g)
    .map((s) => s.replace(/^[-*\s]+/, '').trim())
    .filter((s) => s.length > 1);
}

function tally(values: string[]): { label: string; count: number }[] {
  const map = new Map<string, number>();
  for (const v of values) {
    const key = v.toLowerCase();
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([k, count]) => ({
      label: k.charAt(0).toUpperCase() + k.slice(1),
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

function dmBadge(dm?: string) {
  const v = (dm || 'unknown').toLowerCase();
  if (v === 'yes' || v === 'true' || v.includes('dm') || v.includes('decision'))
    return { label: 'DM', cls: 'bg-green-500/15 text-green-600 border-green-500/30' };
  if (v.includes('gate'))
    return { label: 'Gatekeeper', cls: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30' };
  return { label: 'Unknown', cls: 'bg-muted text-muted-foreground border-border' };
}

function dmCategory(dm?: string): 'Yes' | 'Gatekeeper' | 'Unknown' {
  const v = (dm || '').toLowerCase();
  if (v === 'yes' || v === 'true' || v.includes('dm') || v.includes('decision')) return 'Yes';
  if (v.includes('gate')) return 'Gatekeeper';
  return 'Unknown';
}

interface Props {
  deals: Deal[];
}

export function NaitiveQualToDemoInsights({ deals }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const filtered = useMemo(
    () =>
      deals.filter(
        (d) =>
          (d.outcome || '').toLowerCase().includes('moved') && reachedDemo(d),
      ),
    [deals],
  );

  const painTop = useMemo(
    () => tally(filtered.flatMap((d) => splitTokens(d.painPointsConfirmed))).slice(0, 5),
    [filtered],
  );
  const toolsTop = useMemo(
    () => tally(filtered.flatMap((d) => splitTokens(d.competitorsMentioned))).slice(0, 5),
    [filtered],
  );

  const dmCounts = useMemo(() => {
    const out = { Yes: 0, Gatekeeper: 0, Unknown: 0 } as Record<string, number>;
    for (const d of filtered) out[dmCategory(d.dmPresent)]++;
    return out;
  }, [filtered]);

  const total = filtered.length;
  const dmPie = [
    { name: 'DM Present', value: dmCounts.Yes, color: '#22c55e' },
    { name: 'Gatekeeper', value: dmCounts.Gatekeeper, color: '#f59e0b' },
    { name: 'Unknown', value: dmCounts.Unknown, color: '#9ca3af' },
  ];

  const aiInsight = useMemo(() => {
    if (total === 0)
      return 'No converting quals yet — once deals start moving from Qual Booked to Demo, patterns will appear here.';
    const dmPct = Math.round((dmCounts.Yes / total) * 100);
    const topPain = painTop.slice(0, 2).map((p) => p.label.toLowerCase());
    const painStr = topPain.length
      ? topPain.join(' and ')
      : 'no recurring pain themes yet';
    return `Your converting quals had the DM in the room ${dmPct}% of the time and most commonly cited ${painStr} as pain points.`;
  }, [total, dmCounts, painTop]);

  const maxPain = Math.max(1, ...painTop.map((p) => p.count));

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-foreground">Calls That Moved to Demo and Why</h3>
        <p className="text-sm text-muted-foreground">
          Every prospect that made it from qual to demo — what they confirmed, what they were using,
          whether the DM was in the room. Over time this tells us exactly what a converting qual looks
          like so we can replicate it.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* LEFT: Pattern summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              Pattern summary <span className="text-muted-foreground font-normal">({total} converting quals)</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Pain points */}
            <div>
              <div className="text-xs font-semibold text-foreground mb-2">What they said was broken</div>
              {painTop.length === 0 ? (
                <p className="text-xs text-muted-foreground">No pain points captured yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {painTop.map((p) => (
                    <li key={p.label} className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="text-xs text-foreground truncate">{p.label}</span>
                          <span className="text-xs font-mono text-muted-foreground">{p.count}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-primary"
                            style={{ width: `${(p.count / maxPain) * 100}%` }}
                          />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Tools */}
            <div>
              <div className="text-xs font-semibold text-foreground mb-2">What they were using</div>
              {toolsTop.length === 0 ? (
                <p className="text-xs text-muted-foreground">No tools mentioned yet.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {toolsTop.map((t) => (
                    <Badge key={t.label} variant="secondary" className="text-xs">
                      {t.label} <span className="ml-1 opacity-60">×{t.count}</span>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* DM Present */}
            <div>
              <div className="text-xs font-semibold text-foreground mb-2">Was the decision maker in the room?</div>
              {total === 0 ? (
                <p className="text-xs text-muted-foreground">No data yet.</p>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="h-32 w-32 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={dmPie}
                          dataKey="value"
                          innerRadius={32}
                          outerRadius={56}
                          paddingAngle={2}
                        >
                          {dmPie.map((slice) => (
                            <Cell key={slice.name} fill={slice.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(v: number) => [`${v} (${Math.round((v / total) * 100)}%)`, '']}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="space-y-1.5 text-xs">
                    {dmPie.map((slice) => (
                      <li key={slice.name} className="flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-sm"
                          style={{ background: slice.color }}
                        />
                        <span className="text-foreground">{slice.name}</span>
                        <span className="text-muted-foreground font-mono">
                          {Math.round((slice.value / total) * 100)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* RIGHT: Individual record feed */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Records — qual → demo</CardTitle>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground">No records yet.</p>
            ) : (
              <div className="max-h-[480px] overflow-y-auto pr-1 space-y-3">
                {[...filtered]
                  .sort(
                    (a, b) =>
                      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
                  )
                  .map((d) => {
                    const dm = dmBadge(d.dmPresent);
                    const painList = splitTokens(d.painPointsConfirmed);
                    const isExpanded = expanded[d.id];
                    const visiblePain = isExpanded ? painList : painList.slice(0, 1);
                    const icpColor = ICP_HEX[d.icpCategory || 'Other'] || ICP_HEX.Other;
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
                              <div className="text-xs text-muted-foreground truncate">
                                {d.contact}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {d.icpCategory && (
                              <Badge
                                variant="outline"
                                className="text-[10px] border"
                                style={{ borderColor: icpColor, color: icpColor }}
                              >
                                {d.icpCategory}
                              </Badge>
                            )}
                            <Badge variant="outline" className={`text-[10px] ${dm.cls}`}>
                              {dm.label}
                            </Badge>
                          </div>
                        </div>

                        {painList.length > 0 && (
                          <div className="text-xs">
                            <span className="text-muted-foreground">Pain: </span>
                            <button
                              onClick={() =>
                                setExpanded((p) => ({ ...p, [d.id]: !p[d.id] }))
                              }
                              className="text-foreground text-left hover:underline"
                            >
                              {visiblePain.join(' • ')}
                              {painList.length > 1 && !isExpanded && (
                                <span className="text-muted-foreground"> +{painList.length - 1} more</span>
                              )}
                            </button>
                          </div>
                        )}

                        {d.competitorsMentioned && (
                          <div className="text-xs">
                            <span className="text-muted-foreground">Tools: </span>
                            <span className="text-foreground">{d.competitorsMentioned}</span>
                          </div>
                        )}

                        {d.keySignal && (
                          <div className="text-xs italic text-foreground/90 border-l-2 border-primary/40 pl-2">
                            "{d.keySignal}"
                          </div>
                        )}

                        <div className="text-[10px] text-muted-foreground">
                          Moved {format(new Date(d.updatedAt), 'MMM d, yyyy')}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
        <p className="text-xs text-foreground">
          <span className="font-semibold text-primary">AI insight:</span> {aiInsight}
        </p>
      </div>
    </div>
  );
}