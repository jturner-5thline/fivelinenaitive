import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Pencil, Loader2, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ResponsiveContainer, LineChart, Line, YAxis, Tooltip } from 'recharts';

/**
 * Utilization KPI widget for the FinServ Financial Metrics tab.
 *
 * Displays a Blended utilization headline (weighted sum of billable ÷ capacity
 * across all 3 people) and compact per-person rows for Scott, Siddhi, and Kris.
 * Both billable and capacity hours are captured per person per month via the
 * pencil dialog and persisted in `metric_manual_inputs`.
 *
 * Metric keys (one row per person per month, per metric):
 *   util_bill_<slug>   billable hrs
 *   util_cap_<slug>    capacity hrs
 */

type PersonSlug = 'scott' | 'siddhi' | 'kris';

const PEOPLE: Array<{ slug: PersonSlug; name: string }> = [
  { slug: 'scott', name: 'Scott' },
  { slug: 'siddhi', name: 'Siddhi' },
  { slug: 'kris', name: 'Kris' },
];

const METRIC_KEYS = PEOPLE.flatMap((p) => [`util_bill_${p.slug}`, `util_cap_${p.slug}`]);

const fmtPct = (v: number | null) =>
  v == null || !Number.isFinite(v) ? '—' : `${v.toFixed(1)}%`;

export function UtilizationWidget({
  monthKeys,
  monthLabels,
  badge,
}: {
  monthKeys: string[];
  monthLabels: string[];
  badge: string;
}) {
  const { company } = useCompany();
  const companyId = company?.id ?? null;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['utilization-widget', companyId, monthKeys.join('|')],
    queryFn: async () => {
      if (monthKeys.length === 0) return {} as Record<string, Record<string, number>>;
      let q = supabase
        .from('metric_manual_inputs')
        .select('metric_key, month_key, value')
        .in('metric_key', METRIC_KEYS)
        .in('month_key', monthKeys);
      q = companyId ? q.eq('company_id', companyId) : q.is('company_id', null);
      const { data, error } = await q;
      if (error) throw error;
      const out: Record<string, Record<string, number>> = {};
      for (const r of data ?? []) {
        const key = (r as any).metric_key as string;
        const mk = (r as any).month_key as string;
        const v = (r as any).value;
        if (v == null) continue;
        (out[key] ||= {})[mk] = Number(v);
      }
      return out;
    },
  });

  const perPerson = useMemo(() => {
    return PEOPLE.map((p) => {
      const bill = data?.[`util_bill_${p.slug}`] ?? {};
      const cap = data?.[`util_cap_${p.slug}`] ?? {};
      const series = monthKeys.map((mk, i) => {
        const b = Number(bill[mk] ?? 0);
        const c = Number(cap[mk] ?? 0);
        const pct = c > 0 ? (b / c) * 100 : null;
        return { month: monthLabels[i] ?? mk, monthKey: mk, bill: b, cap: c, pct };
      });
      const totBill = series.reduce((s, r) => s + r.bill, 0);
      const totCap = series.reduce((s, r) => s + r.cap, 0);
      const headline = totCap > 0 ? (totBill / totCap) * 100 : null;
      return { ...p, series, totBill, totCap, headline };
    });
  }, [data, monthKeys, monthLabels]);

  const blended = useMemo(() => {
    const totBill = perPerson.reduce((s, p) => s + p.totBill, 0);
    const totCap = perPerson.reduce((s, p) => s + p.totCap, 0);
    const headline = totCap > 0 ? (totBill / totCap) * 100 : null;
    // Blended monthly series (weighted).
    const series = monthKeys.map((mk, i) => {
      let b = 0, c = 0;
      for (const p of perPerson) {
        const row = p.series[i];
        b += row.bill; c += row.cap;
      }
      const pct = c > 0 ? (b / c) * 100 : null;
      return { month: monthLabels[i] ?? mk, monthKey: mk, pct };
    });
    return { headline, series, totBill, totCap };
  }, [perPerson, monthKeys, monthLabels]);

  const hasAny = perPerson.some((p) => p.totCap > 0 || p.totBill > 0);

  return (
    <Card className="glass-module">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-medium">Utilization</CardTitle>
            <Badge variant="outline" className="w-fit text-xs mt-1">{badge}</Badge>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 -mr-1 -mt-1"
            aria-label="Enter utilization hours"
            title="Enter billable & capacity hours per person"
            onClick={() => setOpen(true)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        ) : !hasAny ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Users className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm font-medium">No hours entered</p>
            <p className="text-xs mt-1 opacity-60">
              Click the pencil to enter billable and capacity hours
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Blended headline */}
            <div>
              <div className="text-3xl font-semibold tabular-nums text-foreground">
                {fmtPct(blended.headline)}
              </div>
              <div className="text-xs text-muted-foreground">
                Blended · {blended.totBill.toLocaleString()} billable ÷{' '}
                {blended.totCap.toLocaleString()} capacity hrs
              </div>
            </div>

            {/* Per-person rows */}
            <div className="space-y-2">
              {perPerson.map((p) => (
                <PersonRow key={p.slug} name={p.name} series={p.series} headline={p.headline} totBill={p.totBill} totCap={p.totCap} />
              ))}
            </div>
          </div>
        )}
      </CardContent>

      <UtilizationInputDialog
        open={open}
        onOpenChange={setOpen}
        monthKeys={monthKeys}
        monthLabels={monthLabels}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['utilization-widget'] });
        }}
      />
    </Card>
  );
}

