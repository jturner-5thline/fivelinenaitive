import { Paperclip, Sparkles, FolderOpen, X, Inbox as InboxIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { DataRoomDestinationSuggestion } from '@/hooks/useEmailToDataRoom';

interface Props {
  attachmentCount: number;
  dealName?: string;
  suggestion: DataRoomDestinationSuggestion | null;
  loading: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
  /** Optional — defer this suggestion to the AI Approval Queue. */
  onAddToQueue?: () => void;
}

const CONFIDENCE_TONE: Record<string, string> = {
  high: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5',
  medium: 'border-amber-500/30 text-amber-400 bg-amber-500/5',
  low: 'border-muted-foreground/30 text-muted-foreground bg-muted/20',
};

/**
 * DataRoomSuggestionCard
 * ----------------------
 * Lives inside the AI Assist sidebar. Surfaces a proactive prompt to upload
 * email attachments into the affiliated deal's data room. The user clicks
 * Confirm to open the full SendToDataRoomDialog (with the AI suggestion
 * already applied), or Dismiss to hide the card for the session.
 */
export function DataRoomSuggestionCard({
  attachmentCount,
  dealName,
  suggestion,
  loading,
  onConfirm,
  onDismiss,
  onAddToQueue,
}: Props) {
  const targetName = suggestion?.suggested_deal_name || dealName;
  const targetLabel = targetName ? `${targetName} Data Room — Internal` : 'a deal data room';

  return (
    <div className="rounded-md border border-primary/20 bg-primary/5 p-3 space-y-2.5">
      <div className="flex items-start gap-2">
        <div className="rounded-md bg-primary/10 p-1.5 shrink-0">
          <Paperclip className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px] font-semibold text-foreground">
              {attachmentCount} attachment{attachmentCount === 1 ? '' : 's'} detected
            </span>
            {suggestion && (
              <Badge
                variant="outline"
                className={cn('text-[9px] h-4 px-1.5 border', CONFIDENCE_TONE[suggestion.confidence])}
              >
                <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                {suggestion.confidence}
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
            {loading
              ? 'AI is picking the best destination…'
              : `Add to ${targetLabel}?`}
          </p>
          {suggestion?.reason && !loading && (
            <p className="text-[10px] text-muted-foreground/70 italic leading-relaxed mt-1">
              {suggestion.reason}
            </p>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="text-muted-foreground/60 hover:text-muted-foreground shrink-0 -m-1 p-1"
          title="Dismiss"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          className="h-7 text-[11px] gap-1.5 bg-primary hover:bg-primary/90"
          onClick={onConfirm}
          disabled={loading}
        >
          <FolderOpen className="h-3 w-3" /> Review &amp; upload
        </Button>
        {onAddToQueue && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] gap-1"
            onClick={onAddToQueue}
            disabled={loading}
            title="Add to Approval Queue for batch review"
          >
            <InboxIcon className="h-3 w-3" /> Add to Queue
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={onDismiss}>
          Not now
        </Button>
      </div>
    </div>
  );
}
