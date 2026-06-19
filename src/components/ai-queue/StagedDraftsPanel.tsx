import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Send, Trash2, Mail } from 'lucide-react';
import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  useStagedEmailDrafts,
  useSendStagedDraft,
  useCancelStagedDraft,
} from '@/hooks/useAiActionQueue';

/**
 * Staged email drafts — approved drafted-email queue items land here
 * awaiting manual review and Send Now. Approve never auto-sends.
 */
export function StagedDraftsPanel() {
  const { data: drafts = [], isLoading } = useStagedEmailDrafts();
  const send = useSendStagedDraft();
  const cancel = useCancelStagedDraft();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="p-4 text-center text-xs text-muted-foreground">
        <Loader2 className="inline h-3 w-3 mr-1 animate-spin" /> Loading staged drafts…
      </div>
    );
  }

  if (!drafts.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 py-6 text-xs text-muted-foreground">
        <Mail className="h-5 w-5 opacity-50" />
        <p>No staged drafts.</p>
        <p className="text-[10px]">Approving a drafted email queues it here for manual send.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-2">
      {drafts.map((d) => {
        const busy = busyId === d.id;
        return (
          <div key={d.id} className="rounded-md border border-white/10 bg-background/50 p-2.5 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate" title={d.subject || ''}>
                  {d.subject || '(no subject)'}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">
                  To: {Array.isArray(d.to_recipients) ? d.to_recipients.join(', ') : String(d.to_recipients)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Staged {formatDistanceToNow(new Date(d.staged_at), { addSuffix: true })}
                </p>
              </div>
              <Badge variant="outline" className="text-[10px] shrink-0">staged</Badge>
            </div>
            {d.body_html && (
              <div
                className="text-[11px] text-foreground/80 line-clamp-3"
                dangerouslySetInnerHTML={{ __html: d.body_html }}
              />
            )}
            <div className="flex items-center gap-1.5 pt-1 border-t border-white/10">
              <Button
                size="sm"
                className="h-6 px-2 text-[10px] gap-1"
                disabled={busy}
                onClick={async () => {
                  setBusyId(d.id);
                  await send(d.id);
                  setBusyId(null);
                }}
              >
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                Send now
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-destructive"
                disabled={busy}
                onClick={async () => {
                  setBusyId(d.id);
                  await cancel(d.id);
                  setBusyId(null);
                }}
              >
                <Trash2 className="h-3 w-3" />
                Discard
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}