function PersonRow({
  name,
  series,
  headline,
  totBill,
  totCap,
}: {
  name: string;
  series: Array<{ month: string; pct: number | null }>;
  headline: number | null;
  totBill: number;
  totCap: number;
}) {
  const chartData = series.map((s) => ({ month: s.month, pct: s.pct }));
  const hasSeries = series.some((s) => s.pct != null);
  return (
    <div className="grid grid-cols-[80px_1fr_70px] items-center gap-3 border-t border-border/40 pt-2 first:border-0 first:pt-0">
      <div>
        <div className="text-sm font-medium text-foreground">{name}</div>
        <div className="text-[10px] text-muted-foreground tabular-nums">
          {totBill.toLocaleString()}/{totCap.toLocaleString()} hrs
        </div>
      </div>
      <div className="h-8">
        {hasSeries && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
              <YAxis hide domain={[0, 100]} />
              <Tooltip
                cursor={{ stroke: 'hsl(var(--border))' }}
                content={({ active, payload, label }: any) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="rounded-md border border-border bg-popover px-2 py-1 text-[11px] shadow">
                      <div className="font-medium">{label}</div>
                      <div className="text-muted-foreground">{fmtPct(payload[0].value)}</div>
                    </div>
                  );
                }}
              />
              <Line
                type="monotone"
                dataKey="pct"
                stroke="hsl(var(--primary))"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="text-right text-sm font-semibold tabular-nums text-foreground">
        {fmtPct(headline)}
      </div>
    </div>
  );
}

