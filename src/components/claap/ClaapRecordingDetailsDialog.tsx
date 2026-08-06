import { useEffect, useState } from 'react';
import { Loader2, ExternalLink, Video } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { asStringArray, stripClaapTimestamps } from '@/types/claap';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordingId?: string | null;
  recordingTitle?: string | null;
  recordingUrl?: string | null;
}

interface Details {
  summary: string | null;
  actionItems: string[];
  keyTakeaways: string[];
  url: string | null;
  startedAt: string | null;
}

/**
 * Read-only Claap details for a linked recording: AI summary, key takeaways and
 * action items — the same content surfaced in the End of Day meeting cards.
 */
export function ClaapRecordingDetailsDialog({ open, onOpenChange, recordingId, recordingTitle, recordingUrl }: Props) {
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState<Details | null>(null);

  useEffect(() => {
    if (!open || !recordingId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await (supabase.from('claap_recordings') as any)
        .select('summary, action_items, key_takeaways, recording_url, started_at')
        .eq('external_id', recordingId)
        .maybeSingle();
      if (cancelled) return;
      setDetails({
        summary: data?.summary ? stripClaapTimestamps(data.summary) : null,
        actionItems: asStringArray(data?.action_items ?? null),
        keyTakeaways: asStringArray(data?.key_takeaways ?? null),
        url: data?.recording_url ?? recordingUrl ?? null,
        startedAt: data?.started_at ?? null,
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, recordingId, recordingUrl]);

  const url = details?.url ?? recordingUrl ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Video className="h-4 w-4 text-muted-foreground" />
            {recordingTitle || 'Meeting details'}
          </DialogTitle>
          <DialogDescription>Claap summary, key takeaways and action items.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh]" viewportClassName="pr-3 [scrollbar-gutter:stable]">
            <div className="space-y-4 pr-1">
              <section>
                <h4 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Summary</h4>
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/90">
                  {details?.summary || 'No summary available yet for this recording.'}
                </p>
              </section>

              {(details?.keyTakeaways?.length ?? 0) > 0 && (
                <section>
                  <h4 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Key takeaways</h4>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-foreground/90">
                    {details!.keyTakeaways.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                </section>
              )}

              <section>
                <h4 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Action items</h4>
                {(details?.actionItems?.length ?? 0) > 0 ? (
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-foreground/90">
                    {details!.actionItems.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">No action items captured.</p>
                )}
              </section>

              {url && (
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => window.open(url, '_blank')}>
                  <ExternalLink className="h-3 w-3" /> Open in Claap
                </Button>
              )}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}