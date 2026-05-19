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

const STATUS_TAG_THEME: Record<DealStatus, string> = {
  'on-track': 'bg-green-500/15 text-green-400 border-green-500/20',
  'at-risk': 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
  'off-track': 'bg-red-500/15 text-red-400 border-red-500/20',
  'on-hold': 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  'archived': 'bg-orange-500/15 text-orange-400 border-orange-500/20',
};

export interface DealStatusTagProps {
  status: DealStatus | string | null | undefined;
  className?: string;
  /** When true, hides the leading status dot for ultra-dense surfaces. */
  hideDot?: boolean;
}

export function DealStatusTag({ status, className, hideDot = false }: DealStatusTagProps) {
  const key = (status || 'on-track') as DealStatus;
  const config = STATUS_CONFIG[key];
  if (!config) return null;
  const tone = STATUS_TAG_THEME[key] ?? STATUS_TAG_THEME['on-track'];
  return (
    <Badge
      variant="secondary"
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0 h-[18px] rounded-full text-[10px] font-medium leading-none whitespace-nowrap border transition-colors',
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
