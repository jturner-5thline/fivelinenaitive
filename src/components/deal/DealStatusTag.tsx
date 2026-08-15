import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { STATUS_CONFIG, type DealStatus } from '@/types/deal';

/**
 * Shared, compact deal-status tag.
 *
 * Single source of truth for how a deal's `status` (On Track, At Risk,
 * Off Track, On Hold, Archived) is visualised across the app. Renders a
 * translucent pill in the same color family as the `STATUS_CONFIG`
 * `dotColor` token so detail surfaces and list tiles stay in lockstep.
 *
 * Use anywhere a deal status needs to be surfaced — list tiles, header
 * chips, drill-downs — instead of re-inventing color classes.
 */

// Low-saturation treatment: subtle tinted wash, hairline border, readable
// label. Colour signals state only — green positive, red negative, amber
// attention, neutral slate for paused / archived.
const STATUS_TAG_THEME: Record<DealStatus, string> = {
  'on-track': 'border-emerald-300/25 text-emerald-200 bg-emerald-400/10',
  'at-risk': 'border-amber-300/25 text-amber-200 bg-amber-400/10',
  'off-track': 'border-red-300/25 text-red-200 bg-red-400/10',
  'on-hold': 'border-slate-300/20 text-slate-200 bg-slate-300/[0.07]',
  'archived': 'border-slate-300/15 text-slate-300 bg-slate-300/[0.05]',
};

export interface DealStatusTagProps {
  status: DealStatus | string | null | undefined;
  className?: string;
  /** When true, hides the leading status dot for ultra-dense surfaces. */
  hideDot?: boolean;
}

export function DealStatusTag({ status, className, hideDot = false }: DealStatusTagProps) {
  if (!status) return null;
  const key = status as DealStatus;
  const config = STATUS_CONFIG[key];
  if (!config) return null;
  const tone = STATUS_TAG_THEME[key] ?? STATUS_TAG_THEME['on-track'];
  return (
    <Badge
      variant="secondary"
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0 h-[18px] rounded-md text-[10px] font-semibold leading-none whitespace-nowrap border transition-colors',
        tone,
        className,
      )}
      title={config.label}
    >
      {!hideDot && (
        <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', config.dotColor)} />
      )}
      <span className="truncate">{config.label}</span>
    </Badge>
  );
}
