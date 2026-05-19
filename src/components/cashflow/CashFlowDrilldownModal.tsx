import { useMemo, useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, X, Pencil, Trash2, Check, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  generateOccurrences,
  resolveCategoryToGridRow,
  CASH_IN_CATEGORIES,
  CASH_OUT_CATEGORIES,
  CANONICAL_TO_GRID_ROW,
  getOccurrenceAmount,
  type ScheduledCashFlow,
  type FrequencyType,
  type FlowType,
} from './scheduledCashFlows';
import { fmt } from './formatters';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Link } from 'react-router-dom';

// Grid-row keys for Debt Advisory sub-rows. These must match the row keys
// used by WeeklyReportTab AND the keys produced by resolveCategoryToGridRow,
// otherwise drilldown shows zero rows.
const DEBT_ADV_SUBKEYS = ['Retainers', 'Milestones', 'Closing Fees', 'Referral Fees'] as const;

export interface DrilldownContext {
  /** Logical row key in the weekly grid (e.g. category name, "TOTAL RECEIPTS", "NET CHANGE") */
  rowKey: string;
  /** Display label for the row */
  rowLabel: string;
  /** YYYY-MM-DD week-start key */
  weekKey: string;
  /** YYYY-MM-DD week-end (inclusive) */
  weekEnding: string;
  /** Rolled-up amount shown in the cell */
  cellValue: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  context: DrilldownContext | null;
  items: ScheduledCashFlow[];
  /** Optional inline-edit hook. When provided, each row shows an Edit button. */
  onUpdateEntry?: (id: string, patch: Partial<ScheduledCashFlow>) => Promise<boolean> | boolean;
  /** Optional delete hook. When provided, each row shows a Delete button. */
  onDeleteEntry?: (id: string) => Promise<boolean> | boolean;
}

function parseDate(s: string): Date {
  return new Date(s + 'T00:00:00');
}

