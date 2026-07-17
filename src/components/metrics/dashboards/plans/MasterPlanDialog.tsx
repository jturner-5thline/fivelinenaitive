import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  PLANNABLE_DASHBOARDS,
  buildPlanMetricKey,
  type PlannableDashboardKey,
} from './plannableWidgetsRegistry';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function pad(n: number) { return String(n).padStart(2, '0'); }

function monthPeriodKeys(year: number): { key: string; label: string }[] {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(year, i, 1);
    return {
      key: `${year}-${pad(i + 1)}`,
      label: d.toLocaleDateString('en-US', { month: 'short' }),
    };
  });
}

function parseInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const cleaned = trimmed.replace(/[$,\s]/g, '');
  const suffix = cleaned.slice(-1).toLowerCase();
  let mult = 1;
  let body = cleaned;
  if (suffix === 'k') { mult = 1_000; body = cleaned.slice(0, -1); }
  else if (suffix === 'm') { mult = 1_000_000; body = cleaned.slice(0, -1); }
  else if (suffix === 'b') { mult = 1_000_000_000; body = cleaned.slice(0, -1); }
  const n = Number(body);
  if (!Number.isFinite(n)) return NaN as any;
  return n * mult;
}

/**
 * Master Plan editor: every widget across every dashboard in a single
 * Excel-style monthly grid. Values persist in `insights_metric_targets`
 * under the same `plan:{dashboard}:{widget}` keys used by the per-dashboard
 * gear editor, so the two views stay in sync.
 */
