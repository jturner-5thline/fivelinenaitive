import React, { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, ExternalLink } from 'lucide-react';
import { useQbActualsForPeriod } from './QuickBooksActualsPanel';

type KPIFormat = 'currency' | 'percent' | 'number';
export interface KpiLike {
  id: string;
  label: string;
  actual: string;
  target: string;
  format: KPIFormat;
}

function fmt(value: string, format: KPIFormat): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value || '—';
  if (format === 'currency') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
  if (format === 'percent') return `${n.toFixed(1)}%`;
  return new Intl.NumberFormat('en-US').format(n);
}

function classifyKpi(label: string): 'revenue' | 'expense' | 'profit' | null {
  const l = label.toLowerCase();
  if (/\b(net\s*income|profit|ebitda|margin)\b/.test(l)) return 'profit';
  if (/\b(revenue|income|sales|bookings|arr|mrr)\b/.test(l)) return 'revenue';
  if (/\b(expense|cost|opex|spend|cogs)\b/.test(l)) return 'expense';
  return null;
}

interface Props {
  kpi: KpiLike | null;
  open: boolean;
  onClose: () => void;
  period: 'monthly' | 'quarterly';
  quarter: string;
  month: string;
  reportLabel: string;
}

export function KpiDrillDownDialog({ kpi, open, onClose, period, quarter, month, reportLabel }: Props) {
  const { actuals, isLoading, hasRange } = useQbActualsForPeriod(period, quarter, month);
  const kind = useMemo(() => (kpi ? classifyKpi(kpi.label) : null), [kpi]);

  const qbValue = useMemo(() => {
    if (!actuals || !kind) return null;
    if (kind === 'revenue') return actuals.totalIncome;
    if (kind === 'expense') return actuals.totalExpenses;
    return actuals.netIncome;
  }, [actuals, kind]);

  const planN = kpi ? Number(kpi.target) : NaN;
  const actualN = kpi ? Number(kpi.actual) : NaN;
  const variance = Number.isFinite(planN) && Number.isFinite(actualN) ? actualN - planN : null;
  const variancePct = Number.isFinite(planN) && planN !== 0 && variance !== null ? (variance / planN) * 100 : null;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{kpi?.label || 'KPI'}</DialogTitle>
          <DialogDescription>{reportLabel}</DialogDescription>
        </DialogHeader>

        {kpi && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Actual" value={fmt(kpi.actual, kpi.format)} accent="primary" />
              <Stat label="Target" value={fmt(kpi.target, kpi.format)} />
              <Stat
                label="Variance"
                value={variance === null ? '—' : `${variance >= 0 ? '+' : ''}${fmt(String(variance), kpi.format)}`}
                sub={variancePct === null ? undefined : `${variancePct >= 0 ? '+' : ''}${variancePct.toFixed(1)}%`}
                accent={variance === null ? 'muted' : variance >= 0 ? 'pos' : 'neg'}
              />
            </div>

            {kind && (
              <div className="rounded-md border border-border/50 bg-muted/20 p-3">
                <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
                  <span>QuickBooks · {kind}</span>
                  <span>{period === 'monthly' ? month : quarter}</span>
                </div>
                {!hasRange ? (
                  <div className="mt-2 text-sm text-muted-foreground">No QuickBooks range for this period.</div>
                ) : isLoading ? (
                  <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Loading actuals…
                  </div>
                ) : qbValue === null ? (
                  <div className="mt-2 text-sm text-muted-foreground">No QuickBooks data available.</div>
                ) : (
                  <div className="mt-2 flex items-baseline gap-3">
                    <div className="text-2xl font-semibold tabular-nums">{fmt(String(qbValue), 'currency')}</div>
                    {Number.isFinite(actualN) && (
                      <div className="text-xs text-muted-foreground">
                        Δ vs entered actual: {fmt(String(qbValue - actualN), 'currency')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1 text-sm">
              <a
                href="/metrics"
                className="inline-flex items-center gap-1 rounded-md border border-border/60 px-3 py-1.5 hover:bg-accent"
              >
                Open Metrics dashboard <ExternalLink className="h-3 w-3" />
              </a>
              {kind && (
                <a
                  href="/finance"
                  className="inline-flex items-center gap-1 rounded-md border border-border/60 px-3 py-1.5 hover:bg-accent"
                >
                  Open Finance ({kind}) <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, sub, accent = 'default' }: { label: string; value: string; sub?: string; accent?: 'default' | 'primary' | 'pos' | 'neg' | 'muted' }) {
  const color =
    accent === 'primary' ? 'text-foreground' :
    accent === 'pos' ? 'text-emerald-500' :
    accent === 'neg' ? 'text-rose-500' :
    accent === 'muted' ? 'text-muted-foreground' : 'text-foreground';
  return (
    <div className="rounded-md border border-border/50 bg-muted/10 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${color}`}>{value}</div>
      {sub && <div className={`text-xs ${color}`}>{sub}</div>}
    </div>
  );
}