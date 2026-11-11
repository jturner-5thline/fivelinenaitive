import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Receipt } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { monthWindow, sumInvoiceTotals } from '@/lib/finance/monthInvoiceRange';
import type { DrilldownColumn, DrilldownContext } from '@/components/metrics/insights/InsightsDrilldownDrawer';

const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

interface Props {
  onDrill: (d: { context: DrilldownContext; columns: DrilldownColumn[]; rows: Array<Record<string, unknown>>; defaultSort?: { key: string; dir: 'asc' | 'desc' } }) => void;
}

/** Total of QBO invoices issued in a month, across every connected entity. */
export function MonthToDateRevenueCard({ onDrill }: Props) {
  const [offset, setOffset] = useState(0);
  const win = monthWindow(offset);

  const { data: entities = [] } = useQuery({
    queryKey: ['qb-mtd-entities'],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('quickbooks_tokens').select('realm_id, company_name');
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['qb-mtd-invoices', win.start, win.end],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quickbooks_invoices')
        .select('id, customer_name, doc_number, txn_date, total_amt, balance, realm_id')
        .gte('txn_date', win.start)
        .lte('txn_date', win.end)
        .order('txn_date', { ascending: false })
        .limit(5000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const total = sumInvoiceTotals(invoices);
  const entityName = (r: string) => entities.find((e) => e.realm_id === r)?.company_name || `Entity ${r.slice(0, 8)}`;
  const title = win.isCurrent ? 'Month to Date Revenue' : `${win.label} Invoices`;
  const shortTitle = win.isCurrent ? 'Month to Date Revenue' : `${win.label.slice(0, 3)} ${win.label.slice(-4)} Invoices`;

  const open = () => onDrill({
    context: { sourceId: 'qb:mtd-revenue', sourceLabel: title, selection: `${invoices.length} invoices · ${fmt(total)}`, periodLabel: win.label },
    columns: [
      { key: 'customer', label: 'Customer', sortable: true },
      { key: 'entity', label: 'Entity', sortable: true },
      { key: 'doc', label: 'Invoice #' },
      { key: 'date', label: 'Date', sortable: true },
      { key: 'amount', label: 'Total', align: 'right', sortable: true, render: (r) => fmt(r.amount), sortAccessor: (r) => r.amount },
      { key: 'status', label: 'Status', align: 'right' },
    ],
    rows: invoices.map((i) => ({
      customer: i.customer_name ?? '—', entity: entityName(i.realm_id), doc: i.doc_number ?? '—', date: i.txn_date ?? '—',
      amount: Number(i.total_amt) || 0,
      status: (Number(i.balance) || 0) > 0 ? `Open ${fmt(Number(i.balance))}` : 'Paid',
    })),
    defaultSort: { key: 'date', dir: 'desc' },
  });

  const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };

  return (
    <Card onClick={open} className="cursor-pointer hover:border-primary/40 transition-colors">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate" title={title}>{shortTitle}</p>
            <p className="text-xl font-bold text-foreground">{isLoading ? '…' : fmt(total)}</p>
            <p className="text-xs text-muted-foreground mt-1">{invoices.length} invoices sent</p>
          </div>
          <div className="p-2 rounded-full bg-primary/15"><Receipt className="h-4 w-4 text-primary" /></div>
        </div>
        <div className="mt-2 flex items-center gap-1">
          <button aria-label="Previous month" onClick={stop(() => setOffset((o) => o - 1))} className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="text-[11px] text-muted-foreground">{win.label}</span>
          <button aria-label="Next month" disabled={win.isCurrent} onClick={stop(() => setOffset((o) => Math.min(0, o + 1)))} className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          {!win.isCurrent && (
            <button onClick={stop(() => setOffset(0))} className="ml-auto rounded border border-border px-1.5 text-[10px] text-primary hover:bg-muted">MTD</button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
