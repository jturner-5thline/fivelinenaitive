import { useMemo, useState } from 'react';
import { InsightsDrilldownDrawer } from '@/components/metrics/insights/InsightsDrilldownDrawer';
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { GlassCard, GlassCardHeader, GlassCardBody } from '@/components/metrics/GlassCard';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useInsightsTimeframeOptional } from '@/contexts/InsightsTimeframeContext';
import { Loader2, ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { QBO_ENTITIES } from '@/config/qboEntities';

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

// Distinct line colors for per-entity series — drawn from existing chart
// palette tokens used elsewhere in Liquid Glass dashboards.
const ENTITY_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2, 199 89% 65%))',
  'hsl(var(--chart-3, 142 70% 55%))',
  'hsl(var(--chart-4, 38 92% 60%))',
  'hsl(var(--chart-5, 280 75% 65%))',
];

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
        .select('txn_date, total_amt, realm_id')
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

  // Entity filter — sourced from QuickBooks `realm_id` (each connected QBO
  // company is a separate realm). Empty array = "All" (single aggregate
  // line). One or more realmIds = one line per selected entity.
  // Records without a realm_id can't exist in this table (NOT NULL).
  const [selected, setSelected] = useState<string[]>([]);

  const availableRealms = useMemo(() => {
    const set = new Set<string>();
    for (const r of data ?? []) if (r.realm_id) set.add(r.realm_id);
    return Array.from(set);
  }, [data]);

  const entityOptions = useMemo(() => {
    return availableRealms.map(realmId => {
      const known = QBO_ENTITIES.find(e => e.realmId === realmId);
      return { realmId, label: known?.label ?? `Entity ${realmId.slice(-4)}` };
    });
  }, [availableRealms]);

  const isAll = selected.length === 0;

  const { chartData, bucket, title, seriesKeys } = useMemo(() => {
    if (!start || !end) {
      return { chartData: [] as Array<Record<string, number | string>>, bucket: 'month' as Bucket, title: 'Revenue', seriesKeys: [] as string[] };
    }
    const b = pickBucket(start, end);
    // Build a per-bucket map. Each bucket holds amounts keyed by series name
    // ("revenue" for All, or each entity label for multi-entity mode).
    const map = new Map<string, { label: string; sortKey: string; values: Record<string, number> }>();
    const allowed = isAll ? null : new Set(selected);
    for (const row of data ?? []) {
      if (!row.txn_date) continue;
      if (allowed && (!row.realm_id || !allowed.has(row.realm_id))) continue;
      const d = new Date(row.txn_date + 'T00:00:00');
      const { key, label } = bucketKey(d, b);
      const seriesKey = isAll
        ? 'Revenue'
        : entityOptions.find(o => o.realmId === row.realm_id)?.label ?? 'Other';
      const existing = map.get(key) ?? { label, sortKey: key, values: {} };
      existing.values[seriesKey] = (existing.values[seriesKey] ?? 0) + (row.total_amt ?? 0);
      map.set(key, existing);
    }
    const seriesSet = new Set<string>();
    if (isAll) {
      seriesSet.add('Revenue');
    } else {
      for (const realmId of selected) {
        const lbl = entityOptions.find(o => o.realmId === realmId)?.label;
        if (lbl) seriesSet.add(lbl);
      }
    }
    const keys = Array.from(seriesSet);
    const arr = Array.from(map.values())
      .sort((a, z) => a.sortKey.localeCompare(z.sortKey))
      .map(v => {
        const row: Record<string, number | string> = { period: v.label };
        for (const k of keys) row[k] = v.values[k] ?? 0;
        return row;
      });
    const titleByBucket: Record<Bucket, string> = {
      day: 'Revenue by Day',
      week: 'Revenue by Week',
      month: 'Revenue by Month',
    };
    return { chartData: arr, bucket: b, title: titleByBucket[b], seriesKeys: keys };
  }, [data, start, end, isAll, selected, entityOptions]);

  const activeEntityLabel = isAll
    ? 'All Entities'
    : selected.length === 1
      ? entityOptions.find(o => o.realmId === selected[0])?.label ?? 'Entity'
      : `${selected.length} Selected Entities`;
  const fullTitle = `${title} — ${activeEntityLabel}`;
  const showFilter = entityOptions.length > 1;

  const toggleEntity = (realmId: string) => {
    setSelected(prev => {
      const next = prev.includes(realmId)
        ? prev.filter(r => r !== realmId)
        : [...prev, realmId];
      return next;
    });
  };
  const selectAll = () => setSelected([]);

  // Drilldown — click a chart point to see contributing invoices for that bucket
  const [drill, setDrill] = useState<{ label: string; rows: Array<{ date: string; entity: string; amount: number; doc?: string }> } | null>(null);

  const handleChartClick = (state: any) => {
    const label = state?.activeLabel as string | undefined;
    if (!label) return;
    const matchedBucket = chartData.find((r) => r.period === label);
    if (!matchedBucket) return;
    // Reverse-map invoices that fall into this bucket
    const allowed = isAll ? null : new Set(selected);
    const rows: Array<{ date: string; entity: string; amount: number; doc?: string }> = [];
    for (const r of data ?? []) {
      if (!r.txn_date) continue;
      if (allowed && (!r.realm_id || !allowed.has(r.realm_id))) continue;
      const d = new Date(r.txn_date + 'T00:00:00');
      const { label: bLabel } = bucketKey(d, bucket);
      if (bLabel !== label) continue;
      const entity = entityOptions.find(o => o.realmId === r.realm_id)?.label ?? 'Unknown';
      rows.push({ date: r.txn_date, entity, amount: Number(r.total_amt) || 0 });
    }
    rows.sort((a, b) => b.amount - a.amount);
    setDrill({ label, rows });
  };

  return (
    <>
    <GlassCard interactive className="h-full">
      <GlassCardHeader
        title={fullTitle}
        subtitle={rangeLabel}
        right={
          showFilter ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs bg-background/40 border-white/10 gap-1.5"
                >
                  <span className="truncate max-w-[140px]">{activeEntityLabel}</span>
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-52 p-1">
                <button
                  type="button"
                  onClick={selectAll}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-xs hover:bg-accent text-left"
                >
                  <Checkbox checked={isAll} className="pointer-events-none" />
                  <span>All Entities</span>
                </button>
                <div className="my-1 h-px bg-border/60" />
                {entityOptions.map(opt => {
                  const checked = selected.includes(opt.realmId);
                  return (
                    <button
                      key={opt.realmId}
                      type="button"
                      onClick={() => toggleEntity(opt.realmId)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-xs hover:bg-accent text-left"
                    >
                      <Checkbox checked={checked} className="pointer-events-none" />
                      <span className="truncate">{opt.label}</span>
                    </button>
                  );
                })}
              </PopoverContent>
            </Popover>
          ) : null
        }
      />
      <GlassCardBody>
        <div style={{ height }} role="img" aria-label={`${fullTitle}, ${rangeLabel}`}>
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
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: -6, bottom: 4 }} onClick={handleChartClick} style={{ cursor: 'pointer' }}>
              <CartesianGrid strokeDasharray="2 4" stroke={GRID_STROKE} vertical={false} />
              <XAxis dataKey="period" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} interval="preserveStartEnd" />
              <YAxis tickFormatter={formatCurrency} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
              <Tooltip formatter={(value: number, name: string) => [formatCurrency(value), name]} contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={LEGEND_STYLE} iconType="circle" iconSize={8} />
              {isAll && (
                <Area type="monotone" dataKey="Revenue" name="Revenue" fill="hsl(var(--primary) / 0.22)" stroke="transparent" legendType="none" />
              )}
              {seriesKeys.map((key, idx) => {
                const color = ENTITY_COLORS[idx % ENTITY_COLORS.length];
                return (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    name={key}
                    stroke={color}
                    strokeWidth={1.75}
                    dot={{ r: 3, fill: color, strokeWidth: 0 }}
                  />
                );
              })}
            </ComposedChart>
          </ResponsiveContainer>
          )}
        </div>
      </GlassCardBody>
    </GlassCard>
    <InsightsDrilldownDrawer
      open={!!drill}
      onClose={() => setDrill(null)}
      context={drill ? {
        sourceId: 'chart:revenue-by-month',
        sourceLabel: fullTitle,
        selection: drill.label,
        periodLabel: rangeLabel,
      } : null}
      columns={[
        { key: 'date', label: 'Date' },
        { key: 'entity', label: 'Entity' },
        { key: 'amount', label: 'Amount', align: 'right', render: (r: any) => formatCurrency(r.amount) },
      ]}
      rows={drill?.rows ?? []}
      emptyHint="No invoices recorded in this bucket."
      summary={drill ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
          <span style={{ opacity: 0.7 }}>{drill.rows.length} invoice{drill.rows.length === 1 ? '' : 's'}</span>
          <span style={{ fontWeight: 600 }}>
            {formatCurrency(drill.rows.reduce((s, r) => s + r.amount, 0))}
          </span>
        </div>
      ) : undefined}
    />
    </>
  );
}