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

// Glassy bordered treatment: opaque colored border + translucent gradient
// fill + bright legible label (matches the stage tag / "+ New Deal" button).
const STATUS_TAG_THEME: Record<DealStatus, string> = {
  'on-track': 'border-teal-300/95 text-teal-50 bg-gradient-to-br from-teal-400/25 to-emerald-400/15',
  'at-risk': 'border-yellow-300/95 text-yellow-50 bg-gradient-to-br from-yellow-400/25 to-amber-400/15',
  'off-track': 'border-red-300/95 text-red-50 bg-gradient-to-br from-red-500/25 to-rose-400/15',
  'on-hold': 'border-blue-300/95 text-blue-50 bg-gradient-to-br from-blue-500/25 to-sky-400/15',
  'archived': 'border-orange-300/95 text-orange-50 bg-gradient-to-br from-orange-500/25 to-amber-500/15',
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
        'inline-flex items-center gap-1 px-1.5 py-0 h-[18px] rounded-md text-[10px] font-semibold leading-none whitespace-nowrap border backdrop-blur-[8px] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] [text-shadow:0_1px_2px_rgba(0,0,0,0.55)] transition-colors',
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
