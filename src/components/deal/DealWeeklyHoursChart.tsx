import { useEffect, useState } from 'react';
import { BarChart2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts';

interface Row {
  week_start_date: string;
  hours: number;
  phase: string;
}

interface Props {
  dealId: string;
}

export function DealWeeklyHoursChart({ dealId }: Props) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || rows !== null) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('weekly_time_entries')
        .select('week_start_date, hours, phase')
        .eq('deal_id', dealId)
        .order('week_start_date', { ascending: true });
      if (cancelled) return;
      if (error) {
        setRows([]);
      } else {
        setRows((data ?? []) as Row[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, dealId, rows]);

  // Aggregate by week
  const byWeek = new Map<string, { week: string; pre: number; post: number; total: number }>();
  (rows ?? []).forEach((r) => {
    const key = r.week_start_date;
    const cur = byWeek.get(key) ?? { week: key, pre: 0, post: 0, total: 0 };
    if (r.phase === 'pre_signing') cur.pre += Number(r.hours) || 0;
    else cur.post += Number(r.hours) || 0;
    cur.total = cur.pre + cur.post;
    byWeek.set(key, cur);
  });
  const data = Array.from(byWeek.values()).map((d) => ({
    ...d,
    label: new Date(d.week + 'T00:00:00').toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    }),
  }));

  const total = data.reduce((s, d) => s + d.total, 0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/15 bg-white/[0.03] text-muted-foreground hover:bg-slate-800 hover:text-foreground hover:border-white/25 transition-colors"
          aria-label="View weekly hours chart"
          onClick={(e) => e.stopPropagation()}
        >
          <BarChart2 className="h-3.5 w-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-[520px] p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="text-sm font-medium flex items-center justify-between">
            <span>Weekly Hours</span>
            <span className="text-[11px] text-muted-foreground tabular-nums font-normal">
            {total.toLocaleString(undefined, { maximumFractionDigits: 1 })}h total
            </span>
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground">
            Loading…
          </div>
        ) : data.length === 0 ? (
          <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground">
            No weekly hours logged yet.
          </div>
        ) : (
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  stroke="hsl(var(--border))"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  stroke="hsl(var(--border))"
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--foreground) / 0.05)' }}
                  contentStyle={{
                    backgroundColor: 'hsl(222, 47%, 11%)',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 8,
                    fontSize: 12,
                    color: 'hsl(0, 0%, 98%)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  }}
                  labelStyle={{ color: 'hsl(0, 0%, 98%)', fontWeight: 600, marginBottom: 2 }}
                  itemStyle={{ color: 'hsl(0, 0%, 92%)' }}
                  formatter={(v: number, name: string) => [`${v}h`, name === 'pre' ? 'Pre-Signing' : 'Post-Signing']}
                  labelFormatter={(l) => `Week of ${l}`}
                />
                <Bar dataKey="pre" stackId="a" fill="hsl(var(--chart-2))" radius={[0, 0, 0, 0]} />
                <Bar dataKey="post" stackId="a" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]}>
                  {data.map((_, i) => (
                    <Cell key={i} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}