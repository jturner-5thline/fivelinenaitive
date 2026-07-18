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
import { Loader2, ChevronLeft, ChevronRight, Search, MoreHorizontal, AlertCircle, Check, CircleDot, PauseCircle, CloudOff, Undo2 } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Link2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  PLANNABLE_DASHBOARDS,
  MASTER_PLAN_TAB_ORDER,
  buildPlanMetricKey,
  type PlannableDashboardKey,
} from './plannableWidgetsRegistry';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional dashboard tab to select when the dialog opens. */
  initialTab?: PlannableDashboardKey;
}

function pad(n: number) { return String(n).padStart(2, '0'); }

/**
 * Ordered list of dashboard entries visible in the Master Plan dialog.
 * Matches the Insights sidebar 1:1 (see DASHBOARD_OPTIONS in Insights.tsx).
 * All internal loops use this instead of iterating the full registry so
 * legacy/orphan dashboards don't appear as ghost tabs.
 */
const VISIBLE_ENTRIES: [PlannableDashboardKey, typeof PLANNABLE_DASHBOARDS[PlannableDashboardKey]][] =
  MASTER_PLAN_TAB_ORDER
    .filter((k) => Boolean(PLANNABLE_DASHBOARDS[k]))
    .map((k) => [k, PLANNABLE_DASHBOARDS[k]] as const) as any;
const VISIBLE_DEFS = VISIBLE_ENTRIES.map(([, d]) => d);

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