function formatNiceDate(s: string): string {
  const d = parseDate(s);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Render a disabled delete action with a tooltip explaining where the
 *  source record lives. Used for rows that originate outside the cash-flow
 *  Configure surface (naitive deal projections, QuickBooks imports) so the
 *  user is never left with an unexplained "Auto" tag. */
function SourceLockedAction({ row }: { row: DrilldownRow }) {
  const isDeal = row.source === 'deal';
  const isQb = row.source === 'quickbooks';
  // entryId for deal rows looks like "deal:<uuid>:retainer". Extract the uuid.
  const dealId = isDeal
    ? (row.entryId.split(':')[1] || '').trim()
    : '';
  const where = isDeal
    ? 'Generated from the linked naitive deal. To remove or edit this retainer / closing fee, update the deal record — changes flow back here automatically.'
    : isQb
      ? 'Imported from QuickBooks. Void or adjust the underlying transaction in QuickBooks — it will sync back here on the next refresh.'
      : 'This row is generated automatically and cannot be edited here.';
  const label = isDeal ? 'Manage on deal' : isQb ? 'Open in QuickBooks' : 'Source-managed';
  const content = (
    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
      {label}
      {(isDeal || isQb) && <ExternalLink className="h-3 w-3" />}
    </span>
  );
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          {isDeal && dealId ? (
            <Link to={`/deal/${dealId}`}>{content}</Link>
          ) : (
            <span aria-disabled={!isQb}>{content}</span>
          )}
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-[280px] text-xs leading-snug">
          <div className="font-medium mb-1">
            {isDeal ? 'Managed by naitive deal' : isQb ? 'Managed by QuickBooks' : 'System-generated'}
          </div>
          <div className="text-muted-foreground">{where}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Resolve which categories should be matched for a given row key. */
function categoriesForRow(rowKey: string): { categories: Set<string>; flowFilter: 'in' | 'out' | 'all' } {
  // Convert canonical short-key category lists into the grid-row keys used
  // by mergeScheduledIntoWeekly (matches what entry rows resolve to).
  const cashInGridRows = (CASH_IN_CATEGORIES as readonly string[]).map(
    (c) => CANONICAL_TO_GRID_ROW[c] || c,
  );
  const cashOutGridRows = (CASH_OUT_CATEGORIES as readonly string[]).map(
    (c) => CANONICAL_TO_GRID_ROW[c] || c,
  );
  if (rowKey === 'TOTAL RECEIPTS' || rowKey === 'CASH IN') {
    return { categories: new Set(cashInGridRows), flowFilter: 'in' };
  }
  if (rowKey === 'TOTAL DISBURSEMENTS' || rowKey === 'CASH OUT') {
    return { categories: new Set(cashOutGridRows), flowFilter: 'out' };
  }
  if (rowKey === 'NET CHANGE' || rowKey === 'TOTAL NET CASH CHANGE') {
    return {
      categories: new Set([...cashInGridRows, ...cashOutGridRows]),
      flowFilter: 'all',
    };
  }
  if (rowKey === 'Advisors Revenue' || rowKey === 'Debt Advisory Revenue') {
    return { categories: new Set(DEBT_ADV_SUBKEYS), flowFilter: 'in' };
  }
  return { categories: new Set([rowKey]), flowFilter: 'all' };
}

interface DrilldownRow {
  id: string;
  entryId: string;
  date: string;
  account: string;
  category: string;
  notes: string | null;
  flow_type: 'cash_in' | 'cash_out';
  signedAmount: number;
  /** Underlying scheduled entry — for inline edit pre-fill. */
  entry: ScheduledCashFlow;
  /** Provenance for the value shown in this row. */
  source: 'quickbooks' | 'deal' | 'manual';
  /** Friendly source label, e.g. "QuickBooks — Retainer Revenue:Debt Advisory Retainer". */
  sourceLabel: string;
  /** True when the row is a projected (P) entry rather than a confirmed actual. */
  projected: boolean;
}

export function CashFlowDrilldownModal({ open, onClose, context, items, onUpdateEntry, onDeleteEntry }: Props) {
  const [search, setSearch] = useState('');
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set());
  const [dateRange, setDateRange] = useState<'week' | 'before' | 'after' | 'all'>('week');
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    description: string;
    amount: string;
    category: string;
    frequency_type: FrequencyType;
    flow_type: FlowType;
    /** Occurrence date (YYYY-MM-DD) of the row being edited. Required for
     *  the "For this Period Only" scope so we can write a per-occurrence
     *  override on `frequency_config.amount_overrides`. */
    occurrenceDate: string;
    /** Snapshot of the original amount when edit started, used to detect
     *  whether the amount actually changed and trigger the scope prompt. */
    originalAmount: number;
  } | null>(null);
  /** Pending delete prompt. Holds the row context for the two-path
   *  destructive confirmation modal. */
  const [deletePrompt, setDeletePrompt] = useState<DrilldownRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState<null | 'one' | 'future'>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Pending scope decision when a user changes Amount on a recurring entry. */
  const [scopePrompt, setScopePrompt] = useState<{
    entryId: string;
    occurrenceDate: string;
    newAmount: number;
    /** Patch for non-amount field changes that always go to the base entry. */
    otherPatch: Partial<ScheduledCashFlow>;
    /** Existing entry, used to merge frequency_config when writing override. */
    entry: ScheduledCashFlow;
  } | null>(null);

  // Reset filters when context changes
  useEffect(() => {
    setSearch('');
    setActiveCategories(new Set());
    setDateRange('week');
    setEditingEntryId(null);
    setEditDraft(null);
  }, [context?.rowKey, context?.weekKey]);

  const allRows = useMemo<DrilldownRow[]>(() => {
    if (!context) return [];
    const { rowKey, weekKey, weekEnding } = context;
    const weekStart = parseDate(weekKey);
    const weekEnd = parseDate(weekEnding);
    // Widen scan range when user picks before/after/all
    let rangeStart = weekStart;
    let rangeEnd = weekEnd;
    if (dateRange === 'before') {
      rangeStart = new Date(2024, 0, 1);
      rangeEnd = weekEnd;
    } else if (dateRange === 'after') {
      rangeStart = weekStart;
      rangeEnd = new Date(2030, 11, 31);
    } else if (dateRange === 'all') {
      rangeStart = new Date(2024, 0, 1);
      rangeEnd = new Date(2030, 11, 31);
    }
    const { categories, flowFilter } = categoriesForRow(rowKey);

    const out: DrilldownRow[] = [];
    for (const entry of items) {
      // Resolve aliased / legacy category labels to the actual grid row keys
      // (matches what the Weekly Report renders and what mergeScheduledIntoWeekly
      // writes to the weekly grid).
      const cat = resolveCategoryToGridRow(entry.category);
      if (!categories.has(cat)) continue;
      if (flowFilter === 'in' && entry.flow_type !== 'cash_in') continue;
      if (flowFilter === 'out' && entry.flow_type !== 'cash_out') continue;

      const occurrences = generateOccurrences(entry, rangeStart, rangeEnd);
      for (const occ of occurrences) {
        const amt = getOccurrenceAmount(entry, occ);
        const id = String(entry.id || '');
        let source: 'quickbooks' | 'deal' | 'manual' = 'manual';
        let sourceLabel = 'Manual — Configure';
        let projected = false;
        if (id.startsWith('qb:')) {
          source = 'quickbooks';
          sourceLabel = entry.notes || 'QuickBooks';
        } else if (id.startsWith('deal:')) {
          source = 'deal';
          sourceLabel = entry.notes || 'naitive Deal';
          projected = true;
        }
        out.push({
          id: `${entry.id}-${occ}`,
          entryId: entry.id,
          date: occ,
          account: entry.account,
          category: cat,
          notes: entry.notes,
          flow_type: entry.flow_type,
          signedAmount: entry.flow_type === 'cash_in' ? amt : -amt,
          entry,
          source,
          sourceLabel,
          projected,
        });
      }
    }
    out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return out;
  }, [context, items, dateRange]);

  // Distinct categories present in the unfiltered result, for chips.
  const availableCategories = useMemo(() => {
    const s = new Set<string>();
    for (const r of allRows) s.add(r.category);
    return Array.from(s).sort();
  }, [allRows]);

  const rows = useMemo<DrilldownRow[]>(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter((r) => {
      if (activeCategories.size > 0 && !activeCategories.has(r.category)) return false;
      if (q) {
        const hay = `${r.account} ${r.category} ${r.notes ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allRows, search, activeCategories]);

  const total = useMemo(() => rows.reduce((s, r) => s + r.signedAmount, 0), [rows]);

  const startEdit = (r: DrilldownRow) => {
    setEditingEntryId(r.entryId);
    setEditDraft({
      description: r.entry.notes || '',
      amount: String(Math.abs(getOccurrenceAmount(r.entry, r.date))),
      category: r.entry.category,
      frequency_type: r.entry.frequency_type,
      flow_type: r.entry.flow_type,
      occurrenceDate: r.date,
      originalAmount: Math.abs(getOccurrenceAmount(r.entry, r.date)),
    });
  };
  const cancelEdit = () => {
    setEditingEntryId(null);
    setEditDraft(null);
  };
  const saveEdit = async (entryId: string) => {
    if (!onUpdateEntry || !editDraft) return;
    const amt = Number(editDraft.amount);
    if (!Number.isFinite(amt) || amt < 0) return;
    const otherPatch: Partial<ScheduledCashFlow> = {
      notes: editDraft.description.trim() || null,
      category: editDraft.category,
      frequency_type: editDraft.frequency_type,
      flow_type: editDraft.flow_type,
    };
    const amountChanged = Math.abs(amt - editDraft.originalAmount) > 0.0049;
    const isRecurring = editDraft.frequency_type !== 'one_time';
    // Only recurring + amount-changed edits need the scope prompt.
    if (amountChanged && isRecurring) {
      const entry = items.find((e) => e.id === entryId);
      if (entry) {
        setScopePrompt({
          entryId,
          occurrenceDate: editDraft.occurrenceDate,
          newAmount: amt,
          otherPatch,
          entry,
        });
        return;
      }
    }
    setBusyId(entryId);
    const ok = await onUpdateEntry(entryId, {
      ...otherPatch,
      amount: amt,
    });
    setBusyId(null);
    if (ok) cancelEdit();
  };

  /** Resolve the pending scope prompt by writing the patch through the same
   *  shared state that powers both this drilldown and the Configure modal. */
  const applyScope = async (scope: 'this_period' | 'going_forward') => {
    if (!scopePrompt) return;
    const { entryId, occurrenceDate, newAmount, otherPatch, entry } = scopePrompt;
    setBusyId(entryId);
    let patch: Partial<ScheduledCashFlow>;
    if (scope === 'this_period') {
      const existing = entry.frequency_config?.amount_overrides || {};
      patch = {
        ...otherPatch,
        // Keep recurring base amount unchanged; pin this single occurrence.
        frequency_config: {
          ...(entry.frequency_config || {}),
          amount_overrides: { ...existing, [occurrenceDate]: newAmount },
        },
      };
    } else {
      // Going forward — update the recurring base. We deliberately do NOT
      // wipe existing per-period overrides; users can clear those from the
      // Configure modal.
      patch = { ...otherPatch, amount: newAmount };
    }
    const ok = await onUpdateEntry!(entryId, patch);
    setBusyId(null);
    setScopePrompt(null);
    if (ok) cancelEdit();
  };
  const handleDelete = async (entryId: string) => {
    if (!onDeleteEntry) return;
    // Legacy entry-point — kept for safety; routes through the new modal.
    const row = rows.find((r) => r.entryId === entryId);
    if (row) setDeletePrompt(row);
  };

  /** Count occurrences of the same series strictly AFTER the selected date,
   *  scanning a wide forward window so the count is independent of the
   *  drilldown's date-range filter. */
  const futureCount = useMemo(() => {
    if (!deletePrompt) return 0;
    const entry = deletePrompt.entry;
    if (entry.frequency_type === 'one_time') return 0;
    const rangeStart = parseDate(deletePrompt.date);
    rangeStart.setDate(rangeStart.getDate() + 1);
    const rangeEnd = new Date(2035, 11, 31);
    return generateOccurrences(entry, rangeStart, rangeEnd).length;
  }, [deletePrompt]);

  const priorCount = useMemo(() => {
    if (!deletePrompt) return 0;
    const entry = deletePrompt.entry;
    if (entry.frequency_type === 'one_time') return 0;
    const rangeStart = new Date(2000, 0, 1);
    const rangeEnd = parseDate(deletePrompt.date);
    rangeEnd.setDate(rangeEnd.getDate() - 1);
    return generateOccurrences(entry, rangeStart, rangeEnd).length;
  }, [deletePrompt]);

  const closeDeletePrompt = () => {
    if (deleteBusy) return;
    setDeletePrompt(null);
  };

  const prevDayString = (s: string): string => {
    const d = parseDate(s);
    d.setDate(d.getDate() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const confirmDeleteOne = async () => {
    if (!deletePrompt) return;
    const row = deletePrompt;
    setDeleteBusy('one');
    try {
      // One-time entries → fully delete; no exclusion concept.
      if (row.entry.frequency_type === 'one_time') {
        if (onDeleteEntry) await onDeleteEntry(row.entryId);
      } else if (onUpdateEntry) {
        const cfg = row.entry.frequency_config || {};
        const existing = cfg.excluded_dates || [];
        const next = existing.includes(row.date) ? existing : [...existing, row.date];
        await onUpdateEntry(row.entryId, {
          frequency_config: { ...cfg, excluded_dates: next },
        });
      }
      toast.success('Deleted 1 entry');
      setDeletePrompt(null);
    } finally {
      setDeleteBusy(null);
    }
  };

  const confirmDeleteFuture = async () => {
    if (!deletePrompt) return;
    const row = deletePrompt;
    setDeleteBusy('future');
    try {
      const removed = 1 + futureCount;
      if (row.entry.frequency_type === 'one_time') {
        if (onDeleteEntry) await onDeleteEntry(row.entryId);
      } else if (priorCount === 0) {
        // Nothing before the selected date — wipe the entire series.
        if (onDeleteEntry) await onDeleteEntry(row.entryId);
      } else if (onUpdateEntry) {
        // Truncate the series the day before the selected occurrence, and
        // also exclude the selected date itself in case it sits on the
        // boundary of the recurring expansion.
        const cfg = row.entry.frequency_config || {};
        const existing = cfg.excluded_dates || [];
        const next = existing.includes(row.date) ? existing : [...existing, row.date];
        await onUpdateEntry(row.entryId, {
          end_date: prevDayString(row.date),
          frequency_config: { ...cfg, excluded_dates: next },
        });
      }
      if (futureCount === 0) {
        toast.success('Deleted 1 entry', {
          description: 'No later entries existed.',
        });
      } else {
        toast.success(
          `Deleted this entry and ${futureCount} future ${futureCount === 1 ? 'entry' : 'entries'}`,
          { description: `${removed} entries removed.` },
        );
      }
      setDeletePrompt(null);
    } finally {
      setDeleteBusy(null);
    }
  };

  const canMutate = !!onUpdateEntry || !!onDeleteEntry;

  const toggleCategory = (cat: string) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const hasActiveFilter = search.trim() !== '' || activeCategories.size > 0 || dateRange !== 'week';

  if (!context) return null;
  const weekRangeLabel = `${formatNiceDate(context.weekKey)} – ${formatNiceDate(context.weekEnding)}`;

  const dateRangeOptions: Array<{ key: typeof dateRange; label: string }> = [
    { key: 'week', label: 'This week' },
    { key: 'before', label: 'Up to week end' },
    { key: 'after', label: 'From week start' },
    { key: 'all', label: 'All dates' },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{context.rowLabel}</DialogTitle>
          <div className="text-sm text-muted-foreground mt-1">
            Week of {weekRangeLabel}
          </div>
        </DialogHeader>

        {/* Filter controls */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search entity, category, or description…"
                className="pl-8 h-9"
              />
            </div>
            {hasActiveFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setActiveCategories(new Set());
                  setDateRange('week');
                }}
              >
                <X className="h-3.5 w-3.5 mr-1" /> Clear
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground mr-1">Range:</span>
            {dateRangeOptions.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setDateRange(opt.key)}
                className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                  dateRange === opt.key
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background border-border hover:bg-muted'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {availableCategories.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground mr-1">Category:</span>
              {availableCategories.map((cat) => {
                const active = activeCategories.has(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                      active
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background border-border hover:bg-muted'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {hasActiveFilter ? (
              <>
                No entries match the current filters.
                <div className="mt-1 text-xs">Try clearing the search or category chips.</div>
              </>
            ) : (
              <>
                No Configure Payments &amp; Revenue entries roll into this cell.
                <div className="mt-1 text-xs">
                  The value may come from historical seed data or daily-source imports.
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Entity</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium">Description</th>
                  <th className="px-3 py-2 font-medium text-right">Amount</th>
                  {canMutate && <th className="px-3 py-2 font-medium text-right w-[80px]">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isEditing = editingEntryId === r.entryId && !!editDraft;
                  const isBusy = busyId === r.entryId;
                  if (isEditing && editDraft) {
                    const categoryOptions = editDraft.flow_type === 'cash_in'
                      ? CASH_IN_CATEGORIES
                      : CASH_OUT_CATEGORIES;
                    return (
                      <tr key={r.id} className="border-t border-border bg-muted/30">
                        <td className="px-3 py-2 whitespace-nowrap align-top">{formatNiceDate(r.date)}</td>
                        <td className="px-3 py-2 align-top">{r.account}</td>
                        <td className="px-3 py-2 align-top">
                          <select
                            value={editDraft.category}
                            onChange={(e) => setEditDraft((d) => d && { ...d, category: e.target.value })}
                            className="h-8 w-full rounded-md border border-border bg-background px-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                          >
                            {(categoryOptions as readonly string[]).map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                            {!(categoryOptions as readonly string[]).includes(editDraft.category) && (
                              <option value={editDraft.category}>{editDraft.category}</option>
                            )}
                          </select>
                          <select
                            value={editDraft.frequency_type}
                            onChange={(e) => setEditDraft((d) => d && { ...d, frequency_type: e.target.value as FrequencyType })}
                            className="mt-1 h-8 w-full rounded-md border border-border bg-background px-1 text-[11px] text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                          >
                            <option value="one_time">One-time</option>
                            <option value="weekly">Weekly</option>
                            <option value="bi_weekly">Bi-weekly</option>
                            <option value="monthly_first">Monthly (first weekday)</option>
                            <option value="monthly_last">Monthly (last weekday)</option>
                            <option value="monthly_day">Monthly (day of month)</option>
                          </select>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <input
                            type="text"
                            value={editDraft.description}
                            onChange={(e) => setEditDraft((d) => d && { ...d, description: e.target.value })}
                            placeholder="Description"
                            className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </td>
                        <td className="px-3 py-2 align-top">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={editDraft.amount}
                            onChange={(e) => setEditDraft((d) => d && { ...d, amount: e.target.value })}
                            className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </td>
                        <td className="px-3 py-2 align-top text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => saveEdit(r.entryId)}
                              disabled={isBusy}
                              title="Save"
                            >
                              <Check className="h-3.5 w-3.5 text-emerald-500" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={cancelEdit}
                              disabled={isBusy}
                              title="Cancel"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr
                      key={r.id}
                      className={`border-t border-border hover:bg-muted/40 ${r.projected ? 'italic' : ''}`}
                    >
                      <td className="px-3 py-2 whitespace-nowrap">{formatNiceDate(r.date)}</td>
                      <td className="px-3 py-2">{r.account}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <span>{r.category}</span>
                          {r.projected && (
                            <Badge variant="outline" className="h-4 px-1 text-[9px] font-medium border-amber-500/40 text-amber-500">
                              P
                            </Badge>
                          )}
                          {r.source === 'quickbooks' && (
                            <Badge variant="outline" className="h-4 px-1 text-[9px] font-medium border-emerald-500/40 text-emerald-500">
                              QB
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        <div className="truncate" title={r.notes || ''}>{r.notes || '—'}</div>
                        <div className="text-[10px] text-muted-foreground/70 truncate" title={r.sourceLabel}>
                          Source: {r.sourceLabel}
                        </div>
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${
                          r.signedAmount > 0 ? 'text-emerald-500' : r.signedAmount < 0 ? 'text-red-500' : ''
                        }`}
                      >
                        {fmt(r.signedAmount)}
                      </td>
                      {canMutate && (
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-1 opacity-60 group-hover:opacity-100">
                            {onUpdateEntry && r.source === 'manual' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={() => startEdit(r)}
                                disabled={isBusy}
                                title="Edit entry"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {onDeleteEntry && r.source === 'manual' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                                onClick={() => setDeletePrompt(r)}
                                disabled={isBusy}
                                title="Delete entry"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {r.source !== 'manual' && (
                              <SourceLockedAction row={r} />
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="sticky bottom-0 bg-muted/60 backdrop-blur">
                <tr className="border-t border-border">
                  <td className="px-3 py-2 font-semibold" colSpan={4}>
                    Total ({rows.length} {rows.length === 1 ? 'entry' : 'entries'})
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-semibold tabular-nums ${
                      total > 0 ? 'text-emerald-500' : total < 0 ? 'text-red-500' : ''
                    }`}
                  >
                    {fmt(total)}
                  </td>
                  {canMutate && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="mt-2 text-xs text-muted-foreground">
          Cell total shown in grid: <span className="tabular-nums">{fmt(context.cellValue)}</span>
        </div>
        {scopePrompt && (
          <div className="mt-3 rounded-md border border-border bg-muted/40 p-3 space-y-2">
            <div className="text-sm font-medium">Apply amount change to…</div>
            <div className="text-xs text-muted-foreground">
              Choose whether the new amount of{' '}
              <span className="tabular-nums font-medium text-foreground">
                {fmt(scopePrompt.newAmount)}
              </span>{' '}
              should override only the {formatNiceDate(scopePrompt.occurrenceDate)} entry
              or update this entry and all future entries.
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => applyScope('this_period')}
                disabled={busyId === scopePrompt.entryId}
              >
                For this Period Only
              </Button>
              <Button
                size="sm"
                onClick={() => applyScope('going_forward')}
                disabled={busyId === scopePrompt.entryId}
              >
                Going Forward
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setScopePrompt(null)}
                disabled={busyId === scopePrompt.entryId}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
        <AlertDialog open={!!deletePrompt} onOpenChange={(o) => { if (!o) closeDeletePrompt(); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete entry?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm">
                  <div>You're about to delete:</div>
                  {deletePrompt && (
                    <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
                      <div className="font-medium text-foreground">
                        {formatNiceDate(deletePrompt.date)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {deletePrompt.entry.notes || deletePrompt.category}
                      </div>
                      <div className={`text-sm tabular-nums mt-1 ${
                        deletePrompt.signedAmount > 0 ? 'text-emerald-500' : 'text-red-500'
                      }`}>
                        {fmt(deletePrompt.signedAmount)}
                      </div>
                    </div>
                  )}
                  {deletePrompt && deletePrompt.entry.frequency_type !== 'one_time' && (
                    <div className="text-xs text-muted-foreground">
                      {futureCount === 0
                        ? 'No later entries exist after the selected date. Either option will only remove this single entry.'
                        : `${futureCount} later ${futureCount === 1 ? 'entry' : 'entries'} exist after the selected date. Earlier entries will never be deleted.`}
                    </div>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <AlertDialogCancel disabled={!!deleteBusy} onClick={closeDeletePrompt}>
                Cancel
              </AlertDialogCancel>
              <Button
                variant="outline"
                className="border-red-500/40 text-red-500 hover:bg-red-500/10 hover:text-red-600"
                onClick={confirmDeleteOne}
                disabled={!!deleteBusy}
              >
                {deleteBusy === 'one' ? 'Deleting…' : 'Delete only this entry'}
              </Button>
              {deletePrompt && deletePrompt.entry.frequency_type !== 'one_time' && (
                <Button
                  className="bg-red-600 text-white hover:bg-red-700 shadow-sm shadow-red-600/30"
                  onClick={confirmDeleteFuture}
                  disabled={!!deleteBusy}
                >
                  {deleteBusy === 'future'
                    ? 'Deleting…'
                    : 'Delete this entry and future entries'}
                </Button>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}