export function MasterPlanDialog({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { company } = useCompany();
  const queryClient = useQueryClient();
  const [year, setYear] = useState<number>(() => new Date().getFullYear());
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const periods = useMemo(() => monthPeriodKeys(year), [year]);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (Object.entries(PLANNABLE_DASHBOARDS) as [PlannableDashboardKey, typeof PLANNABLE_DASHBOARDS[PlannableDashboardKey]][])
      .map(([key, def]) => {
        const widgets = q
          ? def.widgets.filter(
              (w) =>
                w.label.toLowerCase().includes(q) ||
                def.label.toLowerCase().includes(q),
            )
          : def.widgets;
        return { key, label: def.label, widgets };
      })
      .filter((g) => g.widgets.length > 0);
  }, [search]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const metricKeys: string[] = [];
        for (const [dk, def] of Object.entries(PLANNABLE_DASHBOARDS)) {
          for (const w of def.widgets) {
            metricKeys.push(buildPlanMetricKey(dk as PlannableDashboardKey, w.key));
          }
        }
        const periodKeys = periods.map((p) => p.key);
        // PostgREST caps the URL length; chunk metric keys defensively.
        const chunks: string[][] = [];
        const size = 200;
        for (let i = 0; i < metricKeys.length; i += size) {
          chunks.push(metricKeys.slice(i, i + size));
        }
        const next: Record<string, string> = {};
        for (const chunk of chunks) {
          let q = supabase
            .from('insights_metric_targets' as any)
            .select('metric_key, period_month, target_value')
            .in('metric_key', chunk)
            .in('period_month', periodKeys);
          q = company?.id ? q.eq('company_id', company.id) : q.is('company_id', null);
          const { data, error } = await q;
          if (error) throw error;
          for (const row of (data ?? []) as any[]) {
            next[`${row.metric_key}|${row.period_month}`] = String(row.target_value ?? '');
          }
        }
        if (!cancelled) setValues(next);
      } catch (e: any) {
        toast.error('Failed to load master plan', { description: e?.message });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, year, company?.id, periods]);

  async function handleSave() {
    if (!user) { toast.error('Not signed in'); return; }
    setSaving(true);
    try {
      const upserts: any[] = [];
      const clearedByMetric: Record<string, string[]> = {};
      for (const [dk, def] of Object.entries(PLANNABLE_DASHBOARDS)) {
        for (const w of def.widgets) {
          const mk = buildPlanMetricKey(dk as PlannableDashboardKey, w.key);
          for (const p of periods) {
            const raw = values[`${mk}|${p.key}`] ?? '';
            if (raw.trim() === '') {
              (clearedByMetric[mk] ||= []).push(p.key);
              continue;
            }
            const num = parseInput(raw);
            if (!Number.isFinite(num as number)) {
              throw new Error(`Invalid number "${raw}" for ${def.label} · ${w.label} ${p.label}`);
            }
            upserts.push({
              owner_user_id: user.id,
              company_id: company?.id ?? null,
              metric_key: mk,
              metric_label: `${def.label} · ${w.label}`,
              period_month: p.key,
              target_value: num,
            });
          }
        }
      }
      const upsertPromise = upserts.length > 0
        ? supabase
            .from('insights_metric_targets' as any)
            .upsert(upserts, { onConflict: 'company_id,metric_key,period_month' })
        : Promise.resolve({ error: null } as any);
      const deletePromises = Object.entries(clearedByMetric)
        .filter(([, pks]) => pks.length > 0)
        .map(([mk, pks]) => {
          let del = supabase
            .from('insights_metric_targets' as any)
            .delete()
            .eq('metric_key', mk)
            .in('period_month', pks);
          del = company?.id ? del.eq('company_id', company.id) : del.is('company_id', null);
          return del;
        });
      const results = await Promise.all([upsertPromise, ...deletePromises]);
      const firstErr = results.find((r: any) => r?.error)?.error;
      if (firstErr) throw firstErr;
      queryClient.invalidateQueries({ queryKey: ['insights-metric-targets'] });
      toast.success('Master plan saved');
      onOpenChange(false);
    } catch (e: any) {
      toast.error('Save failed', { description: e?.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[92vw] w-[92vw]">
        <DialogHeader>
          <DialogTitle>Master Plan — All Insights Dashboards</DialogTitle>
          <DialogDescription>
            Enter monthly plan/target values for every widget across every
            Insights dashboard. Powers the upcoming variance-to-plan
            comparisons. Leave blank to clear. Shorthand supported:{' '}
            <span className="font-mono">1.2M</span>,{' '}
            <span className="font-mono">500k</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search dashboards or widgets…"
              className="h-8 pl-8"
            />
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setYear((y) => y - 1)} aria-label="Previous year">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-16 text-center font-medium tabular-nums">{year}</div>
            <Button variant="ghost" size="icon" onClick={() => setYear((y) => y + 1)} aria-label="Next year">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="py-10 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="max-h-[65vh] overflow-auto border border-border rounded-md">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-2 font-medium text-xs uppercase tracking-wider text-muted-foreground sticky left-0 bg-card min-w-64 z-10">
                    Widget
                  </th>
                  {periods.map((p) => (
                    <th
                      key={p.key}
                      className="text-right px-2 py-2 font-medium text-xs uppercase tracking-wider text-muted-foreground min-w-24"
                    >
                      {p.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <Fragment key={group.key}>
                    <tr className="bg-muted/40">
                      <td
                        colSpan={1 + periods.length}
                        className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sticky left-0 bg-muted/40"
                      >
                        {group.label}
                      </td>
                    </tr>
                    {group.widgets.map((w) => {
                      const mk = buildPlanMetricKey(group.key, w.key);
                      return (
                        <tr key={`${group.key}-${w.key}`} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                          <td className="px-3 py-1.5 sticky left-0 bg-card">
                            <div className="font-medium text-foreground/90">{w.label}</div>
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              {w.format === 'currency' ? '$' : w.format === 'percent' ? '%' : '#'}
                              {w.hint ? ` · ${w.hint}` : ''}
                            </div>
                          </td>
                          {periods.map((p) => {
                            const k = `${mk}|${p.key}`;
                            return (
                              <td key={p.key} className="px-1 py-1">
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  value={values[k] ?? ''}
                                  onChange={(e) =>
                                    setValues((v) => ({ ...v, [k]: e.target.value }))
                                  }
                                  className="h-8 text-right tabular-nums px-2"
                                  placeholder="—"
                                />
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
                {groups.length === 0 && (
                  <tr>
                    <td colSpan={1 + periods.length} className="py-10 text-center text-muted-foreground">
                      No widgets match your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save master plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}