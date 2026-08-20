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
import { ChevronDown, Check, Loader2, CircleDashed } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { STATUS_CONFIG, type DealStatus } from '@/types/deal';
import { DealStatusTag } from './DealStatusTag';
import { useRequestStatusChange } from './StatusChangeGate';

const STATUS_ORDER: DealStatus[] = ['on-track', 'at-risk', 'off-track', 'on-hold', 'archived'];
const NONE_VALUE = '__none__' as const;
type StatusChoice = DealStatus | typeof NONE_VALUE;

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
  const requestStatusChange = useRequestStatusChange();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const current: DealStatus | null = (status as DealStatus | null) || null;

  const handleSelect = useCallback(async (choice: StatusChoice) => {
    // Breadcrumb: confirms the click on a status option actually reaches
    // our handler — useful when debugging surfaces (Deal Rundown, master
    // tile lists) where ancestor click/keyboard handlers could otherwise
    // swallow the event.
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug('[EditableDealStatusTag] select', { dealId, choice });
    }
    setOpen(false);
    const next: DealStatus | null = choice === NONE_VALUE ? null : choice;
    if (next === current) return;
    setPending(true);
    try {
      // All writes flow through the global StatusChangeGate, which forces
      // the user to type a fresh status note and persists status+notes
      // together (bumping notes_updated_at). Toasts + cross-surface query
      // invalidations are handled inside the gate.
      await requestStatusChange({ dealId, currentStatus: current, nextStatus: next });
    } finally {
      setPending(false);
    }
  }, [current, dealId, requestStatusChange]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Edit deal status (currently ${current ? STATUS_CONFIG[current]?.label || current : 'none'})`}
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={pending}
          data-status={current ?? undefined}
          onClick={(e) => { e.stopPropagation(); }}
          onPointerDown={(e) => { e.stopPropagation(); }}
          onMouseDown={(e) => { e.stopPropagation(); }}
          onKeyDown={(e) => {
            // Block Enter/Space from bubbling to ancestor tile/row handlers
            // (e.g. PipelineMemoView DealTile uses Enter/Space to open the
            // deal). Radix Popover still receives the keydown via its own
            // capture-phase listener, so the menu opens as expected.
            if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
            else e.stopPropagation();
          }}
          className={cn(
            'deal-status-control inline-flex items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'transition-opacity',
            pending && 'opacity-70 cursor-progress',
            className,
          )}
        >
          {current ? (
            <DealStatusTag
              status={current}
              hideDot={hideDot}
              className="cursor-pointer hover:brightness-110"
            />
          ) : (
            <span className="inline-flex items-center gap-1 px-1.5 py-0 h-[18px] rounded-full text-[10px] font-medium leading-none whitespace-nowrap border border-border/60 bg-muted/40 text-muted-foreground cursor-pointer hover:bg-muted/60">
              {!hideDot && <CircleDashed className="h-2.5 w-2.5" />}
              <span className="truncate">No status</span>
            </span>
          )}
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
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div role="menu" aria-label="Deal status">
          <button
            key={NONE_VALUE}
            role="menuitemradio"
            aria-checked={current === null}
            type="button"
            onClick={(e) => { e.stopPropagation(); handleSelect(NONE_VALUE); }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className={cn(
              'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors text-left',
              current === null ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
            )}
          >
            <CircleDashed className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
            <span className="flex-1 truncate">None</span>
            {current === null && <Check className="h-3 w-3 text-primary shrink-0" />}
          </button>
          {STATUS_ORDER.map((key) => {
            const cfg = STATUS_CONFIG[key];
            const isActive = key === current;
            return (
              <button
                key={key}
                role="menuitemradio"
                aria-checked={isActive}
                type="button"
                onClick={(e) => { e.stopPropagation(); handleSelect(key); }}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
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