import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
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
import { Loader2, ChevronLeft, ChevronRight, Search, MoreHorizontal, AlertCircle, Check } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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

/**
 * Per-row bulk-fill menu for the Master Plan grid. Lets a user copy a single
 * month's value to the rest of the year, the next quarter, or the next year,
 * without hand-typing 12 cells.
 */
function RowBulkMenu({
  widgetKey,
  periods,
  values,
  setValues,
}: {
  widgetKey: string;
  periods: { key: string; label: string }[];
  values: Record<string, string>;
  setValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  const [open, setOpen] = useState(false);
  const [sourceIdx, setSourceIdx] = useState(0);

  function apply(fill: (i: number) => number | null) {
    const src = values[`${widgetKey}|${periods[sourceIdx].key}`] ?? '';
    if (src.trim() === '') {
      toast.error(`${periods[sourceIdx].label} is empty — enter a value first`);
      return;
    }
    setValues((v) => {
      const next = { ...v };
      for (let i = 0; i < periods.length; i++) {
        const targetIdx = fill(i);
        if (targetIdx == null) continue;
        if (targetIdx < 0 || targetIdx >= periods.length) continue;
        next[`${widgetKey}|${periods[targetIdx].key}`] = src;
      }
      return next;
    });
    setOpen(false);
  }

  function copyToAll() {
    apply((i) => i);
  }
  function copyToRestOfYear() {
    apply((i) => (i > sourceIdx ? i : null));
  }
  function copyToNextQuarter() {
    // Fill the 3 months immediately after the source month.
    apply((i) => (i > sourceIdx && i <= sourceIdx + 3 ? i : null));
  }
  function clearRow() {
    setValues((v) => {
      const next = { ...v };
      for (const p of periods) next[`${widgetKey}|${p.key}`] = '';
      return next;
    });
    setOpen(false);
  }

  function copyYearToNextYear() {
    // Take the full 12-month plan and write it into the same months of the
    // following year so users can roll a plan forward in one click.
    const filled = periods.filter((p) => (values[`${widgetKey}|${p.key}`] ?? '').trim() !== '');
    if (filled.length === 0) {
      toast.error('This row is empty — enter values first');
      return;
    }
    setValues((v) => {
      const next = { ...v };
      for (const p of periods) {
        const src = v[`${widgetKey}|${p.key}`] ?? '';
        if (src.trim() === '') continue;
        const [yr, mo] = p.key.split('-');
        const nextYearKey = `${Number(yr) + 1}-${mo}`;
        next[`${widgetKey}|${nextYearKey}`] = src;
      }
      return next;
    });
    toast.success(`Copied ${filled.length} month${filled.length === 1 ? '' : 's'} to next year`);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 opacity-60 hover:opacity-100"
          aria-label="Bulk fill row"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3 space-y-2" align="start">
        <div className="text-xs font-medium text-foreground">Bulk fill row</div>
        <label className="block text-[11px] text-muted-foreground">
          Source month
          <select
            value={sourceIdx}
            onChange={(e) => setSourceIdx(Number(e.target.value))}
            className="mt-1 w-full h-8 rounded-md border border-border bg-background px-2 text-sm"
          >
            {periods.map((p, i) => (
              <option key={p.key} value={i}>{p.label}</option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-1 pt-1">
          <Button size="sm" variant="secondary" className="justify-start h-8" onClick={copyToAll}>
            Copy to all 12 months
          </Button>
          <Button size="sm" variant="secondary" className="justify-start h-8" onClick={copyToRestOfYear}>
            Copy to rest of year
          </Button>
          <Button size="sm" variant="secondary" className="justify-start h-8" onClick={copyToNextQuarter}>
            Copy to next quarter (3 mo)
          </Button>
          <Button size="sm" variant="secondary" className="justify-start h-8" onClick={copyYearToNextYear}>
            Copy full year → next year
          </Button>
          <Button size="sm" variant="ghost" className="justify-start h-8 text-destructive hover:text-destructive" onClick={clearRow}>
            Clear row
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

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

/** Validate a single cell. Returns null if valid (or blank), or an error message. */
function validateCell(raw: string, format: 'currency' | 'percent' | 'number' | undefined): string | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const num = parseInput(trimmed);
  if (num === null || !Number.isFinite(num as number)) {
    return 'Not a valid number (try 1.2M, 500k, 42)';
  }
  if ((num as number) < 0) return 'Must be zero or positive';
  if (format === 'percent' && ((num as number) > 100)) {
    return 'Percent must be ≤ 100';
  }
  return null;
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
  const [autosave, setAutosave] = useState(true);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const periods = useMemo(() => monthPeriodKeys(year), [year]);

  // Build a fast lookup of widget format by key for validation.
  const widgetFormatByKey = useMemo(() => {
    const m = new Map<string, 'currency' | 'percent' | 'number' | undefined>();
    for (const def of Object.values(PLANNABLE_DASHBOARDS)) {
      for (const w of def.widgets) m.set(w.key, w.format as any);
    }
    return m;
  }, []);

  // Per-cell validation errors. Recomputed only for cells the user has typed in.
  const cellErrors = useMemo(() => {
    const errs: Record<string, string> = {};
    for (const [k, raw] of Object.entries(values)) {
      const widgetKey = k.split('|')[0];
      const fmt = widgetFormatByKey.get(widgetKey);
      const err = validateCell(raw, fmt);
      if (err) errs[k] = err;
    }
    return errs;
  }, [values, widgetFormatByKey]);
  const errorCount = Object.keys(cellErrors).length;
  const hasErrors = errorCount > 0;

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
    return handleSaveInternal({ silent: false });
  }

  async function handleSaveInternal({ silent }: { silent: boolean }) {
    if (!user) { if (!silent) toast.error('Not signed in'); return; }
    if (hasErrors) {
      if (!silent) toast.error(`Fix ${errorCount} invalid ${errorCount === 1 ? 'cell' : 'cells'} before saving`);
      return;
    }
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
        if (!silent) toast.info('No changes to save');
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
      if (!silent) {
        toast.success(`Master plan saved — ${editedCells} cell${editedCells === 1 ? '' : 's'} updated`);
      }
      setInitialValues(values);
      setLastSavedAt(new Date());
      if (!silent) onOpenChange(false);
    } catch (e: any) {
      if (!silent) toast.error('Save failed', { description: e?.message });
      else toast.error('Autosave failed', { description: e?.message });
    } finally {
      setSaving(false);
    }
  }

  // Debounced autosave: 1.5s after the last edit, if there are dirty valid cells.
  useEffect(() => {
    if (!open || !autosave || loading || saving || hasErrors) return;
    const dirty = Object.keys(values).some((k) => (values[k] ?? '') !== (initialValues[k] ?? ''));
    if (!dirty) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      handleSaveInternal({ silent: true });
    }, 1500);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, initialValues, autosave, open, loading, saving, hasErrors]);

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
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autosave}
                onChange={(e) => setAutosave(e.target.checked)}
                className="h-3.5 w-3.5 accent-primary"
              />
              Autosave
            </label>
            {saving ? (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Saving…
              </span>
            ) : lastSavedAt ? (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Check className="h-3 w-3 text-primary" />
                Saved {lastSavedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </span>
            ) : null}
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
        </div>

        {hasErrors && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <div className="font-medium">
                {errorCount} invalid {errorCount === 1 ? 'cell' : 'cells'} — fix before saving
              </div>
              <div className="text-destructive/80 mt-0.5">
                Autosave is paused. Cells are outlined in red with the exact issue below each row.
              </div>
            </div>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-auto flex-wrap justify-start gap-1.5 bg-transparent p-1 border-b border-border/60 rounded-none w-full">
            <TabsTrigger
              value="all"
              className="h-8 px-3 rounded-md text-xs font-medium text-muted-foreground border border-transparent transition-all hover:text-foreground hover:bg-muted/40 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:shadow-sm data-[state=active]:shadow-primary/20"
            >
              All
            </TabsTrigger>
            {(Object.entries(PLANNABLE_DASHBOARDS) as [PlannableDashboardKey, typeof PLANNABLE_DASHBOARDS[PlannableDashboardKey]][]).map(([k, def]) => (
              <TabsTrigger
                key={k}
                value={k}
                className="h-8 px-3 rounded-md text-xs font-medium text-muted-foreground border border-transparent transition-all hover:text-foreground hover:bg-muted/40 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:shadow-sm data-[state=active]:shadow-primary/20"
              >
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
                              <RowBulkMenu
                                widgetKey={w.key}
                                periods={periods}
                                values={values}
                                setValues={setValues}
                              />
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
                            const err = cellErrors[k];
                            return (
                              <td key={p.key} className="px-1 py-1">
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  value={values[k] ?? ''}
                                  onChange={(e) =>
                                    setValues((v) => ({ ...v, [k]: e.target.value }))
                                  }
                                  className={`h-8 text-right tabular-nums px-2 ${
                                    err
                                      ? 'ring-1 ring-destructive bg-destructive/5 border-destructive'
                                      : isDirty
                                        ? 'ring-1 ring-primary/60 bg-primary/5'
                                        : ''
                                  }`}
                                  placeholder="—"
                                  aria-invalid={!!err}
                                  title={err ?? undefined}
                                />
                                {err && (
                                  <div className="text-[10px] text-destructive mt-0.5 text-right leading-tight">
                                    {err}
                                  </div>
                                )}
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
            Close
          </Button>
          <Button onClick={handleSave} disabled={saving || loading || hasErrors}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {hasErrors ? `Fix ${errorCount} error${errorCount === 1 ? '' : 's'} to save` : 'Save master plan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}