function UtilizationInputDialog({
  open,
  onOpenChange,
  monthKeys,
  monthLabels,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  monthKeys: string[];
  monthLabels: string[];
  onSaved?: () => void;
}) {
  const { company } = useCompany();
  const companyId = company?.id ?? null;
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useMemo(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        let q = supabase
          .from('metric_manual_inputs')
          .select('metric_key, month_key, value')
          .in('metric_key', METRIC_KEYS)
          .in('month_key', monthKeys);
        q = companyId ? q.eq('company_id', companyId) : q.is('company_id', null);
        const { data, error } = await q;
        if (error) throw error;
        if (cancelled) return;
        const next: Record<string, string> = {};
        for (const r of data ?? []) {
          const key = `${(r as any).metric_key}|${(r as any).month_key}`;
          const v = (r as any).value;
          next[key] = v == null ? '' : String(v);
        }
        setValues(next);
      } catch (e: any) {
        toast.error('Failed to load inputs', { description: e?.message });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, companyId, monthKeys.join('|')]);

  const cellKey = (metric: string, mk: string) => `${metric}|${mk}`;

  async function save() {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) { toast.error('Not signed in'); return; }
    setSaving(true);
    try {
      const payload: Array<{
        company_id: string | null;
        user_id: string;
        metric_key: string;
        month_key: string;
        value: number | null;
      }> = [];
      for (const mk of monthKeys) {
        for (const p of PEOPLE) {
          for (const kind of ['bill', 'cap'] as const) {
            const metric = `util_${kind}_${p.slug}`;
            const raw = (values[cellKey(metric, mk)] ?? '').trim();
            const num = raw === '' ? null : Number(raw);
            if (raw !== '' && Number.isNaN(num)) {
              throw new Error(`Invalid number for ${p.name} ${kind === 'bill' ? 'billable' : 'capacity'} ${mk}`);
            }
            payload.push({
              company_id: companyId, user_id: uid, metric_key: metric, month_key: mk, value: num,
            });
          }
        }
      }
      const { error } = await supabase
        .from('metric_manual_inputs')
        .upsert(payload, { onConflict: 'company_id,metric_key,month_key' });
      if (error) throw error;
      toast.success('Utilization saved');
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error('Save failed', { description: e?.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Enter Utilization Hours</DialogTitle>
          <DialogDescription>
            Billable and capacity hours per person per month. Utilization = billable ÷ capacity.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="py-10 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-auto border border-border rounded-md">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border">
                  <th rowSpan={2} className="text-left px-3 py-2 font-medium uppercase tracking-wider text-muted-foreground">Month</th>
                  {PEOPLE.map((p) => (
                    <th key={p.slug} colSpan={2} className="text-center px-2 py-2 font-medium uppercase tracking-wider text-muted-foreground border-l border-border">
                      {p.name}
                    </th>
                  ))}
                </tr>
                <tr className="border-b border-border">
                  {PEOPLE.map((p) => (
                    <>
                      <th key={`${p.slug}-b`} className="text-right px-2 py-1 font-normal text-[10px] text-muted-foreground border-l border-border">Billable</th>
                      <th key={`${p.slug}-c`} className="text-right px-2 py-1 font-normal text-[10px] text-muted-foreground">Capacity</th>
                    </>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthKeys.map((mk, i) => (
                  <tr key={mk} className="border-b border-border/50 last:border-0">
                    <td className="px-3 py-1.5 text-foreground/90 whitespace-nowrap">{monthLabels[i] ?? mk}</td>
                    {PEOPLE.map((p) => (
                      <>
                        <td key={`${p.slug}-b-${mk}`} className="px-1 py-1 border-l border-border">
                          <Input
                            type="number" inputMode="decimal" step="any"
                            value={values[cellKey(`util_bill_${p.slug}`, mk)] ?? ''}
                            onChange={(e) => setValues((v) => ({
                              ...v, [cellKey(`util_bill_${p.slug}`, mk)]: e.target.value,
                            }))}
                            className="h-7 text-right tabular-nums text-xs w-20"
                          />
                        </td>
                        <td key={`${p.slug}-c-${mk}`} className="px-1 py-1">
                          <Input
                            type="number" inputMode="decimal" step="any"
                            value={values[cellKey(`util_cap_${p.slug}`, mk)] ?? ''}
                            onChange={(e) => setValues((v) => ({
                              ...v, [cellKey(`util_cap_${p.slug}`, mk)]: e.target.value,
                            }))}
                            className="h-7 text-right tabular-nums text-xs w-20"
                          />
                        </td>
                      </>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || loading}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}