import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bar, BarChart, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Line, LineChart, Legend, Cell, PieChart, Pie, LabelList } from 'recharts';
import { createGlassBarShape } from '@/components/metrics/charts/LiquidGlassBar';
import { PieGlassDefs, pieGlassFill, GlassActiveShape } from '@/components/metrics/charts/LiquidGlassPie';
import type { StageFunnelItem, StageAgingItem, HealthMixItem, PipelineTrendPoint } from '@/hooks/useNaitivePipelineMetrics';

const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(210, 70%, 50%)',
  'hsl(280, 60%, 50%)',
];

// Shorten long stage labels for chart axes; tooltips keep the full name.
const STAGE_SHORT: Record<string, string> = {
  'Onboarding Booked': 'Onboarding',
  'Tabled — On Hold': 'On Hold',
  'Trial Active': 'Trial',
  'Closed Lost': 'Lost',
  'Qual Booked': 'Qual',
  'Demo Booked': 'Demo',
};
const shortStage = (s: string) => STAGE_SHORT[s] || s;

const AXIS_TICK = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' };
const TOOLTIP_STYLE = {
  background: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 8,
  fontSize: 12,
  color: 'hsl(var(--foreground))',
  padding: '8px 10px',
} as const;

export function NaitiveFunnelChart({ data }: { data: StageFunnelItem[] }) {
  if (data.length === 0) return null;
  const display = data.map((d) => ({ ...d, short: shortStage(d.name) }));
  return (
    <Card>
      <CardHeader className="pb-3 pt-5 px-5">
        <CardTitle className="text-base font-semibold tracking-tight text-foreground">Pipeline Funnel</CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5 pt-1">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={display} layout="vertical" margin={{ left: 4, right: 32, top: 4, bottom: 4 }} barCategoryGap={10}>
            <CartesianGrid strokeDasharray="2 4" horizontal={false} stroke="hsl(var(--border) / 0.4)" />
            <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
            <YAxis dataKey="short" type="category" width={110} tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: 'hsl(var(--muted) / 0.25)' }}
              contentStyle={TOOLTIP_STYLE}
              labelFormatter={(_l, p: any) => p?.[0]?.payload?.name}
              formatter={(v: number) => [v, 'Deals']}
            />
            <Bar dataKey="count" shape={createGlassBarShape({ radius: 4 })}>
              {display.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
              <LabelList dataKey="count" position="right" style={{ fontSize: 11, fill: 'hsl(var(--foreground))' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function NaitiveTrendChart({ data }: { data: PipelineTrendPoint[] }) {
  return (
    <Card>
      <CardHeader className="pb-3 pt-5 px-5">
        <CardTitle className="text-base font-semibold tracking-tight text-foreground">Pipeline Trend (6 mo)</CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5 pt-1">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ left: -4, right: 16, top: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border) / 0.4)" vertical={false} />
            <XAxis dataKey="date" tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" />
            <Line type="monotone" dataKey="created" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} name="Created" />
            <Line type="monotone" dataKey="closedWon" stroke="hsl(var(--success))" strokeWidth={2} dot={{ r: 3 }} name="Won" />
            <Line type="monotone" dataKey="closedLost" stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ r: 3 }} name="Lost" />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function NaitivAgingChart({ data }: { data: StageAgingItem[] }) {
  const filtered = data.filter(d => d.dealCount > 0);
  if (filtered.length === 0) return null;
  const display = filtered.map((d) => ({ ...d, short: shortStage(d.name) }));
  return (
    <Card>
      <CardHeader className="pb-3 pt-5 px-5">
        <CardTitle className="text-base font-semibold tracking-tight text-foreground">Stage Aging (avg days)</CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5 pt-1">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={display} margin={{ left: 4, right: 16, top: 12, bottom: 8 }} barCategoryGap={12}>
            <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border) / 0.4)" vertical={false} />
            <XAxis dataKey="short" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={0} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: 'hsl(var(--muted) / 0.25)' }}
              contentStyle={TOOLTIP_STYLE}
              labelFormatter={(_l, p: any) => p?.[0]?.payload?.name}
              formatter={(v: number) => [`${v} days`, 'Avg']}
            />
            <Bar dataKey="avgDays" shape={createGlassBarShape({ radius: 4 })} name="Avg Days">
              {display.map((d, i) => (
                <Cell key={i} fill={d.avgDays >= 14 ? 'hsl(var(--destructive))' : d.avgDays >= 7 ? 'hsl(45, 93%, 47%)' : 'hsl(var(--primary))'} />
              ))}
              <LabelList dataKey="avgDays" position="top" style={{ fontSize: 11, fill: 'hsl(var(--foreground))' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function NaitivHealthMixChart({ data }: { data: HealthMixItem[] }) {
  const filtered = data.filter(d => d.count > 0);
  if (filtered.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3 pt-5 px-5">
          <CardTitle className="text-base font-semibold tracking-tight text-foreground">Health Mix</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5 pt-1 flex items-center justify-center h-[240px] text-sm text-muted-foreground">
          No active deals
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader className="pb-3 pt-5 px-5">
        <CardTitle className="text-base font-semibold tracking-tight text-foreground">Health Mix</CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5 pt-1">
        <div className="flex items-center gap-5">
          <ResponsiveContainer width="55%" height={200}>
            <PieChart>
              <PieGlassDefs colors={filtered.map(e => e.color)} />
              <Pie data={filtered} dataKey="count" nameKey="label" cx="50%" cy="50%" innerRadius={46} outerRadius={80} paddingAngle={2} activeShape={GlassActiveShape}>
                {filtered.map((entry, i) => (
                  <Cell key={i} fill={pieGlassFill(i)} stroke={entry.color} strokeWidth={0.25} />
                ))}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-col gap-2.5">
            {data.map(d => (
              <div key={d.status} className="flex items-center gap-2 text-sm">
                <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                <span className="text-muted-foreground">{d.label}</span>
                <span className="font-semibold text-foreground">{d.count}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
