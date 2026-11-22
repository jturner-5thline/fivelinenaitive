import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FINANCIAL_YEARS } from './financialsPlan';

export type PlanMode = 'monthly' | 'quarterly';

/** Shared 2027 | 2028 and Monthly | Quarterly toggles used by every Master Plan tab. Quarterly shows both years. */
export function PlanPeriodToggles({ year, mode, onYear, onMode }: { year: number; mode: PlanMode; onYear: (y: number) => void; onMode: (m: PlanMode) => void }) {
  const cls = (active: boolean) => cn('h-8 px-3 text-xs', !active && 'text-muted-foreground');
  return (
    <div className="flex items-center gap-1">
      {mode === 'monthly' && FINANCIAL_YEARS.map((y) => (
        <Button key={y} type="button" size="sm" variant={y === year ? 'default' : 'ghost'} className={cls(y === year)} onClick={() => onYear(y)}>{y}</Button>
      ))}
      <span className="mx-2 h-5 w-px bg-border" />
      {(['monthly', 'quarterly'] as PlanMode[]).map((m) => (
        <Button key={m} type="button" size="sm" variant={m === mode ? 'default' : 'ghost'} className={cls(m === mode)} onClick={() => onMode(m)}>
          {m === 'monthly' ? 'Monthly' : 'Quarterly'}
        </Button>
      ))}
    </div>
  );
}
