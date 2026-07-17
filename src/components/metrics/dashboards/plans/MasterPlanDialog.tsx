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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  // Snapshot of loaded values so we only persist cells the user actually
  // edited — untouched blanks never trigger deletes, and untouched numbers
  // never re-upsert. This prevents saves from clobbering unrelated fields.
  const [initialValues, setInitialValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<string>('all');

  const periods = useMemo(() => monthPeriodKeys(year), [year]);

  // Map widgetKey -> list of dashboards where it appears. Widgets that share
  // the same key across multiple dashboards are treated as the SAME metric —
  // editing one tab's value updates all linked dashboards on save, and the
  // grid displays them from a single shared entry in state.
  const sharedIndex = useMemo(() => {
    const idx = new Map<string, { dashboards: PlannableDashboardKey[]; label: string }>();
    for (const [dk, def] of Object.entries(PLANNABLE_DASHBOARDS) as [PlannableDashboardKey, typeof PLANNABLE_DASHBOARDS[PlannableDashboardKey]][]) {
      for (const w of def.widgets) {
        const cur = idx.get(w.key);
        if (cur) cur.dashboards.push(dk);
        else idx.set(w.key, { dashboards: [dk], label: w.label });
      }
    }
    return idx;
  }, []);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const entries = (Object.entries(PLANNABLE_DASHBOARDS) as [PlannableDashboardKey, typeof PLANNABLE_DASHBOARDS[PlannableDashboardKey]][])
      // When searching, always scan every dashboard so hits aren't hidden
      // by the active tab filter.
      .filter(([key]) => q !== '' || activeTab === 'all' || key === activeTab);
    return entries
      .map(([key, def]) => {
        const widgets = q
          ? def.widgets.filter(
              (w) =>
                w.label.toLowerCase().includes(q) ||
                (w.hint?.toLowerCase().includes(q) ?? false) ||
                def.label.toLowerCase().includes(q),
            )
          : def.widgets;
        return { key, label: def.label, widgets };
      })
      .filter((g) => g.widgets.length > 0);
  }, [search, activeTab]);

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
            // metric_key format: plan:{dashboard}:{widgetKey}
            const parts = String(row.metric_key).split(':');
            const widgetKey = parts.slice(2).join(':');
            const shared = `${widgetKey}|${row.period_month}`;
            // Last-write wins; shared widgets should already be synced.
            next[shared] = String(row.target_value ?? '');
          }
        }
        if (!cancelled) {
          setValues(next);
          setInitialValues(next);
        }
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
      // Track shared widget keys we've already queued so linked dashboards
      // don't produce duplicate upserts (they still all get written because
      // we loop every dashboard's metric_key below — this just skips no-op
      // work for unchanged cells).
      for (const [dk, def] of Object.entries(PLANNABLE_DASHBOARDS)) {
        for (const w of def.widgets) {
          const mk = buildPlanMetricKey(dk as PlannableDashboardKey, w.key);
          for (const p of periods) {
            const cellKey = `${w.key}|${p.key}`;
            const raw = values[cellKey] ?? '';
            const initial = initialValues[cellKey] ?? '';
            // Skip cells the user didn't touch — protects unrelated fields.
            if (raw === initial) continue;
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
      if (upserts.length === 0 && Object.keys(clearedByMetric).length === 0) {
        toast.info('No changes to save');
        setSaving(false);
        return;
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
      const editedCells = upserts.length + Object.values(clearedByMetric).reduce((a, b) => a + b.length, 0);
      toast.success(`Master plan saved — ${editedCells} cell${editedCells === 1 ? '' : 's'} updated`);
      setInitialValues(values);
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
            <span className="block mt-1 text-xs">
              Widgets marked <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-primary/15 text-primary text-[9px] uppercase tracking-wider">Linked</span> appear on multiple dashboards — a single edit syncs across every tab and saves to all linked dashboards at once. Untouched fields are never overwritten.
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search all metrics across dashboards…"
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

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
            <TabsTrigger value="all" className="data-[state=active]:bg-muted">All</TabsTrigger>
            {(Object.entries(PLANNABLE_DASHBOARDS) as [PlannableDashboardKey, typeof PLANNABLE_DASHBOARDS[PlannableDashboardKey]][]).map(([k, def]) => (
              <TabsTrigger key={k} value={k} className="data-[state=active]:bg-muted">
                {def.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

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
                      const linked = sharedIndex.get(w.key);
                      const isShared = (linked?.dashboards.length ?? 0) > 1;
                      const linkedLabels = isShared
                        ? linked!.dashboards.map((d) => PLANNABLE_DASHBOARDS[d].label)
                        : [];
                      return (
                        <tr key={`${group.key}-${w.key}`} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                          <td className="px-3 py-1.5 sticky left-0 bg-card">
                            <div className="font-medium text-foreground/90 flex items-center gap-2">
                              {w.label}
                              {isShared && (
                                <span
                                  className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/15 text-primary"
                                  title={`Linked across: ${linkedLabels.join(', ')}. Editing here syncs to all of them.`}
                                >
                                  Linked · {linkedLabels.length}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              {w.format === 'currency' ? '$' : w.format === 'percent' ? '%' : '#'}
                              {w.hint ? ` · ${w.hint}` : ''}
                            </div>
                            {isShared && (
                              <div className="text-[10px] text-primary/80 mt-0.5">
                                Syncs with: {linkedLabels.filter((l) => l !== group.label).join(', ')}
                              </div>
                            )}
                          </td>
                          {periods.map((p) => {
                            const k = `${w.key}|${p.key}`;
                            const isDirty = (values[k] ?? '') !== (initialValues[k] ?? '');
                            return (
                              <td key={p.key} className="px-1 py-1">
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  value={values[k] ?? ''}
                                  onChange={(e) =>
                                    setValues((v) => ({ ...v, [k]: e.target.value }))
                                  }
                                  className={`h-8 text-right tabular-nums px-2 ${isDirty ? 'ring-1 ring-primary/60 bg-primary/5' : ''}`}
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