import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Pencil, Loader2, Users, Settings } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ResponsiveContainer, LineChart, Line, YAxis, Tooltip } from 'recharts';

/**
 * Utilization KPI widget for the FinServ Financial Metrics tab.
 *
 * Displays a Blended utilization headline (average of the 3 people's %) and
 * compact per-person rows for Scott, Siddhi, and Kris. A single actual %
 * per person per month is entered via the pencil dialog, and a per-person
 * goal % is set via the gear dialog. Persisted in `metric_manual_inputs`.
 *
 * Metric keys:
 *   util_pct_<slug>    monthly actual utilization %  (month_key = YYYY-MM)
 *   util_goal_<slug>   goal utilization %            (month_key = YYYY-MM)
 */

type PersonSlug = 'scott' | 'siddhi' | 'kris';

const PEOPLE: Array<{ slug: PersonSlug; name: string }> = [
  { slug: 'scott', name: 'Scott' },
  { slug: 'siddhi', name: 'Siddhi' },
  { slug: 'kris', name: 'Kris' },
];

const PCT_KEYS = PEOPLE.map((p) => `util_pct_${p.slug}`);
const GOAL_KEYS = PEOPLE.map((p) => `util_goal_${p.slug}`);

const avg = (nums: number[]) =>
  nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : null;

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
  const [actualsOpen, setActualsOpen] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['utilization-widget', companyId, monthKeys.join('|')],
    queryFn: async () => {
      const out: Record<string, Record<string, number>> = {};
      const allKeys = [...PCT_KEYS, ...GOAL_KEYS];
      const monthFilter = [...monthKeys];
      if (monthFilter.length === 0) return out;
      let q = supabase
        .from('metric_manual_inputs')
        .select('metric_key, month_key, value')
        .in('metric_key', allKeys)
        .in('month_key', monthFilter);
      q = companyId ? q.eq('company_id', companyId) : q.is('company_id', null);
      const { data, error } = await q;
      if (error) throw error;
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
      const pcts = data?.[`util_pct_${p.slug}`] ?? {};
      const goals = data?.[`util_goal_${p.slug}`] ?? {};
      const series = monthKeys.map((mk, i) => {
        const raw = pcts[mk];
        const pct = raw == null ? null : Number(raw);
        return { month: monthLabels[i] ?? mk, monthKey: mk, pct };
      });
      const headline = avg(series.map((r) => r.pct).filter((v): v is number => v != null));
      const goalVals = monthKeys.map((mk) => (goals[mk] == null ? null : Number(goals[mk])));
      const goal = avg(goalVals.filter((v): v is number => v != null));
      return { ...p, series, headline, goal };
    });
  }, [data, monthKeys, monthLabels]);

  const blended = useMemo(() => {
    const series = monthKeys.map((mk, i) => {
      const vals = perPerson
        .map((p) => p.series[i]?.pct)
        .filter((v): v is number => v != null);
      return { month: monthLabels[i] ?? mk, monthKey: mk, pct: avg(vals) };
    });
    const headline = avg(series.map((r) => r.pct).filter((v): v is number => v != null));
    const goals = perPerson.map((p) => p.goal).filter((v): v is number => v != null);
    const goal = avg(goals);
    return { headline, series, goal };
  }, [perPerson, monthKeys, monthLabels]);

  const hasAny = perPerson.some((p) => p.series.some((r) => r.pct != null));

  return (
    <Card className="glass-module">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-medium">Utilization</CardTitle>
            <Badge variant="outline" className="w-fit text-xs mt-1">{badge}</Badge>
          </div>
          <div className="flex items-center gap-0.5 -mr-1 -mt-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label="Set utilization goals"
              title="Set goal % per person"
              onClick={() => setGoalsOpen(true)}
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label="Enter utilization actuals"
              title="Enter monthly utilization % per person"
              onClick={() => setActualsOpen(true)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>
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
            <p className="text-sm font-medium">No utilization entered</p>
            <p className="text-xs mt-1 opacity-60">
              Click the pencil to enter monthly utilization %
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
                Blended{blended.goal != null ? ` · Goal ${fmtPct(blended.goal)}` : ''}
              </div>
            </div>

            {/* Per-person rows */}
            <div className="space-y-2">
              {perPerson.map((p) => (
                <PersonRow key={p.slug} name={p.name} series={p.series} headline={p.headline} goal={p.goal} />
              ))}
            </div>
          </div>
        )}
      </CardContent>

      <UtilizationActualsDialog
        open={actualsOpen}
        onOpenChange={setActualsOpen}
        monthKeys={monthKeys}
        monthLabels={monthLabels}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['utilization-widget'] });
        }}
        onOpenGoals={() => {
          setActualsOpen(false);
          setGoalsOpen(true);
        }}
      />
      <UtilizationGoalsDialog
        open={goalsOpen}
        onOpenChange={setGoalsOpen}
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
  goal,
}: {
  name: string;
  series: Array<{ month: string; pct: number | null }>;
  headline: number | null;
  goal: number | null;
}) {
  const chartData = series.map((s) => ({ month: s.month, pct: s.pct }));
  const hasSeries = series.some((s) => s.pct != null);
  return (
    <div className="grid grid-cols-[80px_1fr_70px] items-center gap-3 border-t border-border/40 pt-2 first:border-0 first:pt-0">
      <div>
        <div className="text-sm font-medium text-foreground">{name}</div>
        <div className="text-[10px] text-muted-foreground tabular-nums">
          {goal != null ? `Goal ${fmtPct(goal)}` : 'No goal'}
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

function UtilizationActualsDialog({
  open,
  onOpenChange,
  monthKeys,
  monthLabels,
  onSaved,
  onOpenGoals,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  monthKeys: string[];
  monthLabels: string[];
  onSaved?: () => void;
  onOpenGoals?: () => void;
}) {
  const { company } = useCompany();
  const companyId = company?.id ?? null;
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        let q = supabase
          .from('metric_manual_inputs')
          .select('metric_key, month_key, value')
          .in('metric_key', PCT_KEYS)
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
          const metric = `util_pct_${p.slug}`;
          const raw = (values[cellKey(metric, mk)] ?? '').trim();
          const num = raw === '' ? null : Number(raw);
          if (raw !== '' && Number.isNaN(num)) {
            throw new Error(`Invalid number for ${p.name} ${mk}`);
          }
          payload.push({
            company_id: companyId, user_id: uid, metric_key: metric, month_key: mk, value: num,
          });
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
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <DialogTitle>Enter Utilization %</DialogTitle>
              <DialogDescription>
                Monthly actual utilization % per person. Set goals via the gear icon.
              </DialogDescription>
            </div>
            {onOpenGoals && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 mr-6"
                aria-label="Set utilization goals"
                title="Set goal % per person / month"
                onClick={onOpenGoals}
              >
                <Settings className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
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
                  <th className="text-left px-3 py-2 font-medium uppercase tracking-wider text-muted-foreground">Month</th>
                  {PEOPLE.map((p) => (
                    <th key={p.slug} className="text-right px-2 py-2 font-medium uppercase tracking-wider text-muted-foreground border-l border-border">
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthKeys.map((mk, i) => (
                  <tr key={mk} className="border-b border-border/50 last:border-0">
                    <td className="px-3 py-1.5 text-foreground/90 whitespace-nowrap">{monthLabels[i] ?? mk}</td>
                    {PEOPLE.map((p) => (
                      <td key={p.slug} className="px-1 py-1 border-l border-border">
                        <Input
                          type="text" inputMode="decimal"
                          placeholder="%"
                          value={values[cellKey(`util_pct_${p.slug}`, mk)] ?? ''}
                          onChange={(e) => setValues((v) => ({
                            ...v, [cellKey(`util_pct_${p.slug}`, mk)]: e.target.value,
                          }))}
                          className="h-7 text-right tabular-nums text-xs w-24 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </td>
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

function UtilizationGoalsDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const { company } = useCompany();
  const companyId = company?.id ?? null;
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        let q = supabase
          .from('metric_manual_inputs')
          .select('metric_key, value')
          .in('metric_key', GOAL_KEYS)
          .eq('month_key', GOAL_MONTH_KEY);
        q = companyId ? q.eq('company_id', companyId) : q.is('company_id', null);
        const { data, error } = await q;
        if (error) throw error;
        if (cancelled) return;
        const next: Record<string, string> = {};
        for (const r of data ?? []) {
          const v = (r as any).value;
          next[(r as any).metric_key] = v == null ? '' : String(v);
        }
        setValues(next);
      } catch (e: any) {
        toast.error('Failed to load goals', { description: e?.message });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, companyId]);

  async function save() {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) { toast.error('Not signed in'); return; }
    setSaving(true);
    try {
      const payload = PEOPLE.map((p) => {
        const metric = `util_goal_${p.slug}`;
        const raw = (values[metric] ?? '').trim();
        const num = raw === '' ? null : Number(raw);
        if (raw !== '' && Number.isNaN(num)) {
          throw new Error(`Invalid goal for ${p.name}`);
        }
        return {
          company_id: companyId,
          user_id: uid,
          metric_key: metric,
          month_key: GOAL_MONTH_KEY,
          value: num,
        };
      });
      const { error } = await supabase
        .from('metric_manual_inputs')
        .upsert(payload, { onConflict: 'company_id,metric_key,month_key' });
      if (error) throw error;
      toast.success('Goals saved');
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Utilization Goals</DialogTitle>
          <DialogDescription>
            Target utilization % per person. Blended goal is the average.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="py-10 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-3 py-2">
            {PEOPLE.map((p) => {
              const metric = `util_goal_${p.slug}`;
              return (
                <div key={p.slug} className="flex items-center justify-between gap-3">
                  <label htmlFor={metric} className="text-sm font-medium text-foreground">
                    {p.name}
                  </label>
                  <div className="flex items-center gap-1">
                    <Input
                      id={metric}
                      type="text" inputMode="decimal"
                      placeholder="e.g. 75"
                      value={values[metric] ?? ''}
                      onChange={(e) => setValues((v) => ({ ...v, [metric]: e.target.value }))}
                      className="h-8 text-right tabular-nums w-28 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                </div>
              );
            })}
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