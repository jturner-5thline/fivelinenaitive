import { useState } from 'react';
import { Loader2, Check, X, Pencil, AlertCircle } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { LenderPassDetection } from '@/hooks/useLenderPassDetection';

interface Props {
  detection: LenderPassDetection;
  committing: boolean;
  onConfirm: (reasonOverride?: string) => void;
  onDismiss: () => void;
}

const CONFIDENCE_TONE: Record<string, string> = {
  high: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  medium: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  low: 'bg-muted text-muted-foreground border-border',
};

/**
 * LenderPassBanner — inline banner above the email body when AI Assist
 * detects a pass response from a funding source on a deal-linked thread.
 */
export function LenderPassBanner({ detection, committing, onConfirm, onDismiss }: Props) {
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState(detection.reason_summary || '');

  const noLenderMatch = !detection.deal_lender_id;

  return (
    <div
      className={cn(
        'mx-5 mb-3 rounded-md border bg-amber-500/[0.04] border-amber-500/20',
        'px-4 py-3'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-amber-500/15 p-1.5 mt-0.5 shrink-0">
          <Sparkles className="h-3.5 w-3.5 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-foreground">
              AI detected a pass from <span className="text-amber-300">{detection.lender_name}</span>
            </span>
            <Badge
              variant="outline"
              className={cn('text-[10px] h-4 px-1.5 border', CONFIDENCE_TONE[detection.confidence])}
            >
              {detection.confidence} confidence
            </Badge>
          </div>

          {detection.source_quote && (
            <blockquote className="mt-1.5 text-[12px] text-muted-foreground italic border-l-2 border-amber-500/30 pl-2.5">
              &ldquo;{detection.source_quote}&rdquo;
            </blockquote>
          )}

          {!editing ? (
            <p className="mt-1.5 text-[12px] text-foreground/80">
              <span className="text-muted-foreground">Reason:</span>{' '}
              {detection.reason_summary || <span className="italic">no reason extracted</span>}
            </p>
          ) : (
            <Input
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-2 h-8 text-[12px]"
              placeholder="Pass reason (will be saved on the funding source)"
            />
          )}

          {noLenderMatch && (
            <div className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-300/90">
              <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
              <span>
                Could not match the sender to a funding source on this deal. Update the funding source
                manually if this is a pass.
              </span>
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <Button
              size="sm"
              className="h-7 px-2.5 text-[11px] gap-1.5 bg-amber-500 hover:bg-amber-500/90 text-amber-950 disabled:opacity-50"
              disabled={committing || noLenderMatch}
              onClick={() => onConfirm(editing ? reason : undefined)}
            >
              {committing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Mark Passed
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => setEditing((e) => !e)}
            >
              <Pencil className="h-3 w-3" />
              {editing ? 'Cancel edit' : 'Edit reason'}
            </Button>
            <div className="flex-1" />
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
              onClick={onDismiss}
            >
              <X className="h-3 w-3" />
              Dismiss
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
