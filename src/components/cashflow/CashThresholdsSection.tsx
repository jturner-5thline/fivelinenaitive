import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { formatCurrencyInputValue, parseCurrencyInputValue } from '@/utils/currencyFormat';
import { DEFAULT_CASH_THRESHOLDS, setCashThresholds, useCashThresholds } from './cashThresholds';

function Field({ label, hint, value, onCommit }: { label: string; hint: string; value: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState(formatCurrencyInputValue(value));
  useEffect(() => setText(formatCurrencyInputValue(value)), [value]);
  const commit = () => {
    const n = parseCurrencyInputValue(text);
    if (n === undefined) setText(formatCurrencyInputValue(value));
    else onCommit(n);
  };
  return (
    <label className="flex flex-col gap-1 min-w-[180px]">
      <span className="text-xs font-medium text-foreground">{label}</span>
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
        <Input
          inputMode="numeric"
          className="pl-6 h-9"
          value={text}
          onChange={(e) => setText(e.target.value.replace(/[^\d,]/g, ''))}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          aria-label={label}
        />
      </div>
      <span className="text-[11px] text-muted-foreground">{hint}</span>
    </label>
  );
}

export function CashThresholdsSection() {
  const t = useCashThresholds();
  const isDefault = t.minLiquidity === DEFAULT_CASH_THRESHOLDS.minLiquidity && t.caution === DEFAULT_CASH_THRESHOLDS.caution;
  return (
    <div className="px-6 py-4 border-b border-border flex flex-wrap items-end gap-6">
      <div className="flex flex-col gap-0.5 mr-2">
        <span className="text-sm font-semibold">Cash Thresholds</span>
        <span className="text-xs text-muted-foreground">Applies instantly to the charts and Low Cash alerts.</span>
      </div>
      <Field label="Low Water Mark (Min Liquidity)" hint="Dashed amber line on the Cash Balance chart" value={t.minLiquidity} onCommit={(v) => setCashThresholds({ minLiquidity: v })} />
      <Field label="Caution Threshold" hint="Low Cash KPI turns red and warning shows below this" value={t.caution} onCommit={(v) => setCashThresholds({ caution: v })} />
      {!isDefault && (
        <button type="button" className="text-xs text-muted-foreground hover:text-foreground underline mb-5" onClick={() => setCashThresholds(DEFAULT_CASH_THRESHOLDS)}>
          Reset to defaults
        </button>
      )}
    </div>
  );
}
