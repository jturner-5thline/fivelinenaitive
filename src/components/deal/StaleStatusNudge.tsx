import { useMemo, useState, useCallback, useEffect } from 'react';
import { BellDot, Loader2, RefreshCw, Pencil, Check, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { Deal } from '@/types/deal';
import { useAuth } from '@/contexts/AuthContext';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { isStatusNoteStale } from '@/lib/businessDays';
import { isAtOrBeforeTermsIssued } from '@/lib/dealStageOrder';
import { canSeeStaleStatusNudge } from '@/lib/dealStaleNudgePermissions';
import { useStaleStatusNoteContext } from '@/hooks/useStaleStatusNoteContext';
import {
  suggestStatusNoteUpdate,
  hasSufficientActivity,
  collectSources,
} from '@/services/smartStatusNoteSuggestion';
import { logNaitivePipelineAudit } from '@/lib/naitivePipelineAudit';

export interface StaleStatusNudgeProps {
  deal: Pick<Deal, 'id' | 'company' | 'name' | 'stage' | 'status' | 'notes' | 'notesUpdatedAt' | 'lenders' | 'contactInfo' | 'manager' | 'dealOwner'>;
  /** Save handler that writes the new note text. Same path RichTextInlineEdit uses. */
  onSave: (text: string) => void;
  /** Override "now" for tests. */
  now?: Date;
}

/**
 * Subtle amber bell-dot icon shown in the top-right corner of the deal
 * status-note container when the note hasn't been updated in > 3 US
 * business days. Opens a popover with an AI-suggested 1–2 sentence
 * update the user can Accept / Edit / Regenerate / Cancel.
 *
 * Strictly gated: deal must be active and at-or-before "Terms Issued",
 * and viewer must be the deal owner, manager, or an admin. Read-only
 * users never see the icon.
 */
export function StaleStatusNudge({ deal, onSave, now }: StaleStatusNudgeProps) {
  const { user } = useAuth();
  const { permissions } = useUserPermissions();

  const today = now ?? new Date();
  const staleness = useMemo(
    () => isStatusNoteStale(deal.notesUpdatedAt || null, today),
    [deal.notesUpdatedAt, today],
  );

  const userFullName =
    (user?.user_metadata as any)?.full_name ||
    (user?.user_metadata as any)?.name ||
    null;

  const canSee = canSeeStaleStatusNudge({
    deal,
    userFullName,
    userEmail: user?.email || null,
    isAdmin: !!permissions.admin,
    isReadOnly: !permissions.deals,
  });

  const stageEligible = isAtOrBeforeTermsIssued(deal);

  const [open, setOpen] = useState(false);
  const ctxQuery = useStaleStatusNoteContext(deal, open);

  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<string>('');
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [generated, setGenerated] = useState(false);
  const [insufficient, setInsufficient] = useState(false);

  const generate = useCallback(async () => {
    if (!ctxQuery.data) return;
    setLoading(true);
    setGenerated(false);
    setInsufficient(false);
    try {
      if (!hasSufficientActivity(ctxQuery.data)) {
        setInsufficient(true);
        setSuggestion('');
        return;
      }
      const result = await suggestStatusNoteUpdate(ctxQuery.data);
      if (!result.ok) {
        // single retry attempt
        const retry = await suggestStatusNoteUpdate(ctxQuery.data);
        setSuggestion(retry.text || result.text || '');
        setGenerated(true);
      } else {
        setSuggestion(result.text);
        setGenerated(true);
      }
    } finally {
      setLoading(false);
    }
  }, [ctxQuery.data]);

  // Kick off generation when popover opens and context is ready
  const handleOpenChange = useCallback(async (next: boolean) => {
    setOpen(next);
    if (next) {
      setEditing(false);
      setSuggestion('');
      setGenerated(false);
      setInsufficient(false);
    }
  }, []);

  // Auto-fire generation once context resolves and popover is open
  useEffect(() => {
    if (open && ctxQuery.data && !loading && !generated && !insufficient) {
      void generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ctxQuery.data]);

  const handleAccept = useCallback(async () => {
    const text = editing ? editValue.trim() : suggestion.trim();
    if (!text) return;
    onSave(text);
    void logNaitivePipelineAudit({
      entityType: 'deal_transition',
      entityId: deal.id,
      action: 'status_note_ai_suggest',
      context: {
        mode: editing ? 'edited' : 'accepted',
        suggestion,
        finalValue: text,
        sources: ctxQuery.data ? collectSources(ctxQuery.data) : [],
      },
    });
    toast.success('Status updated');
    setOpen(false);
  }, [editing, editValue, suggestion, onSave, deal.id, ctxQuery.data]);

  const startEdit = useCallback(() => {
    setEditValue(suggestion);
    setEditing(true);
  }, [suggestion]);

  if (!canSee || !stageEligible || !staleness.stale) return null;

  const tooltipText =
    staleness.businessDaysSince === Number.POSITIVE_INFINITY
      ? 'Status note hasn\u2019t been added yet. Click to draft an AI update.'
      : `Status hasn\u2019t been updated in ${staleness.businessDaysSince} business days. Click to draft an AI update.`;

  const sources = ctxQuery.data ? collectSources(ctxQuery.data) : [];

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Draft AI status update"
                className={cn(
                  'absolute top-2 right-2 z-10 inline-flex h-6 w-6 items-center justify-center',
                  'rounded-full text-amber-400/80 hover:text-amber-300 hover:bg-amber-400/10',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 transition-colors',
                )}
              >
                <BellDot className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="left" className="text-xs">{tooltipText}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent align="end" className="w-[420px] p-3 space-y-3" data-testid="stale-status-popover">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">AI status update suggestion</h4>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {staleness.businessDaysSince === Number.POSITIVE_INFINITY ? 'No prior note' : `${staleness.businessDaysSince}d stale`}
          </span>
        </div>

        {deal.notes && (
          <div className="rounded-md border border-border/60 bg-muted/30 p-2 text-xs text-muted-foreground max-h-24 overflow-auto">
            <span className="font-medium text-foreground/70">Current: </span>
            <span className="whitespace-pre-wrap break-words" dangerouslySetInnerHTML={{ __html: deal.notes }} />
          </div>
        )}

        <div className="rounded-md border border-border bg-background p-2 min-h-[72px]">
          {loading || ctxQuery.isLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Drafting suggestion…
            </div>
          ) : insufficient ? (
            <p className="text-xs text-muted-foreground">
              Not enough recent activity to suggest an update — please update manually.
            </p>
          ) : editing ? (
            <Textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              maxLength={280}
              rows={3}
              className="text-sm"
              data-testid="stale-status-edit"
            />
          ) : (
            <p className="text-sm leading-snug" data-testid="stale-status-suggestion">
              {suggestion || (generated ? 'No suggestion produced. Try Generate again.' : '\u00A0')}
            </p>
          )}
        </div>

        {sources.length > 0 && !insufficient && (
          <details className="text-[11px] text-muted-foreground">
            <summary className="cursor-pointer select-none">Generated from</summary>
            <ul className="mt-1 ml-4 list-disc space-y-0.5">
              {sources.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </details>
        )}

        <div className="flex items-center justify-end gap-1.5 pt-1">
          {insufficient ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                <X className="h-3.5 w-3.5 mr-1" /> Cancel
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setEditValue(''); setEditing(true); setInsufficient(false); }}>
                <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button size="sm" variant="ghost" onClick={generate} disabled={loading}>
                <RefreshCw className={cn('h-3.5 w-3.5 mr-1', loading && 'animate-spin')} />
                Generate again
              </Button>
              {!editing ? (
                <Button size="sm" variant="outline" onClick={startEdit} disabled={!suggestion}>
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                </Button>
              ) : null}
              <Button
                size="sm"
                onClick={handleAccept}
                disabled={loading || (editing ? !editValue.trim() : !suggestion.trim())}
              >
                <Check className="h-3.5 w-3.5 mr-1" />
                {editing ? 'Save' : 'Accept'}
              </Button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default StaleStatusNudge;