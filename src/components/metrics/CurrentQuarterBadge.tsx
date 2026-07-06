import { cn } from '@/lib/utils';

/**
 * Small badge that shows the calendar quarter the CURRENT DATE falls into,
 * independent of any header timeframe selector. Positioned absolutely inside
 * a widget wrapper (parent must be `relative`).
 */
export function CurrentQuarterBadge({ className }: { className?: string }) {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3) + 1;
  const label = `Q${q} ${now.getFullYear()}`;
  return (
    <span
      className={cn(
        'pointer-events-none absolute top-1.5 right-2 z-10',
        'text-[10px] uppercase tracking-wider font-medium',
        'text-muted-foreground/70',
        className,
      )}
      aria-label={`Current quarter ${label}`}
      title={`Current quarter · ${label}`}
    >
      {label}
    </span>
  );
}
