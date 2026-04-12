import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bar, BarChart, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Line, LineChart, Legend, Cell, PieChart, Pie } from 'recharts';
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

export function NaitiveFunnelChart({ data }: { data: StageFunnelItem[] }) {
  if (data.length === 0) return null;
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-medium">Pipeline Funnel</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} layout="vertical" margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
            <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
            <Tooltip
              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }}
              formatter={(v: number, name: string) => [name === 'value' ? `$${v.toLocaleString()}` : v, name === 'value' ? 'Value' : 'Count']}
            />
            <Bar dataKey="count" shape={createGlassBarShape({ radius: 4 })}>
              {data.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function NaitiveTrendChart({ data }: { data: PipelineTrendPoint[] }) {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-medium">Pipeline Trend (6 mo)</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} />
            <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
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
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-medium">Stage Aging (avg days)</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={filtered} margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} interval={0} angle={-20} textAnchor="end" height={50} />
            <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
            <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }} />
            <Bar dataKey="avgDays" shape={createGlassBarShape({ radius: 4 })} name="Avg Days">
              {filtered.map((d, i) => (
                <Cell key={i} fill={d.avgDays >= 14 ? 'hsl(var(--destructive))' : d.avgDays >= 7 ? 'hsl(45, 93%, 47%)' : 'hsl(var(--primary))'} />
              ))}
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
      <Card className="bg-card border-border">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-medium">Health Mix</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 flex items-center justify-center h-[220px] text-sm text-muted-foreground">
          No active deals
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-medium">Health Mix</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="flex items-center gap-4">
          <ResponsiveContainer width="50%" height={180}>
            <PieChart>
              <PieGlassDefs colors={filtered.map(e => e.color)} />
              <Pie data={filtered} dataKey="count" nameKey="label" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2} activeShape={GlassActiveShape}>
                {filtered.map((entry, i) => (
                  <Cell key={i} fill={pieGlassFill(i)} stroke={entry.color} strokeWidth={0.5} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-col gap-2">
            {data.map(d => (
              <div key={d.status} className="flex items-center gap-2 text-xs">
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