/** Compact currency display, e.g. 12000 -> "$12K", 1500000 -> "$1.5M". */
function formatCurrencyDisplay(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === '') return '';
  const n = parseInput(trimmed);
  if (n == null || !Number.isFinite(n as number)) return raw;
  const num = n as number;
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  const fmt = (v: number, unit: string) => {
    const s = v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
    return `${sign}$${s.replace(/\.?0+$/, '')}${unit}`;
  };
  if (abs >= 1_000_000_000) return fmt(abs / 1_000_000_000, 'B');
  if (abs >= 1_000_000) return fmt(abs / 1_000_000, 'M');
  if (abs >= 1_000) return fmt(abs / 1_000, 'K');
  return `${sign}$${abs.toLocaleString()}`;
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
export function MasterPlanDialog({ open, onOpenChange, initialTab }: Props) {
  const { user } = useAuth();
  const { company } = useCompany();
  const queryClient = useQueryClient();
  const [year, setYear] = useState<number>(() => new Date().getFullYear());
  const [values, setValues] = useState<Record<string, string>>({});
  const [focusedCell, setFocusedCell] = useState<string | null>(null);
  // Snapshot of loaded values so we only persist cells the user actually
  // edited — untouched blanks never trigger deletes, and untouched numbers
  // never re-upsert. This prevents saves from clobbering unrelated fields.
  const [initialValues, setInitialValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<string>('all');
  // Sync the active tab with the caller-provided initialTab whenever the
  // dialog is (re)opened. Falls back to "all" if none supplied.
  useEffect(() => {
    if (open) setActiveTab(initialTab ?? 'all');
  }, [open, initialTab]);
  // Track cells another user/session updated while this dialog was open —
  // shown as a subtle badge so the reviewer knows why a value changed.
  const [remoteUpdates, setRemoteUpdates] = useState<Record<string, number>>({});
  const [autosave, setAutosave] = useState(true);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Session change log — one entry per successful save (auto or manual) with
  // the exact cells touched. Cleared when the dialog closes.
  type HistoryChange = {
    cellKey: string;
    dashboards: string[]; // labels
    widget: string;       // label
    period: string;       // "Mar 2026"
    from: string;         // previous displayed value ('' == blank)
    to: string;           // new displayed value ('' == cleared)
  };
  type HistoryEntry = {
    id: string;
    at: Date;
    kind: 'auto' | 'manual';
    changes: HistoryChange[];
  };
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  useEffect(() => {
    if (!open) {
      setHistory([]);
      setHistoryOpen(false);
      setUndoStack([]);
    }
  }, [open]);

  // Undo stack: snapshots of `values` captured just before each user edit.
  // Cleared on successful save (each save = new baseline) and on close.
  // Capped so long editing sessions don't grow unbounded.
  const [undoStack, setUndoStack] = useState<Record<string, string>[]>([]);
  const UNDO_CAP = 100;
  // Wrapper around setValues that snapshots the pre-edit state so Undo can
  // revert the most recent change. Skip snapshotting when the updater is a
  // no-op (e.g. same value re-entered) to keep the stack useful.
  function setValuesWithUndo(
    updater: React.SetStateAction<Record<string, string>>,
  ) {
    setValues((v) => {
      const next = typeof updater === 'function' ? (updater as (p: Record<string, string>) => Record<string, string>)(v) : updater;
      // Only push if something actually changed.
      let changed = false;
      const keys = new Set([...Object.keys(v), ...Object.keys(next)]);
      for (const k of keys) {
        if ((v[k] ?? '') !== (next[k] ?? '')) { changed = true; break; }
      }
      if (changed) {
        setUndoStack((s) => {
          const snap = { ...v };
          const nextStack = [...s, snap];
          return nextStack.length > UNDO_CAP ? nextStack.slice(nextStack.length - UNDO_CAP) : nextStack;
        });
      }
      return next;
    });
  }
  function handleUndo() {
    setUndoStack((s) => {
      if (s.length === 0) return s;
      const prev = s[s.length - 1];
      setValues(prev);
      // Cancel any pending autosave so the revert isn't immediately committed
      // — user gets a chance to review before the next debounce cycle.
      if (autosaveTimer.current) {
        clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
      return s.slice(0, -1);
    });
  }
  // Ref mirrors of state so the realtime handler always sees current values
  // without needing to be re-subscribed on every keystroke.
  const valuesRef = useRef(values);
  const initialValuesRef = useRef(initialValues);
  useEffect(() => { valuesRef.current = values; }, [values]);
  useEffect(() => { initialValuesRef.current = initialValues; }, [initialValues]);

  // Build reverse lookup: plan metric_key -> widgetKey (widget lives in registry).
  const metricKeyToWidgetKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const [dk, def] of VISIBLE_ENTRIES) {
      for (const w of def.widgets) {
        m.set(buildPlanMetricKey(dk as PlannableDashboardKey, w.key), w.key);
      }
    }
    return m;
  }, []);
  // Ticker so the "Saved Xs ago" label refreshes without extra re-renders elsewhere.
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNowTick((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, [open]);

  // Realtime: react to concurrent writes on insights_metric_targets so this
  // dialog stays fresh even if another user (or the per-dashboard gear editor)
  // saves in parallel. Applies remote updates to cells the user hasn't touched;
  // for cells the user IS editing, records a conflict marker but never
  // overwrites their in-flight edit.
  useEffect(() => {
    if (!open) return;
    const channel = supabase
      .channel('master-plan-targets')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'insights_metric_targets' },
        (payload: any) => {
          const row = (payload.new ?? payload.old) as {
            metric_key?: string;
            period_month?: string | null;
            target_value?: number | null;
            company_id?: string | null;
          } | undefined;
          if (!row?.metric_key || !row.period_month) return;
          if ((company?.id ?? null) !== (row.company_id ?? null)) return;
          const widgetKey = metricKeyToWidgetKey.get(row.metric_key);
          if (!widgetKey) return; // not a plan:* key managed by this dialog
          const cellKey = `${widgetKey}|${row.period_month}`;
          const local = valuesRef.current[cellKey] ?? '';
          const initial = initialValuesRef.current[cellKey] ?? '';
          const isDirtyLocally = local !== initial;
          const remoteStr =
            payload.eventType === 'DELETE' || row.target_value == null
              ? ''
              : String(row.target_value);
          if (isDirtyLocally && local !== remoteStr) {
            // User is editing this cell — don't overwrite. Flag conflict.
            setRemoteUpdates((r) => ({ ...r, [cellKey]: (r[cellKey] ?? 0) + 1 }));
            return;
          }
          // Safe to apply: sync both current and baseline so it's not "dirty".
          setValues((v) => ({ ...v, [cellKey]: remoteStr }));
          setInitialValues((v) => ({ ...v, [cellKey]: remoteStr }));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [open, company?.id, metricKeyToWidgetKey]);

  const periods = useMemo(() => monthPeriodKeys(year), [year]);

  // Build a fast lookup of widget format by key for validation.
  const widgetFormatByKey = useMemo(() => {
    const m = new Map<string, 'currency' | 'percent' | 'number' | undefined>();
    for (const def of VISIBLE_DEFS) {
      for (const w of def.widgets) m.set(w.key, w.format as any);
    }
    return m;
  }, []);

  // widget key -> { label, dashboards: [labels] }, for history entry rendering.
  const widgetMetaByKey = useMemo(() => {
    const m = new Map<string, { label: string; dashboards: string[] }>();
    for (const def of VISIBLE_DEFS) {
      for (const w of def.widgets) {
        const cur = m.get(w.key);
        if (cur) { if (!cur.dashboards.includes(def.label)) cur.dashboards.push(def.label); }
        else m.set(w.key, { label: w.label, dashboards: [def.label] });
      }
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

  const dirtyCount = useMemo(
    () => Object.keys(values).filter((k) => (values[k] ?? '') !== (initialValues[k] ?? '')).length,
    [values, initialValues],
  );

  // Human-friendly "saved X ago" using nowTick as the refresh trigger.
  const savedAgoLabel = useMemo(() => {
    if (!lastSavedAt) return null;
    void nowTick; // subscribe to ticker
    const secs = Math.max(0, Math.round((Date.now() - lastSavedAt.getTime()) / 1000));
    if (secs < 5) return 'just now';
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    return lastSavedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }, [lastSavedAt, nowTick]);

  // Consolidated autosave status. Renders as a single pill in the header.
  type SaveStatus = {
    tone: 'saving' | 'error' | 'dirty' | 'off' | 'saved' | 'idle';
    icon: React.ReactNode;
    label: string;
    detail?: string;
  };
  const saveStatus: SaveStatus = useMemo(() => {
    if (saving) {
      return { tone: 'saving', icon: <Loader2 className="h-3 w-3 animate-spin" />, label: 'Saving…' };
    }
    if (hasErrors) {
      return {
        tone: 'error',
        icon: <AlertCircle className="h-3 w-3" />,
        label: 'Autosave blocked',
        detail: `${errorCount} invalid ${errorCount === 1 ? 'cell' : 'cells'}`,
      };
    }
    if (!autosave && dirtyCount > 0) {
      return {
        tone: 'off',
        icon: <CloudOff className="h-3 w-3" />,
        label: 'Autosave off',
        detail: `${dirtyCount} unsaved ${dirtyCount === 1 ? 'change' : 'changes'}`,
      };
    }
    if (dirtyCount > 0) {
      return {
        tone: 'dirty',
        icon: <CircleDot className="h-3 w-3" />,
        label: 'Unsaved changes',
        detail: `${dirtyCount} pending · autosaving…`,
      };
    }
    if (lastSavedAt && savedAgoLabel) {
      return {
        tone: 'saved',
        icon: <Check className="h-3 w-3" />,
        label: `Saved ${savedAgoLabel}`,
        detail: lastSavedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      };
    }
    return {
      tone: 'idle',
      icon: <PauseCircle className="h-3 w-3" />,
      label: autosave ? 'Autosave on' : 'Autosave off',
    };
  }, [saving, hasErrors, errorCount, autosave, dirtyCount, lastSavedAt, savedAgoLabel]);

  const statusToneClass: Record<SaveStatus['tone'], string> = {
    saving: 'border-primary/40 bg-primary/10 text-primary',
    error: 'border-destructive/50 bg-destructive/10 text-destructive',
    dirty: 'border-amber-500/50 bg-amber-500/10 text-amber-500',
    off: 'border-muted-foreground/40 bg-muted text-muted-foreground',
    saved: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500',
    idle: 'border-border bg-muted/40 text-muted-foreground',
  };

  // Map widgetKey -> list of dashboards where it appears. Widgets that share
  // the same key across multiple dashboards are treated as the SAME metric —
  // editing one tab's value updates all linked dashboards on save, and the
  // grid displays them from a single shared entry in state.
  const sharedIndex = useMemo(() => {
    const idx = new Map<string, { dashboards: PlannableDashboardKey[]; label: string }>();
    for (const [dk, def] of VISIBLE_ENTRIES) {
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
    const entries = VISIBLE_ENTRIES
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
        for (const [dk, def] of VISIBLE_ENTRIES) {
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

  /**
   * Manual "Save now" — cancels any pending debounced autosave and flushes
   * immediately. Keeps the dialog open so the user can continue editing.
   * No-op (with a toast) if there are validation errors or nothing dirty.
   */
  async function handleSaveNow() {
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    if (hasErrors) {
      toast.error(`Fix ${errorCount} invalid ${errorCount === 1 ? 'cell' : 'cells'} before saving`);
      return;
    }
    if (dirtyCount === 0) {
      if (autosave && lastSavedAt) {
        toast.success(`All changes already saved${savedAgoLabel ? ` (${savedAgoLabel})` : ''}`);
      } else {
        toast.info('No changes to save');
      }
      return;
    }
    return handleSaveInternal({ silent: false, keepOpen: true });
  }

  async function handleSaveInternal({ silent, keepOpen = false }: { silent: boolean; keepOpen?: boolean }) {
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
      for (const [dk, def] of VISIBLE_ENTRIES) {
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
      // Build history entry: one row per unique cellKey (dedupe across dashboards
      // that share the same widget). Uses the pre-save `initialValues` as the
      // "from" so linked-widget edits still show a single logical change.
      const periodLabelByKey = new Map(periods.map((p) => [p.key, p.label] as const));
      const seen = new Set<string>();
      const changes: HistoryChange[] = [];
      for (const [cellKey, raw] of Object.entries(values)) {
        const initial = initialValues[cellKey] ?? '';
        if ((raw ?? '') === initial) continue;
        if (seen.has(cellKey)) continue;
        seen.add(cellKey);
        const [widgetKey, periodKey] = cellKey.split('|');
        const meta = widgetMetaByKey.get(widgetKey);
        changes.push({
          cellKey,
          dashboards: meta?.dashboards ?? [],
          widget: meta?.label ?? widgetKey,
          period: periodLabelByKey.get(periodKey) ?? periodKey,
          from: initial,
          to: raw ?? '',
        });
      }
      if (changes.length > 0) {
        setHistory((h) => [
          { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: new Date(), kind: (silent ? 'auto' : 'manual') as 'auto' | 'manual', changes },
          ...h,
        ].slice(0, 50));
      }
      setInitialValues(values);
      setLastSavedAt(new Date());
      // Each save establishes a new baseline; pre-save edits are no longer
      // meaningfully "undoable" without re-writing the DB, so clear the stack.
      setUndoStack([]);
      if (!silent && !keepOpen) onOpenChange(false);
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
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleUndo}
              disabled={undoStack.length === 0 || saving}
              className="h-8"
              title={
                undoStack.length === 0
                  ? 'Nothing to undo'
                  : `Undo last change (${undoStack.length} step${undoStack.length === 1 ? '' : 's'} available) — cancels the pending autosave`
              }
            >
              <Undo2 className="h-3.5 w-3.5 mr-1.5" />
              Undo{undoStack.length > 0 ? ` (${undoStack.length})` : ''}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={handleSaveNow}
              disabled={saving || loading || hasErrors || dirtyCount === 0}
              className="h-8"
              title={
                hasErrors
                  ? `Fix ${errorCount} invalid ${errorCount === 1 ? 'cell' : 'cells'} first`
                  : dirtyCount === 0
                    ? 'No unsaved changes'
                    : 'Save now — bypasses the autosave delay and keeps this dialog open'
              }
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
              Save now{dirtyCount > 0 ? ` (${dirtyCount})` : ''}
            </Button>
            <div
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusToneClass[saveStatus.tone]}`}
              title={
                lastSavedAt
                  ? `Last saved ${lastSavedAt.toLocaleString()}`
                  : 'No changes saved yet in this session'
              }
              role="status"
              aria-live="polite"
            >
              {saveStatus.icon}
              <span>{saveStatus.label}</span>
              {saveStatus.detail && (
                <span className="opacity-70 font-normal">· {saveStatus.detail}</span>
              )}
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
          <TabsList
            aria-label="Dashboard filter"
            className="h-auto flex-wrap justify-start gap-1.5 bg-transparent p-1 border-b border-border/60 rounded-none w-full"
          >
            <TabsTrigger
              value="all"
              id="master-plan-tab-all"
              aria-controls="master-plan-grid"
              className="h-8 px-3 rounded-md text-xs font-medium text-muted-foreground border border-transparent transition-all hover:text-foreground hover:bg-muted/40 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:shadow-sm data-[state=active]:shadow-primary/20"
            >
              All
            </TabsTrigger>
            {VISIBLE_ENTRIES.map(([k, def]) => (
              <TabsTrigger
                key={k}
                value={k}
                id={`master-plan-tab-${k}`}
                aria-controls="master-plan-grid"
                className="h-8 px-3 rounded-md text-xs font-medium text-muted-foreground border border-transparent transition-all hover:text-foreground hover:bg-muted/40 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:shadow-sm data-[state=active]:shadow-primary/20"
              >
                {def.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Screen-reader announcement of the active tab change. */}
        <div className="sr-only" role="status" aria-live="polite">
          {`Showing ${activeTab === 'all' ? 'all dashboards' : PLANNABLE_DASHBOARDS[activeTab as PlannableDashboardKey]?.label ?? activeTab}`}
        </div>

        {loading ? (
          <div className="py-10 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div
            id="master-plan-grid"
            role="tabpanel"
            aria-labelledby={`master-plan-tab-${activeTab}`}
            aria-label={
              activeTab === 'all'
                ? 'Plan values for all dashboards'
                : `Plan values for ${PLANNABLE_DASHBOARDS[activeTab as PlannableDashboardKey]?.label ?? activeTab}`
            }
            tabIndex={0}
            className="max-h-[65vh] overflow-auto border border-border rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 z-10" style={{ background: 'linear-gradient(135deg, #020208 0%, #050d1f 20%, #040b14 40%, #02080f 60%, #0a0418 80%, #040008 100%)' }}>
                <tr className="border-b border-border">
                  <th
                    style={{ background: 'linear-gradient(135deg, #020208 0%, #050d1f 20%, #040b14 40%, #02080f 60%, #0a0418 80%, #040008 100%)' }}
                    className="text-left px-2 py-2 font-medium text-xs uppercase tracking-wider text-muted-foreground sticky left-0 border-r border-border whitespace-nowrap w-auto z-30 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.4)]"
                  >
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
                    <tr style={{ background: 'linear-gradient(135deg, #020208 0%, #050d1f 20%, #040b14 40%, #02080f 60%, #0a0418 80%, #040008 100%)' }}>
                      <td
                        colSpan={1 + periods.length}
                        style={{ background: 'linear-gradient(135deg, #020208 0%, #050d1f 20%, #040b14 40%, #02080f 60%, #0a0418 80%, #040008 100%)' }}
                        className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sticky left-0 z-20"
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
                          <td
                            style={{ background: 'linear-gradient(135deg, #020208 0%, #050d1f 20%, #040b14 40%, #02080f 60%, #0a0418 80%, #040008 100%)' }}
                            className="px-2 py-1.5 sticky left-0 z-20 border-r border-border whitespace-nowrap w-auto shadow-[2px_0_4px_-2px_rgba(0,0,0,0.4)]"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <div className="font-medium text-foreground/90 whitespace-nowrap">
                                  {w.label}
                                </div>
                                {isShared && (
                                  <TooltipProvider delayDuration={100}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          type="button"
                                          className="mt-1 inline-flex items-center gap-1 rounded bg-primary/10 hover:bg-primary/20 text-primary px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider cursor-help focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 transition-colors"
                                          aria-label={`Linked across ${linkedLabels.length} dashboards`}
                                        >
                                          <Link2 className="h-2.5 w-2.5" />
                                          Linked
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent side="right" align="start" className="max-w-xs p-3">
                                        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                                          Synced across {linkedLabels.length} dashboards
                                        </div>
                                        <ul className="space-y-1">
                                          {linkedLabels.map((l) => (
                                            <li
                                              key={l}
                                              className={`text-xs flex items-center gap-1.5 ${l === group.label ? 'text-primary font-medium' : 'text-foreground/80'}`}
                                            >
                                              <span className={`h-1.5 w-1.5 rounded-full ${l === group.label ? 'bg-primary' : 'bg-muted-foreground/50'}`} />
                                              {l}
                                              {l === group.label && <span className="text-[10px] text-muted-foreground">(current)</span>}
                                            </li>
                                          ))}
                                        </ul>
                                        <div className="text-[10px] text-muted-foreground mt-2 pt-2 border-t border-border">
                                          Editing here syncs to every listed dashboard.
                                        </div>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                                {w.hint && (
                                  <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                                    {w.hint}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <span className="text-[10px] font-semibold text-muted-foreground w-4 text-center">
                                  {w.format === 'currency' ? '$' : w.format === 'percent' ? '%' : '#'}
                                </span>
                                <RowBulkMenu
                                  widgetKey={w.key}
                                  periods={periods}
                                  values={values}
                                  setValues={setValuesWithUndo}
                                />
                              </div>
                            </div>
                          </td>
                          {periods.map((p) => {
                            const k = `${w.key}|${p.key}`;
                            const isDirty = (values[k] ?? '') !== (initialValues[k] ?? '');
                            const err = cellErrors[k];
                            const remoteHits = remoteUpdates[k] ?? 0;
                            const isFocused = focusedCell === k;
                            const rawVal = values[k] ?? '';
                            const displayVal =
                              w.format === 'currency' && !isFocused && rawVal.trim() !== '' && !err
                                ? formatCurrencyDisplay(rawVal)
                                : rawVal;
                            return (
                              <td key={p.key} className="px-1 py-1">
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  value={displayVal}
                                  onFocus={() => setFocusedCell(k)}
                                  onBlur={() => setFocusedCell((cur) => (cur === k ? null : cur))}
                                  onChange={(e) =>
                                    setValuesWithUndo((v) => ({ ...v, [k]: e.target.value }))
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
                                  title={
                                    err ??
                                    (remoteHits > 0
                                      ? `Someone else updated this cell ${remoteHits} time${remoteHits === 1 ? '' : 's'} while you were editing. Your local edit will overwrite theirs on save.`
                                      : undefined)
                                  }
                                />
                                {err && (
                                  <div className="text-[10px] text-destructive mt-0.5 text-right leading-tight">
                                    {err}
                                  </div>
                                )}
                                {!err && remoteHits > 0 && (
                                  <div className="text-[10px] text-amber-500 mt-0.5 text-right leading-tight">
                                    Remote update · conflict
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

        {history.length > 0 && (
          <div className="border-t border-border/60 pt-3">
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              aria-expanded={historyOpen}
              aria-controls="master-plan-history-panel"
            >
              <span>
                Change history · {history.length} save{history.length === 1 ? '' : 's'} this session
              </span>
              <span>{historyOpen ? '▾' : '▸'}</span>
            </button>
            {historyOpen && (
              <div
                id="master-plan-history-panel"
                className="mt-2 max-h-56 overflow-y-auto rounded-md border border-border/60 bg-muted/20 divide-y divide-border/60"
              >
                {history.map((entry) => (
                  <div key={entry.id} className="p-2 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">
                        {entry.at.toLocaleTimeString()} ·{' '}
                        <span className={entry.kind === 'auto' ? 'text-muted-foreground' : 'text-primary'}>
                          {entry.kind === 'auto' ? 'Autosaved' : 'Saved'}
                        </span>
                      </span>
                      <span className="text-muted-foreground">
                        {entry.changes.length} cell{entry.changes.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <ul className="space-y-0.5 pl-1">
                      {entry.changes.map((c) => (
                        <li key={c.cellKey} className="text-muted-foreground leading-snug">
                          <span className="text-foreground">{c.widget}</span>
                          {c.dashboards.length > 0 && (
                            <span className="text-[10px]"> ({c.dashboards.join(', ')})</span>
                          )}
                          {' · '}
                          <span className="text-foreground">{c.period}</span>
                          {': '}
                          <span className="line-through">{c.from || '—'}</span>
                          {' → '}
                          <span className="text-foreground">{c.to || '—'}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
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