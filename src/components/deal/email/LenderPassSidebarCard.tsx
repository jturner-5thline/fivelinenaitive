import { useState } from 'react';
import { Loader2, Check, X, AlertCircle, Pencil, Inbox } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { LenderPassDetection } from '@/hooks/useLenderPassDetection';

interface Props {
  detection: LenderPassDetection;
  committing: boolean;
  autoCommit: boolean;
  onSetAutoCommit: (v: boolean) => void;
  onConfirm: (reasonOverride?: string) => void;
  onDismiss: () => void;
  /** Defer the suggestion to the dashboard Action Queue instead of confirming now. */
  onAddToQueue?: (reasonOverride?: string) => void;
}

const CONFIDENCE_TONE: Record<string, string> = {
  high: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  medium: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  low: 'bg-muted text-muted-foreground border-border',
};

/**
 * LenderPassSidebarCard — richer pass detection card that lives in the
 * AI Assist sidebar alongside the reply drafts.
 */
export function LenderPassSidebarCard({
  detection,
  committing,
  autoCommit,
  onSetAutoCommit,
  onConfirm,
  onDismiss,
  onAddToQueue,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState(detection.reason_summary || '');
  const noLenderMatch = !detection.deal_lender_id;

  if (detection.status === 'confirmed') {
    return (
      <div className="rounded-md border border-emerald-500/20 bg-emerald-500/[0.04] p-3">
        <div className="flex items-center gap-2">
          <Check className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-[12px] font-semibold text-foreground">
            {detection.lender_name} marked Passed
          </span>
        </div>
        {(detection.edited_reason || detection.reason_summary) && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            {detection.edited_reason || detection.reason_summary}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-amber-500/20 bg-amber-500/[0.04] p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-amber-400 shrink-0" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-300/90">
          Lender pass detected
        </span>
        <Badge
          variant="outline"
          className={cn('ml-auto text-[9px] h-4 px-1.5 border', CONFIDENCE_TONE[detection.confidence])}
        >
          {detection.confidence}
        </Badge>
      </div>

      <div className="text-[12px] text-foreground/90 font-medium leading-snug">
        {detection.lender_name}
      </div>

      {detection.source_quote && (
        <blockquote className="text-[11px] text-muted-foreground italic border-l-2 border-amber-500/30 pl-2 leading-relaxed">
          &ldquo;{detection.source_quote}&rdquo;
        </blockquote>
      )}

      {!editing ? (
        <p className="text-[11px] text-foreground/75 leading-relaxed">
          <span className="text-muted-foreground">Reason:</span>{' '}
          {detection.reason_summary || <span className="italic">no reason extracted</span>}
        </p>
      ) : (
        <Input
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="h-8 text-[11px]"
          placeholder="Pass reason"
        />
      )}

      {noLenderMatch && (
        <div className="flex items-start gap-1.5 text-[10px] text-amber-300/90 bg-amber-500/[0.04] rounded p-2">
          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
          <span>Sender not matched to a lender on this deal.</span>
        </div>
      )}

      <div className="flex items-center gap-1.5 pt-1">
        <Button
          size="sm"
          className="h-7 px-2 text-[11px] gap-1 bg-amber-500 hover:bg-amber-500/90 text-amber-950 flex-1"
          disabled={committing || noLenderMatch}
          onClick={() => onConfirm(editing ? reason : undefined)}
        >
          {committing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Confirm
        </Button>
        {onAddToQueue && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[11px] gap-1"
            disabled={committing || noLenderMatch}
            onClick={() => onAddToQueue(editing ? reason : undefined)}
            title="Add to Action Queue — review later from the dashboard"
          >
            <Inbox className="h-3 w-3" />
            Queue
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[11px] gap-1"
          onClick={() => setEditing((e) => !e)}
        >
          <Pencil className="h-3 w-3" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-[11px] gap-1 text-muted-foreground"
          onClick={onDismiss}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-amber-500/15">
        <div className="text-[10px] text-muted-foreground leading-tight">
          Auto-commit high-confidence passes
        </div>
        <Switch
          checked={autoCommit}
          onCheckedChange={onSetAutoCommit}
          className="scale-75 origin-right"
        />
      </div>
    </div>
  );
}
