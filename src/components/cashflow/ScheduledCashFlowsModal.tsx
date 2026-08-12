import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { format, parseISO } from 'date-fns';
import {
  Trash2,
  Plus,
  GripVertical,
  Calendar as CalendarIcon,
  Building2,
  Tag,
  TrendingUp,
  TrendingDown,
  Save,
  CalendarClock,
  Lock,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
  X,
} from 'lucide-react';
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
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
} from '@/components/ui/select';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  ACCOUNT_OPTIONS,
  DAY_OF_WEEK_LABELS,
  type ScheduledCashFlow,
  type FrequencyType,
  type FlowType,
} from './scheduledCashFlows';
import type { CreditFacility } from './types';
import { LOC_DRAW_PREFIX, LOC_REPAY_PREFIX } from './creditFacilities';

interface Props {
  open: boolean;
  initialEntries: ScheduledCashFlow[];
  onClose: () => void;
  /**
   * The complete list of Category dropdown options for Cash-In, sourced
   * from the visible Line item rows under "Cash Receipts" in the cash
   * flow table. No built-in/hardcoded fallback is used.
   */
  cashInCategories?: string[];
  /**
   * The complete list of Category dropdown options for Cash-Out, sourced
   * from the visible Line item rows under "Cash Disbursements" in the
   * cash flow table. No built-in/hardcoded fallback is used.
   */
  cashOutCategories?: string[];
  /** Configured credit facilities (LOCs). */
  creditFacilities?: CreditFacility[];
  /** Persist updated facilities. */
  onCreditFacilitiesChange?: (next: CreditFacility[]) => void;
  /**
   * `entries` are the rows to persist (existing rows are matched by `id`,
   * new rows have empty `id`). `deleteIds` is the explicit list of ids the
   * user removed via the trash button — only these will be deleted from
   * the database. Rows that simply aren't in `entries` are left alone.
   */
  onSave: (entries: ScheduledCashFlow[], deleteIds: string[]) => Promise<boolean>;
  /** Optional: opens the "Cash-In: Next 8 Weeks" panel (moved here from the toolbar). */
  onOpenCashInPanel?: () => void;
  /** Headline total to show on the Cash-In Next 8W button. */
  cashInNext8WTotal?: number;
}

type DraftEntry = Omit<ScheduledCashFlow, 'id' | 'company_id'> & { id?: string; _draftId: string };

/** Format a numeric dollar value as USD with commas, no decimals. */
function fmtUSDWhole(n: number | null | undefined): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  return Math.round(v).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });
}

/**
 * Currency input that shows USD-formatted text when not focused, accepts
 * raw numeric typing while focused, and commits a rounded whole-dollar
 * number on blur or Enter. The leading "$" is rendered by the parent.
 */
