import { useMemo } from 'react';
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { GlassCard, GlassCardHeader, GlassCardBody } from '@/components/metrics/GlassCard';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useInsightsTimeframeOptional } from '@/contexts/InsightsTimeframeContext';
import { Loader2 } from 'lucide-react';

// Shared axis / tooltip / legend tokens — mirrors ExecutiveDashboard so the
// chart looks identical after the move.
const AXIS_TICK = { fontSize: 10, fill: 'rgba(200, 220, 250, 0.78)' } as const;
const AXIS_LINE = { stroke: 'rgba(160, 200, 255, 0.20)' } as const;
const GRID_STROKE = 'rgba(160, 200, 255, 0.14)';
const TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: 'hsl(var(--popover) / 0.96)',
  border: '1px solid hsl(0 0% 100% / 0.14)',
  borderRadius: '8px',
  fontSize: '12px',
  color: 'hsl(0 0% 100%)',
  boxShadow: 'var(--shadow-xl)',
  backdropFilter: 'blur(16px)',
};
const LEGEND_STYLE: React.CSSProperties = {
  fontSize: 11,
  color: 'rgba(200, 220, 250, 0.88)',
  paddingTop: 4,
};

const formatCurrency = (value: number) => {
  if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
};

type Bucket = 'day' | 'week' | 'month';

function pickBucket(start: string, end: string): Bucket {
  const s = new Date(start + 'T00:00:00').getTime();
  const e = new Date(end + 'T00:00:00').getTime();
  const days = Math.max(1, Math.round((e - s) / 86_400_000) + 1);
  if (days <= 31) return 'day';
  if (days <= 120) return 'week';
  return 'month';
}

function bucketKey(date: Date, bucket: Bucket): { key: string; label: string } {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  if (bucket === 'day') {
    const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return { key, label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) };
  }
  if (bucket === 'week') {
    // ISO-ish week: bucket by Monday of the week
    const tmp = new Date(y, m, d);
    const day = (tmp.getDay() + 6) % 7; // Mon=0
    tmp.setDate(tmp.getDate() - day);
    const key = `${tmp.getFullYear()}-${String(tmp.getMonth() + 1).padStart(2, '0')}-${String(tmp.getDate()).padStart(2, '0')}`;
    return { key, label: tmp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) };
  }
  const key = `${y}-${String(m + 1).padStart(2, '0')}`;
  return { key, label: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) };
}

export function RevenueByMonthChart({ height = 240 }: { height?: number }) {
  const { user } = useAuth();
  const ctx = useInsightsTimeframeOptional();
  const start = ctx?.timeframe.start ?? null;
  const end = ctx?.timeframe.end ?? null;
  const rangeLabel = ctx?.timeframe.label ?? '';

  const { data, isLoading } = useQuery({
    queryKey: ['revenue-by-month-chart', user?.id, start, end],
    queryFn: async () => {
      let q = supabase
        .from('quickbooks_invoices')
        .select('txn_date, total_amt')
        .order('txn_date', { ascending: true });
      if (start) q = q.gte('txn_date', start);
      if (end) q = q.lte('txn_date', end);
      const { data: rows, error } = await q;
      if (error) throw error;
      return rows ?? [];
    },
    enabled: !!user && !!start && !!end,
    staleTime: 30_000,
  });

  const { chartData, bucket, title } = useMemo(() => {
    if (!start || !end) {
      return { chartData: [] as { period: string; revenue: number }[], bucket: 'month' as Bucket, title: 'Revenue' };
    }
    const b = pickBucket(start, end);
    const map = new Map<string, { label: string; amount: number; sortKey: string }>();
    for (const row of data ?? []) {
      if (!row.txn_date) continue;
      const d = new Date(row.txn_date + 'T00:00:00');
      const { key, label } = bucketKey(d, b);
      const existing = map.get(key);
      const amount = (existing?.amount ?? 0) + (row.total_amt ?? 0);
      map.set(key, { label, amount, sortKey: key });
    }
    const arr = Array.from(map.values())
      .sort((a, z) => a.sortKey.localeCompare(z.sortKey))
      .map(v => ({ period: v.label, revenue: v.amount }));
    const titleByBucket: Record<Bucket, string> = {
      day: 'Revenue by Day',
      week: 'Revenue by Week',
      month: 'Revenue by Month',
    };
    return { chartData: arr, bucket: b, title: titleByBucket[b] };
  }, [data, start, end]);

  return (
    <GlassCard interactive className="h-full">
      <GlassCardHeader title={title} subtitle={rangeLabel} />
      <GlassCardBody>
        <div style={{ height }} role="img" aria-label={`${title}, ${rangeLabel}`}>
          {isLoading ? (
            <div className="h-full w-full flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">
              No revenue in selected range
            </div>
          ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: -6, bottom: 4 }}>
              <CartesianGrid strokeDasharray="2 4" stroke={GRID_STROKE} vertical={false} />
              <XAxis dataKey="period" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} interval="preserveStartEnd" />
              <YAxis tickFormatter={formatCurrency} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
              <Tooltip formatter={(value: number) => [formatCurrency(value), 'Revenue']} contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={LEGEND_STYLE} iconType="circle" iconSize={8} />
              <Area type="monotone" dataKey="revenue" name="Revenue" fill="hsl(var(--primary) / 0.22)" stroke="transparent" legendType="none" />
              <Line type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(var(--primary))" strokeWidth={1.75} dot={{ r: 3, fill: 'hsl(var(--primary))', strokeWidth: 0 }} />
            </ComposedChart>
          </ResponsiveContainer>
          )}
        </div>
      </GlassCardBody>
    </GlassCard>
  );
}