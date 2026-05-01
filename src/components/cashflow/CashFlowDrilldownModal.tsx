import { useMemo, useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, X, Pencil, Trash2, Check } from 'lucide-react';
import {
  generateOccurrences,
  resolveCategoryToGridRow,
  CASH_IN_CATEGORIES,
  CASH_OUT_CATEGORIES,
  CANONICAL_TO_GRID_ROW,
  applyVariance,
  type ScheduledCashFlow,
  type FrequencyType,
  type FlowType,
} from './scheduledCashFlows';
import { fmt } from './formatters';

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
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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
        const base = Number(entry.amount) || 0;
        const amt = applyVariance(
          base,
          entry.frequency_config?.variance_pct,
          `${entry.id || entry.category}:${occ}`,
        );
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
      amount: String(Math.abs(Number(r.entry.amount) || 0)),
      category: r.entry.category,
      frequency_type: r.entry.frequency_type,
      flow_type: r.entry.flow_type,
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
    setBusyId(entryId);
    const ok = await onUpdateEntry(entryId, {
      notes: editDraft.description.trim() || null,
      amount: amt,
      category: editDraft.category,
      frequency_type: editDraft.frequency_type,
      flow_type: editDraft.flow_type,
    });
    setBusyId(null);
    if (ok) cancelEdit();
  };
  const handleDelete = async (entryId: string) => {
    if (!onDeleteEntry) return;
    if (!window.confirm('Delete this entry? This will remove all of its occurrences from the table.')) return;
    setBusyId(entryId);
    await onDeleteEntry(entryId);
    setBusyId(null);
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
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border hover:bg-muted/40">
                    <td className="px-3 py-2 whitespace-nowrap">{formatNiceDate(r.date)}</td>
                    <td className="px-3 py-2">{r.account}</td>
                    <td className="px-3 py-2">{r.category}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.notes || '—'}</td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        r.signedAmount > 0 ? 'text-emerald-500' : r.signedAmount < 0 ? 'text-red-500' : ''
                      }`}
                    >
                      {fmt(r.signedAmount)}
                    </td>
                  </tr>
                ))}
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
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="mt-2 text-xs text-muted-foreground">
          Cell total shown in grid: <span className="tabular-nums">{fmt(context.cellValue)}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}