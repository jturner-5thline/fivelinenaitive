import { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  generateOccurrences,
  resolveCategoryAlias,
  CASH_IN_CATEGORIES,
  CASH_OUT_CATEGORIES,
  type ScheduledCashFlow,
} from './scheduledCashFlows';
import { fmt } from './formatters';

const DEBT_ADV_SUBKEYS = ['Retainer', 'Milestone', 'Closing Fees'] as const;

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
  if (rowKey === 'TOTAL RECEIPTS' || rowKey === 'CASH IN') {
    return { categories: new Set(CASH_IN_CATEGORIES as readonly string[]), flowFilter: 'in' };
  }
  if (rowKey === 'TOTAL DISBURSEMENTS' || rowKey === 'CASH OUT') {
    return { categories: new Set(CASH_OUT_CATEGORIES as readonly string[]), flowFilter: 'out' };
  }
  if (rowKey === 'NET CHANGE' || rowKey === 'TOTAL NET CASH CHANGE') {
    return {
      categories: new Set([
        ...(CASH_IN_CATEGORIES as readonly string[]),
        ...(CASH_OUT_CATEGORIES as readonly string[]),
      ]),
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
  date: string;
  account: string;
  category: string;
  notes: string | null;
  flow_type: 'cash_in' | 'cash_out';
  signedAmount: number;
}

export function CashFlowDrilldownModal({ open, onClose, context, items }: Props) {
  const rows = useMemo<DrilldownRow[]>(() => {
    if (!context) return [];
    const { rowKey, weekKey, weekEnding } = context;
    const rangeStart = parseDate(weekKey);
    const rangeEnd = parseDate(weekEnding);
    const { categories, flowFilter } = categoriesForRow(rowKey);

    const out: DrilldownRow[] = [];
    for (const entry of items) {
      // Resolve aliased / legacy category labels to canonical row keys.
      const cat = resolveCategoryAlias(entry.category);
      if (!categories.has(cat)) continue;
      if (flowFilter === 'in' && entry.flow_type !== 'cash_in') continue;
      if (flowFilter === 'out' && entry.flow_type !== 'cash_out') continue;

      const occurrences = generateOccurrences(entry, rangeStart, rangeEnd);
      for (const occ of occurrences) {
        const amt = Number(entry.amount) || 0;
        out.push({
          id: `${entry.id}-${occ}`,
          date: occ,
          account: entry.account,
          category: cat,
          notes: entry.notes,
          flow_type: entry.flow_type,
          signedAmount: entry.flow_type === 'cash_in' ? amt : -amt,
        });
      }
    }
    out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return out;
  }, [context, items]);

  const total = useMemo(() => rows.reduce((s, r) => s + r.signedAmount, 0), [rows]);

  if (!context) return null;
  const weekRangeLabel = `${formatNiceDate(context.weekKey)} – ${formatNiceDate(context.weekEnding)}`;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{context.rowLabel}</DialogTitle>
          <div className="text-sm text-muted-foreground mt-1">
            Week of {weekRangeLabel}
          </div>
        </DialogHeader>

        {rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No Configure Payments &amp; Revenue entries roll into this cell.
            <div className="mt-1 text-xs">
              The value may come from historical seed data or daily-source imports.
            </div>
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