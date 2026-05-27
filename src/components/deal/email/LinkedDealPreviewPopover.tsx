import { useEffect, useRef, useState } from 'react';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Briefcase, ExternalLink, Loader2, Link as LinkIcon, X, User, DollarSign, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface DealPreview {
  id: string;
  company: string;
  stage: string | null;
  status: string | null;
  deal_owner: string | null;
  manager: string | null;
  value: number | null;
  notes_updated_at: string | null;
  updated_at: string | null;
}

interface Props {
  /** Anchor element next to which the preview floats. */
  anchorRef: React.RefObject<HTMLElement>;
  open: boolean;
  dealId: string | null;
  onOpenChange: (open: boolean) => void;
}

const STATUS_TONE: Record<string, string> = {
  'on-track': 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
  'at-risk': 'bg-amber-500/15 text-amber-500 border-amber-500/30',
  'on-hold': 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  'off-track': 'bg-red-500/15 text-red-500 border-red-500/30',
  archived: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
};

function formatUsd(n: number | null | undefined): string | null {
  if (n == null || !isFinite(n)) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}MM`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

/**
 * Linked-deal preview card that appears after a user picks a deal in the
 * email toolbar's LinkToDealPopover. Lives as a sibling of the picker — not
 * nested — so the picker's onOpenChange/outside-click handlers cannot race
 * the preview's mount. Fetches the deal with an AbortController so a stale
 * resolve cannot leave the spinner stuck if the component unmounts mid-fetch.
 */
export function LinkedDealPreviewPopover({ anchorRef, open, dealId, onOpenChange }: Props) {
  const [deal, setDeal] = useState<DealPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);
  const fellbackRef = useRef(false);

  useEffect(() => {
    if (!open || !dealId) return;
    let cancelled = false;
    const controller = new AbortController();
    fellbackRef.current = false;
    setDeal(null);
    setLoading(true);
    setErrored(false);

    // Hard 3s fallback — never leave the spinner stuck.
    const timeout = setTimeout(() => {
      if (cancelled || fellbackRef.current) return;
      fellbackRef.current = true;
      setLoading(false);
      setErrored(true);
      toast.message('Deal linked, but preview unavailable — click Linked to view.');
      onOpenChange(false);
    }, 3000);

    (async () => {
      try {
        const { data, error } = await supabase
          .from('deals')
          .select('id, company, stage, status, deal_owner, manager, value, notes_updated_at, updated_at')
          .eq('id', dealId)
          .abortSignal(controller.signal)
          .maybeSingle();
        if (cancelled || fellbackRef.current) return;
        if (error) throw error;
        setDeal((data as DealPreview) || null);
        setLoading(false);
      } catch (err: any) {
        if (cancelled || fellbackRef.current) return;
        if (err?.name === 'AbortError') return;
        console.error('[LinkedDealPreviewPopover] fetch failed', err);
        setErrored(true);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [open, dealId, onOpenChange]);

  const owner = deal?.deal_owner || deal?.manager || null;
  const valueLabel = formatUsd(deal?.value);
  const lastActivity = deal?.notes_updated_at || deal?.updated_at || null;
  const statusKey = (deal?.status || '').toLowerCase();
  const statusTone = STATUS_TONE[statusKey] || 'bg-muted text-muted-foreground border-border';

  return (
    <Popover open={open && !!dealId} onOpenChange={onOpenChange}>
      <PopoverAnchor virtualRef={anchorRef as any} />
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={8}
        collisionPadding={16}
        avoidCollisions
        className="z-[1500] w-[320px] p-0 overflow-hidden"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-start justify-between gap-2 px-3 pt-3 pb-2 border-b">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-primary font-semibold">
            <LinkIcon className="h-3 w-3" /> Linked deal
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close preview"
            className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 px-3 py-5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading deal preview…
          </div>
        ) : errored || !deal ? (
          <div className="px-3 py-4 text-xs text-muted-foreground">
            Preview unavailable. The deal is still linked — click Linked to view it.
          </div>
        ) : (
          <div className="p-3 space-y-2.5">
            <div className="flex items-start gap-2">
              <Briefcase className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-foreground truncate">{deal.company}</div>
                <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                  {deal.status && (
                    <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-[18px] capitalize', statusTone)}>
                      {deal.status.replace(/-/g, ' ')}
                    </Badge>
                  )}
                  {deal.stage && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-[18px] border-border text-muted-foreground">
                      {deal.stage}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-1.5 text-xs">
              {owner && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <User className="h-3 w-3" />
                  <span className="text-foreground/90 truncate">{owner}</span>
                </div>
              )}
              {valueLabel && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <DollarSign className="h-3 w-3" />
                  <span className="text-foreground/90">{valueLabel}</span>
                </div>
              )}
              {lastActivity && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span className="text-foreground/90">
                    Last activity {formatDistanceToNow(new Date(lastActivity), { addSuffix: true })}
                  </span>
                </div>
              )}
            </div>

            <Button
              size="sm"
              className="w-full h-8 mt-1 gap-1.5"
              onClick={() => {
                window.open(`/deals?deal=${deal.id}`, '_blank', 'noopener,noreferrer');
              }}
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open deal
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default LinkedDealPreviewPopover;