function CurrencyInput({
  value,
  onCommit,
  placeholder,
  className,
  ariaLabel,
}: {
  value: number | null | undefined;
  onCommit: (next: number) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const numeric = Number(value) || 0;
  // Display text — formatted (with thousands separators, no $) when blurred,
  // raw numeric while editing.
  const formattedDisplay = numeric > 0 ? Math.round(numeric).toLocaleString('en-US') : '';
  const [draft, setDraft] = useState<string>(formattedDisplay);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(formattedDisplay);
  }, [formattedDisplay, editing]);

  const commit = () => {
    const cleaned = draft.replace(/[^0-9.\-]/g, '');
    if (cleaned === '' || cleaned === '-' || cleaned === '.') {
      onCommit(0);
      return;
    }
    const parsed = Number(cleaned);
    if (!Number.isFinite(parsed)) return;
    onCommit(Math.round(parsed));
  };

  return (
    <Input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={draft}
      placeholder={placeholder}
      className={className}
      onFocus={(e) => {
        setEditing(true);
        // Show raw integer for easy editing
        setDraft(numeric > 0 ? String(Math.round(numeric)) : '');
        const el = e.currentTarget;
        requestAnimationFrame(() => el.select());
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          (e.currentTarget as HTMLInputElement).blur();
        } else if (e.key === 'Escape') {
          setDraft(formattedDisplay);
          setEditing(false);
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
    />
  );
}

function newDraft(): DraftEntry {
  const today = new Date().toISOString().slice(0, 10);
  return {
    _draftId: `d_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    account: ACCOUNT_OPTIONS[0],
    category: '',
    amount: 0,
    frequency_type: 'one_time',
    frequency_config: { one_time_date: today },
    flow_type: 'cash_in',
    start_date: today,
    end_date: null,
    notes: null,
  };
}

function safeParseDate(s?: string | null): Date | undefined {
  if (!s) return undefined;
  try {
    return parseISO(s);
  } catch {
    return undefined;
  }
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function DatePickerField({
  value,
  onChange,
  placeholder = 'Pick a date',
  className,
}: {
  value: string | null | undefined;
  onChange: (iso: string | null) => void;
  placeholder?: string;
  className?: string;
}) {
  const date = safeParseDate(value || undefined);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'w-full justify-start text-left font-normal h-9',
            !date && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 opacity-70" />
          {date ? format(date, 'MMM d, yyyy') : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => onChange(d ? toIso(d) : null)}
          initialFocus
          className={cn('p-3 pointer-events-auto')}
        />
      </PopoverContent>
    </Popover>
  );
}

export function ScheduledCashFlowsModal({
  open,
  initialEntries,
  onClose,
  onSave,
  cashInCategories = [],
  cashOutCategories = [],
  creditFacilities = [],
  onCreditFacilitiesChange,
  onOpenCashInPanel,
  cashInNext8WTotal,
}: Props) {
  const [drafts, setDrafts] = useState<DraftEntry[]>([]);
  const [newRowId, setNewRowId] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [saving, setSaving] = useState(false);
  const [facilityDrafts, setFacilityDrafts] = useState<CreditFacility[]>([]);

  type SortKey = 'account' | 'category' | 'description' | 'amount' | 'frequency' | 'date' | 'type';
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };
  const clearSort = () => {
    setSortKey(null);
    setSortDir('asc');
  };

  /**
   * Deduplicate category labels by a normalized key (trimmed, collapsed
   * whitespace, case-insensitive). The first occurrence's display label is
   * kept verbatim; subsequent duplicates are dropped. Order across sources:
   * built-in grouped/list options first, then user-defined custom labels,
   * then LOC entries.
   */
  const normalizeCat = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  // Dedupe each list by a normalized key (trim + collapse whitespace +
  // lowercase) while preserving the first-seen original label for display.
  // These are the SOLE source of Category dropdown options — no built-in,
  // hardcoded, or external category list is mixed in.
  const dedupeByNormalized = (labels: string[]): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of labels) {
      const k = normalizeCat(c);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(c);
    }
    return out;
  };
  const dedupedCashIn = useMemo(
    () => dedupeByNormalized(cashInCategories),
    [cashInCategories],
  );
  const dedupedCashOut = useMemo(
    () => dedupeByNormalized(cashOutCategories),
    [cashOutCategories],
  );
  const draftDateValue = (d: DraftEntry): string => {
    if (d.frequency_type === 'one_time') return d.frequency_config?.one_time_date || '';
    return d.start_date || '';
  };
  const sortedDrafts = useMemo(() => {
    if (!sortKey) return drafts;
    const dir = sortDir === 'asc' ? 1 : -1;
    const cmp = (a: DraftEntry, b: DraftEntry): number => {
      switch (sortKey) {
        case 'amount':
          return ((Number(a.amount) || 0) - (Number(b.amount) || 0)) * dir;
        case 'date': {
          const av = draftDateValue(a);
          const bv = draftDateValue(b);
          if (!av && !bv) return 0;
          if (!av) return 1;
          if (!bv) return -1;
          return av.localeCompare(bv) * dir; // ISO YYYY-MM-DD sorts chronologically
        }
        case 'account':
          return (a.account || '').localeCompare(b.account || '', undefined, { sensitivity: 'base' }) * dir;
        case 'category':
          return (a.category || '').localeCompare(b.category || '', undefined, { sensitivity: 'base' }) * dir;
        case 'description':
          return (a.notes || '').localeCompare(b.notes || '', undefined, { sensitivity: 'base' }) * dir;
        case 'frequency':
          return (a.frequency_type || '').localeCompare(b.frequency_type || '', undefined, { sensitivity: 'base' }) * dir;
        case 'type':
          return (a.flow_type || '').localeCompare(b.flow_type || '', undefined, { sensitivity: 'base' }) * dir;
        default:
          return 0;
      }
    };
    return [...drafts].sort(cmp);
  }, [drafts, sortKey, sortDir]);

  const SortHeader = ({ label, k }: { label: string; k: SortKey }) => {
    const active = sortKey === k;
    const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ChevronsUpDown;
    return (
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className={cn(
          'flex items-center gap-1 text-xs uppercase tracking-wide font-medium select-none transition-colors text-left',
          active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <span>{label}</span>
        <Icon className={cn('h-3 w-3', active ? 'opacity-100' : 'opacity-40')} />
      </button>
    );
  };

  useEffect(() => {
    if (!open) return;
    setFacilityDrafts(creditFacilities.map((f) => ({ ...f })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const addFacility = () => {
    const today = new Date().toISOString().slice(0, 10);
    setFacilityDrafts((prev) => [
      ...prev,
      {
        id: `loc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: 'New Credit Facility',
        facility_amount: 0,
        initial_drawn: 0,
        start_date: today,
        end_date: null,
      },
    ]);
  };
  const updateFacility = (id: string, patch: Partial<CreditFacility>) => {
    setFacilityDrafts((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };
  const removeFacility = (id: string) => {
    setFacilityDrafts((prev) => prev.filter((f) => f.id !== id));
  };
  // Ids of existing entries the user explicitly removed in this session.
  // These — and only these — are deleted on save. This protects against
  // wiping rows added in other surfaces (e.g. inline cell adds) while the
  // modal was open.
  const [deletedIds, setDeletedIds] = useState<string[]>([]);

  // Hydrate drafts ONLY when the modal transitions closed -> open. `initialEntries`
  // is commonly a fresh array on every parent render, which would otherwise wipe
  // out newly added rows the moment "Add Entry" is clicked.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!open) {
      hydratedRef.current = false;
      return;
    }
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    setDrafts(
      initialEntries.map((e) => ({
        ...e,
        _draftId: e.id,
        frequency_config: e.frequency_config || {},
      })),
    );
    setDeletedIds([]);
  }, [open, initialEntries]);

  const updateRow = useCallback((draftId: string, patch: Partial<DraftEntry>) => {
    setDrafts((prev) => prev.map((d) => (d._draftId === draftId ? { ...d, ...patch } : d)));
  }, []);

  const updateConfig = useCallback((draftId: string, patch: Record<string, any>) => {
    setDrafts((prev) =>
      prev.map((d) =>
        d._draftId === draftId
          ? { ...d, frequency_config: { ...(d.frequency_config || {}), ...patch } }
          : d,
      ),
    );
  }, []);

  const addRow = () => {
    const draft = newDraft();
    setDrafts((prev) => [...prev, draft]);
    setNewRowId(draft._draftId);
    // Scroll the freshly added row into view (it lands at the bottom of a long list).
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        rowRefs.current[draft._draftId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
    window.setTimeout(() => setNewRowId((id) => (id === draft._draftId ? null : id)), 2500);
  };
  const deleteRow = (id: string) =>
    setDrafts((prev) => {
      const removed = prev.find((d) => d._draftId === id);
      // Track DB id deletions so saveAll can apply them server-side.
      if (removed?.id) setDeletedIds((ids) => (ids.includes(removed.id!) ? ids : [...ids, removed.id!]));
      return prev.filter((d) => d._draftId !== id);
    });

  const handleFlowChange = (draftId: string, flow: FlowType) => {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d._draftId !== draftId) return d;
        const validCats = flow === 'cash_in' ? dedupedCashIn : dedupedCashOut;
        const category = validCats.includes(d.category)
          ? d.category
          : (validCats[0] ?? '');
        return { ...d, flow_type: flow, category };
      }),
    );
  };

  const handleFrequencyChange = (draftId: string, freq: FrequencyType) => {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d._draftId !== draftId) return d;
        const today = new Date().toISOString().slice(0, 10);
        // Preserve variance across frequency changes so users don't lose it.
        const preservedVariance = d.frequency_config?.variance_pct;
        let cfg: Record<string, any> = {};
        if (freq === 'one_time') cfg = { one_time_date: d.frequency_config?.one_time_date || today };
        if (freq === 'weekly' || freq === 'bi_weekly')
          cfg = { day_of_week: d.frequency_config?.day_of_week ?? 1 };
        if (freq === 'monthly_first' || freq === 'monthly_last')
          cfg = { ordinal_day_of_week: d.frequency_config?.ordinal_day_of_week ?? 1 };
        if (freq === 'monthly_day') cfg = { day_of_month: d.frequency_config?.day_of_month ?? 1 };
        if (preservedVariance !== undefined && preservedVariance !== null) {
          cfg.variance_pct = preservedVariance;
        }
        return { ...d, frequency_type: freq, frequency_config: cfg };
      }),
    );
  };

  const validate = (): { ok: boolean; error?: string } => {
    for (const d of drafts) {
      if (!d.account) return { ok: false, error: 'Account is required for all rows' };
      if (!d.category) return { ok: false, error: 'Category is required for all rows' };
      if (!(Number(d.amount) > 0)) return { ok: false, error: 'Amount must be greater than 0' };
      if (d.frequency_type === 'one_time' && !d.frequency_config?.one_time_date) {
        return { ok: false, error: 'One-time entries require a date' };
      }
      if (!d.start_date && d.frequency_type !== 'one_time') {
        return { ok: false, error: 'Recurring entries require a Start Date' };
      }
    }
    return { ok: true };
  };

  const handleSave = async () => {
    const v = validate();
    if (!v.ok) {
      toast.error(v.error || 'Please fix validation errors');
      return;
    }
    setSaving(true);
    const entries: ScheduledCashFlow[] = drafts.map((d) => ({
      id: d.id || '',
      company_id: '',
      account: d.account,
      category: d.category,
      amount: Number(d.amount),
      frequency_type: d.frequency_type,
      frequency_config: d.frequency_config || {},
      flow_type: d.flow_type,
      start_date: d.start_date,
      end_date: d.end_date,
      notes: d.notes,
    }));
    const ok = await onSave(entries, deletedIds);
    if (ok && onCreditFacilitiesChange) {
      // Sanitize facility drafts before persisting
      const cleaned = facilityDrafts
        .filter((f) => f.name?.trim() && Number(f.facility_amount) > 0)
        .map((f) => ({
          ...f,
          name: f.name.trim(),
          facility_amount: Math.max(0, Number(f.facility_amount) || 0),
          initial_drawn: Math.max(
            0,
            Math.min(Number(f.facility_amount) || 0, Number(f.initial_drawn) || 0),
          ),
        }));
      onCreditFacilitiesChange(cleaned);
    }
    setSaving(false);
    if (ok) {
      toast.success('Scheduled cash flows saved');
      onClose();
    } else {
      toast.error('Failed to save. Please try again.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="w-[min(96vw,1800px)] max-w-[1800px] h-[min(92dvh,980px)] p-0 gap-0 overflow-hidden border-border bg-card shadow-2xl rounded-2xl flex flex-col [&>button.absolute]:hidden"
      >
        {/* Header */}
        <DialogHeader className="px-6 py-5 border-b border-border bg-card sticky top-0 z-10">
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-1 text-left">
              <DialogTitle className="text-lg font-semibold">
                Configure Payments &amp; Revenue
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Schedule recurring or one-time cash flows that auto-populate the weekly view.
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {onOpenCashInPanel && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onOpenCashInPanel}
                  className="gap-1.5"
                  title="Cash-In: Next 8 Weeks — view & edit"
                >
                  <TrendingUp className="h-4 w-4" />
                  Cash-In Next 8W
                  {typeof cashInNext8WTotal === 'number' && (
                    <span className="ml-1 text-xs font-semibold text-muted-foreground">
                      {fmtUSDWhole(cashInNext8WTotal)}
                    </span>
                  )}
                </Button>
              )}
              <Button onClick={addRow} size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />
                Add Entry
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onClose}
                aria-label="Close"
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Body */}
        <div
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-6 py-4 bg-card"
        >
          {/* Credit Facilities (Lines of Credit) */}
          <section className="mb-6 rounded-xl border border-border bg-muted/20 p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-amber-400" />
                  Lines of Credit / Credit Facilities
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Available LOC auto-fills the “Add’l Liquidity (Delayed Draw)” row each week within the facility’s active dates.
                </p>
              </div>
              <Button onClick={addFacility} size="sm" variant="outline" className="gap-1.5">
                <Plus className="h-4 w-4" />
                Add Facility
              </Button>
            </div>
            {facilityDrafts.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                No facilities configured. Click “Add Facility” to start.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <div className="flex flex-col gap-3 min-w-max">
                {facilityDrafts.map((f) => {
                  const total = Math.max(0, Number(f.facility_amount) || 0);
                  const drawn = Math.max(0, Math.min(total, Number(f.initial_drawn) || 0));
                  const available = Math.max(0, total - drawn);
                  return (
                    <div
                      key={f.id}
                      className="grid gap-2 items-end p-3 rounded-lg border border-border bg-card whitespace-nowrap"
                      style={{
                        gridTemplateColumns:
                          '260px 150px 150px 150px 150px 150px 36px',
                      }}
                    >
                      <div className="min-w-0">
                        <label className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Facility name</label>
                        <Input
                          value={f.name}
                          placeholder="e.g. SVB Line of Credit"
                          onChange={(e) => updateFacility(f.id, { name: e.target.value })}
                          className="h-9 w-full mt-1"
                        />
                      </div>
                      <div className="min-w-0">
                        <label className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Total facility</label>
                        <div className="relative mt-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">$</span>
                          <CurrencyInput
                            value={f.facility_amount}
                            placeholder="500,000"
                            ariaLabel="Total facility amount"
                            onCommit={(n) => updateFacility(f.id, { facility_amount: n })}
                            className="pl-6 h-9 w-full text-right tabular-nums"
                          />
                        </div>
                      </div>
                      <div className="min-w-0">
                        <label className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Currently drawn</label>
                        <div className="relative mt-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">$</span>
                          <CurrencyInput
                            value={f.initial_drawn}
                            placeholder="0"
                            ariaLabel="Currently drawn amount"
                            onCommit={(n) => updateFacility(f.id, { initial_drawn: n })}
                            className="pl-6 h-9 w-full text-right tabular-nums"
                          />
                        </div>
                      </div>
                      <div className="min-w-0">
                        <label className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Available LOC</label>
                        <div className="h-9 mt-1 px-3 rounded-md border border-dashed border-amber-500/40 bg-amber-500/5 text-amber-300 flex items-center justify-end gap-1.5 text-sm font-medium tabular-nums">
                          <Lock className="h-3 w-3" />
                          {available.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <label className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Start date</label>
                        <div className="mt-1">
                          <DatePickerField
                            value={f.start_date}
                            onChange={(iso) => updateFacility(f.id, { start_date: iso || '' })}
                            placeholder="Start"
                          />
                        </div>
                      </div>
                      <div className="min-w-0">
                        <label className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Maturity (end)</label>
                        <div className="mt-1">
                          <DatePickerField
                            value={f.end_date}
                            onChange={(iso) => updateFacility(f.id, { end_date: iso })}
                            placeholder="End date"
                          />
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeFacility(f.id)}
                        title="Remove facility"
                        className="h-9 w-9 self-end justify-self-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
                </div>
              </div>
            )}
          </section>

          {drafts.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-16 px-6">
              <div className="h-14 w-14 rounded-2xl bg-muted/60 border border-border flex items-center justify-center mb-4">
                <CalendarClock className="h-7 w-7 text-muted-foreground" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-1">
                No scheduled cash flows yet
              </h3>
              <p className="text-sm text-muted-foreground mb-5 max-w-sm">
                Add recurring or one-time payments and revenue to automatically populate the
                weekly cash flow view.
              </p>
              <Button onClick={addRow} className="gap-1.5">
                <Plus className="h-4 w-4" />
                Add your first entry
              </Button>
            </div>
          ) : (
            <div className="flex flex-col">
              {/* Sort status / clear */}
              <div className="flex items-center justify-between gap-2 px-2 pb-1.5">
                <span className="text-[11px] text-muted-foreground">
                  {sortKey
                    ? <>Sorted by <span className="text-foreground font-medium capitalize">{sortKey}</span> · {sortDir === 'asc' ? 'Ascending' : 'Descending'}</>
                    : 'Click a column header to sort'}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearSort}
                  disabled={!sortKey}
                  className="h-6 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
                >
                  <X className="h-3 w-3" />
                  Clear sort
                </Button>
              </div>

              {/*
                Spreadsheet-style fixed column grid. Header and every row
                use the SAME template so columns align exactly. The whole
                grid lives inside a horizontal scroll container with
                min-w-max so columns never collapse or wrap; if the modal
                is narrower than the grid, internal horizontal scroll
                appears instead.
              */}
              <div className="overflow-x-auto -mx-2 pb-1">
                <div
                  className="min-w-max"
                  style={{
                    // drag | account | category | description | amount | frequency | when | start | end | variance | type | delete
                    ['--cf-cols' as any]:
                      '16px 150px 180px 220px 120px 160px 150px 140px 140px 110px 120px 36px',
                  }}
                >
                  {/* Column Headers */}
                  <div
                    className="grid items-center gap-2 px-2 pb-2 mb-1 border-b border-border whitespace-nowrap"
                    style={{ gridTemplateColumns: 'var(--cf-cols)' }}
                  >
                    <span />
                    <SortHeader label="Account" k="account" />
                    <SortHeader label="Category" k="category" />
                    <SortHeader label="Description" k="description" />
                    <SortHeader label="Amount" k="amount" />
                    <SortHeader label="Frequency" k="frequency" />
                    <SortHeader label="When" k="date" />
                    <span className="text-xs uppercase tracking-wide font-medium text-muted-foreground">Start</span>
                    <span className="text-xs uppercase tracking-wide font-medium text-muted-foreground">End</span>
                    <span className="text-xs uppercase tracking-wide font-medium text-muted-foreground">Variance</span>
                    <SortHeader label="Type" k="type" />
                    <span />
                  </div>

                  {/* Rows */}
                  <div className="flex flex-col">
                    {sortedDrafts.map((d) => {
                      const isOneTime = d.frequency_type === 'one_time';
                      return (
                        <div
                          key={d._draftId}
                          ref={(el) => { rowRefs.current[d._draftId] = el; }}
                          className={cn(
                            'grid items-center gap-2 px-2 py-2.5 border-b border-border/60 hover:bg-muted/40 transition-colors rounded-md whitespace-nowrap',
                            newRowId === d._draftId && 'ring-1 ring-primary/60 bg-primary/5',
                          )}
                          style={{ gridTemplateColumns: 'var(--cf-cols)' }}
                        >
                      {/* Drag handle */}
                      <div className="flex items-center justify-center text-muted-foreground/50 cursor-grab">
                        <GripVertical className="h-4 w-4" />
                      </div>

                      {/* Account */}
                      <Select
                        value={d.account}
                        onValueChange={(v) => updateRow(d._draftId, { account: v })}
                      >
                        <SelectTrigger className="h-9 w-full min-w-0">
                          <div className="flex items-center gap-2 min-w-0 truncate">
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <SelectValue />
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          {ACCOUNT_OPTIONS.map((a) => (
                            <SelectItem key={a} value={a}>
                              {a}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* Category */}
                      <Select
                        value={d.category}
                        onValueChange={(v) => updateRow(d._draftId, { category: v })}
                      >
                        <SelectTrigger className="h-9 w-full min-w-0">
                          <div className="flex items-center gap-2 min-w-0 truncate">
                            <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <SelectValue />
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          {(d.flow_type === 'cash_in' ? dedupedCashIn : dedupedCashOut).map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                          {creditFacilities.length > 0 && d.flow_type === 'cash_in' && (
                            <SelectGroup>
                              <SelectLabel>Line of Credit Draws</SelectLabel>
                              {creditFacilities.map((f) => (
                                <SelectItem key={`loc-draw-${f.id}`} value={`${LOC_DRAW_PREFIX} ${f.name}`}>
                                  LOC Draw — {f.name}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          )}
                          {creditFacilities.length > 0 && d.flow_type === 'cash_out' && (
                            <SelectGroup>
                              <SelectLabel>Line of Credit Repayments</SelectLabel>
                              {creditFacilities.map((f) => (
                                <SelectItem key={`loc-repay-${f.id}`} value={`${LOC_REPAY_PREFIX} ${f.name}`}>
                                  LOC Repayment — {f.name}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          )}
                        </SelectContent>
                      </Select>

                      {/* Description */}
                      <Input
                        type="text"
                        value={d.notes ?? ''}
                        placeholder="Add a note…"
                        onChange={(e) =>
                          updateRow(d._draftId, { notes: e.target.value || null })
                        }
                        className="h-9 w-full min-w-0"
                      />

                      {/* Amount */}
                      <div className="relative w-full min-w-0">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                          $
                        </span>
                        <CurrencyInput
                          value={d.amount}
                          placeholder="0"
                          ariaLabel="Amount"
                          onCommit={(n) => updateRow(d._draftId, { amount: n })}
                          className="pl-6 h-9 w-full text-right tabular-nums"
                        />
                        {(() => {
                          const ovs = d.frequency_config?.amount_overrides || {};
                          const keys = Object.keys(ovs).sort();
                          if (keys.length === 0) return null;
                          const tooltip = keys
                            .map((k) => `${k}: $${Number(ovs[k]).toLocaleString()}`)
                            .join('\n');
                          return (
                            <div className="mt-1 flex items-center gap-1">
                              <span
                                title={`Per-period overrides:\n${tooltip}`}
                                className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400"
                              >
                                {keys.length} period override{keys.length === 1 ? '' : 's'}
                              </span>
                              <button
                                type="button"
                                title="Clear all per-period overrides for this entry"
                                className="text-[10px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                                onClick={() => {
                                  const next = { ...(d.frequency_config || {}) };
                                  delete (next as any).amount_overrides;
                                  updateRow(d._draftId, { frequency_config: next });
                                }}
                              >
                                Clear
                              </button>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Frequency type */}
                      <Select
                        value={d.frequency_type}
                        onValueChange={(v) =>
                          handleFrequencyChange(d._draftId, v as FrequencyType)
                        }
                      >
                        <SelectTrigger className="h-9 w-full min-w-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="one_time">1-Time</SelectItem>
                          <SelectItem value="weekly">Weekly on [Day]</SelectItem>
                          <SelectItem value="bi_weekly">Bi-Weekly on [Day]</SelectItem>
                          <SelectItem value="monthly_first">Monthly — First [Day]</SelectItem>
                          <SelectItem value="monthly_last">Monthly — Last [Day]</SelectItem>
                          <SelectItem value="monthly_day">Monthly on the [X] day</SelectItem>
                        </SelectContent>
                      </Select>

                      {/* When (date / day-of-week / day-of-month, depends on frequency) */}
                      <div className="w-full min-w-0">
                        {isOneTime && (
                          <DatePickerField
                            value={d.frequency_config?.one_time_date}
                            onChange={(iso) =>
                              updateConfig(d._draftId, { one_time_date: iso || '' })
                            }
                          />
                        )}
                        {(d.frequency_type === 'weekly' || d.frequency_type === 'bi_weekly') && (
                          <Select
                            value={String(d.frequency_config?.day_of_week ?? 1)}
                            onValueChange={(v) =>
                              updateConfig(d._draftId, { day_of_week: Number(v) })
                            }
                          >
                            <SelectTrigger className="h-9 w-full min-w-0">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {DAY_OF_WEEK_LABELS.map((label, idx) => (
                                <SelectItem key={idx} value={String(idx)}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        {(d.frequency_type === 'monthly_first' ||
                          d.frequency_type === 'monthly_last') && (
                          <Select
                            value={String(d.frequency_config?.ordinal_day_of_week ?? 1)}
                            onValueChange={(v) =>
                              updateConfig(d._draftId, { ordinal_day_of_week: Number(v) })
                            }
                          >
                            <SelectTrigger className="h-9 w-full min-w-0">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {DAY_OF_WEEK_LABELS.map((label, idx) => (
                                <SelectItem key={idx} value={String(idx)}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        {d.frequency_type === 'monthly_day' && (
                          <Input
                            type="number"
                            min={1}
                            max={31}
                            className="h-9 w-full"
                            value={d.frequency_config?.day_of_month ?? 1}
                            onChange={(e) =>
                              updateConfig(d._draftId, {
                                day_of_month: Math.min(31, Math.max(1, Number(e.target.value))),
                              })
                            }
                          />
                        )}
                      </div>

                      {/* Start date (only for recurring) */}
                      <div className="w-full min-w-0">
                        {!isOneTime ? (
                          <DatePickerField
                            value={d.start_date}
                            onChange={(iso) => updateRow(d._draftId, { start_date: iso })}
                            placeholder="Start date"
                          />
                        ) : (
                          <div className="h-9 w-full rounded-md border border-dashed border-border/60 bg-muted/20" />
                        )}
                      </div>

                      {/* End date (only for recurring) */}
                      <div className="w-full min-w-0">
                        {!isOneTime ? (
                          <DatePickerField
                            value={d.end_date}
                            onChange={(iso) => updateRow(d._draftId, { end_date: iso })}
                            placeholder="End (opt.)"
                          />
                        ) : (
                          <div className="h-9 w-full rounded-md border border-dashed border-border/60 bg-muted/20" />
                        )}
                      </div>

                      {/* Variance ± (only for recurring) */}
                      <div className="w-full min-w-0">
                        {!isOneTime ? (
                          <div className="relative w-full">
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              step="0.1"
                              value={
                                d.frequency_config?.variance_pct === undefined ||
                                d.frequency_config?.variance_pct === null
                                  ? ''
                                  : d.frequency_config.variance_pct
                              }
                              placeholder="0"
                              aria-label="Variance percent"
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (raw === '') {
                                  updateConfig(d._draftId, { variance_pct: undefined });
                                } else {
                                  const n = Math.max(0, Math.min(100, Number(raw)));
                                  updateConfig(d._draftId, { variance_pct: n });
                                }
                              }}
                              className="h-9 w-full pr-6 text-right tabular-nums"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                              %
                            </span>
                          </div>
                        ) : (
                          <div className="h-9 w-full rounded-md border border-dashed border-border/60 bg-muted/20" />
                        )}
                      </div>

                      {/* Type toggle */}
                      <ToggleGroup
                        type="single"
                        value={d.flow_type}
                        onValueChange={(v) => v && handleFlowChange(d._draftId, v as FlowType)}
                        className="grid grid-cols-2 gap-1 h-9 w-full"
                      >
                        <ToggleGroupItem
                          value="cash_in"
                          className={cn(
                            'h-9 px-2 gap-1 text-xs font-medium border border-border rounded-md',
                            'data-[state=on]:bg-emerald-500/20 data-[state=on]:text-emerald-400 data-[state=on]:border-emerald-500/40',
                            'data-[state=off]:text-muted-foreground',
                          )}
                          aria-label="Cash In"
                        >
                          <TrendingUp className="h-3.5 w-3.5" />
                          In
                        </ToggleGroupItem>
                        <ToggleGroupItem
                          value="cash_out"
                          className={cn(
                            'h-9 px-2 gap-1 text-xs font-medium border border-border rounded-md',
                            'data-[state=on]:bg-red-500/20 data-[state=on]:text-red-400 data-[state=on]:border-red-500/40',
                            'data-[state=off]:text-muted-foreground',
                          )}
                          aria-label="Cash Out"
                        >
                          <TrendingDown className="h-3.5 w-3.5" />
                          Out
                        </ToggleGroupItem>
                      </ToggleGroup>

                      {/* Delete */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteRow(d._draftId)}
                        title="Delete row"
                        className="h-9 w-9 justify-self-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t border-border bg-card sticky bottom-0 z-10 flex-row sm:justify-between items-center gap-3">
          <p className="text-xs text-muted-foreground hidden sm:block">
            Changes apply to the weekly cash flow view after saving.
          </p>
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              <Save className="h-4 w-4" />
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
