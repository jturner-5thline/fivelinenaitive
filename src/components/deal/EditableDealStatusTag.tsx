/**
 * EditableDealStatusTag
 * ---------------------
 * Interactive wrapper around the shared `DealStatusTag` that lets the user
 * change a deal's status in place. Opens a compact popover with the canonical
 * status options (sourced from `STATUS_CONFIG` in `@/types/deal`) and persists
 * the choice via the `useDeals().updateDealStatus` mutation — keeping the
 * deal detail view, left-column tile, and every other surface bound to
 * `deal.status` in sync.
 *
 * Optimistic by design: the mutation updates Supabase + the in-memory deal
 * store, so callers don't need to track local override state. If the request
 * fails we revert via a second mutation back to the prior status and surface
 * a toast.
 *
 * Renders the same translucent pill as `DealStatusTag` so it never visually
 * diverges from the read-only surface — we just append a chevron affordance
 * and make the badge a button.
 */
import { useCallback, useState } from 'react';
import { ChevronDown, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { STATUS_CONFIG, type DealStatus } from '@/types/deal';
import { DealStatusTag } from './DealStatusTag';
import { useDealsContext } from '@/contexts/DealsContext';
import { useInvalidateDealFreshness } from '@/hooks/useDealFreshness';

const STATUS_ORDER: DealStatus[] = ['on-track', 'at-risk', 'off-track', 'on-hold', 'archived'];

export interface EditableDealStatusTagProps {
  dealId: string;
  status: DealStatus | string | null | undefined;
  className?: string;
  hideDot?: boolean;
  /** When true, hides the chevron affordance (still clickable). */
  hideChevron?: boolean;
}

export function EditableDealStatusTag({
  dealId,
  status,
  className,
  hideDot,
  hideChevron,
}: EditableDealStatusTagProps) {
  const { updateDealStatus } = useDealsContext();
  const invalidateFreshness = useInvalidateDealFreshness();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const current = (status || 'on-track') as DealStatus;

  const handleSelect = useCallback(async (next: DealStatus) => {
    setOpen(false);
    if (next === current) return;
    setPending(true);
    const previous = current;
    try {
      await updateDealStatus(dealId, next);
      // Recompute the left-column tile glow immediately — if the deal is
      // now fresh, the stale ring drops off on the next render tick.
      invalidateFreshness();
      toast.success(`Status updated to ${STATUS_CONFIG[next].label}`);
    } catch (err: any) {
      console.error('[EditableDealStatusTag] update failed', err);
      toast.error('Failed to update status', { description: err?.message });
      // Best-effort rollback so other consumers stay in sync.
      try {
        await updateDealStatus(dealId, previous);
        invalidateFreshness();
      } catch { /* swallow */ }
    } finally {
      setPending(false);
    }
  }, [current, dealId, updateDealStatus, invalidateFreshness]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Edit deal status (currently ${STATUS_CONFIG[current]?.label || current})`}
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={pending}
          onClick={(e) => { e.stopPropagation(); }}
          onKeyDown={(e) => { e.stopPropagation(); }}
          className={cn(
            'inline-flex items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'transition-opacity',
            pending && 'opacity-70 cursor-progress',
            className,
          )}
        >
          <DealStatusTag
            status={current}
            hideDot={hideDot}
            className="cursor-pointer hover:brightness-110"
          />
          {!hideChevron && (
            <span className="ml-0.5 inline-flex h-[18px] items-center text-muted-foreground/70">
              {pending
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <ChevronDown className="h-3 w-3" />}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-44 p-1"
        onClick={(e) => e.stopPropagation()}
      >
        <div role="menu" aria-label="Deal status">
          {STATUS_ORDER.map((key) => {
            const cfg = STATUS_CONFIG[key];
            const isActive = key === current;
            return (
              <button
                key={key}
                role="menuitemradio"
                aria-checked={isActive}
                type="button"
                onClick={() => handleSelect(key)}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors text-left',
                  isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', cfg.dotColor)} />
                <span className="flex-1 truncate">{cfg.label}</span>
                {isActive && <Check className="h-3 w-3 text-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default EditableDealStatusTag;