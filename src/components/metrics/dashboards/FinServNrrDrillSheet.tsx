import { useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { NrrCustomerRow } from '@/hooks/useFinServNrr';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customers: NrrCustomerRow[];
  priorTotal: number;
  currentTotal: number;
  nrr: number | null;
  priorLabel: string;
  currentLabel: string;
  isLoading?: boolean;
}

const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const pct = (n: number | null) => (n == null ? 'n/a' : `${n.toFixed(1)}%`);

export function FinServNrrDrillSheet({
  open,
  onOpenChange,
  customers,
  priorTotal,
  currentTotal,
  nrr,
  priorLabel,
  currentLabel,
  isLoading,
}: Props) {
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? customers.filter((c) => c.customer.toLowerCase().includes(needle)) : customers;
  }, [customers, q]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-white">Net Revenue Retention</SheetTitle>
          <SheetDescription>
            Cohort = customers billed in the prior period ({priorLabel}). Customers first billed in the
            current period ({currentLabel}) are excluded.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-border/50 bg-background/40 p-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Prior revenue</div>
            <div className="text-lg font-semibold tabular-nums text-white">{usd(priorTotal)}</div>
          </div>
          <div className="rounded-lg border border-border/50 bg-background/40 p-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Current revenue</div>
            <div className="text-lg font-semibold tabular-nums text-white">{usd(currentTotal)}</div>
          </div>
          <div className="rounded-lg border border-border/50 bg-background/40 p-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">NRR</div>
            <div className="text-lg font-semibold tabular-nums text-white">{pct(nrr)}</div>
          </div>
        </div>

        <div className="mt-4">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search customers…"
            className="h-9"
          />
        </div>

        <div className="mt-3 rounded-lg border border-border/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-background/60">
              <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Customer</th>
                <th className="px-3 py-2 text-right font-medium">Last period</th>
                <th className="px-3 py-2 text-right font-medium">This period</th>
                <th className="px-3 py-2 text-right font-medium">Change</th>
                <th className="px-3 py-2 text-right font-medium">Retention</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                    No billed customers in the prior period.
                  </td>
                </tr>
              )}
              {!isLoading &&
                rows.map((c) => {
                  const delta = c.currentRevenue - c.priorRevenue;
                  return (
                    <tr key={c.customer} className="border-t border-border/40">
                      <td className="px-3 py-2 text-white">{c.customer}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{usd(c.priorRevenue)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{usd(c.currentRevenue)}</td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${
                          delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-rose-400' : 'text-muted-foreground'
                        }`}
                      >
                        {delta > 0 ? '+' : ''}
                        {usd(delta)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Badge
                          variant="outline"
                          className={
                            c.currentRevenue === 0
                              ? 'border-rose-500/40 text-rose-300'
                              : (c.retention ?? 0) >= 100
                                ? 'border-emerald-500/40 text-emerald-300'
                                : 'border-amber-500/40 text-amber-300'
                          }
                        >
                          {c.currentRevenue === 0 ? 'Churned' : pct(c.retention)}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </SheetContent>
    </Sheet>
  );
}
