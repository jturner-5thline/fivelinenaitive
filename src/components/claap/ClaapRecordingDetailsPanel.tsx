import { useEffect, useState } from 'react';
import { Loader2, ExternalLink, Video, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { asStringArray, stripClaapTimestamps } from '@/types/claap';

interface Props {
  recordingId?: string | null;
  recordingTitle?: string | null;
  recordingUrl?: string | null;
  onClose?: () => void;
}

interface Details {
  summary: string | null;
  actionItems: string[];
  keyTakeaways: string[];
  url: string | null;
}

/**
 * Read-only Claap details for a linked recording (summary, key takeaways,
 * action items) — the same content the End of Day meeting cards surface.
 * Rendered inline in the Notes tab's main panel.
 */
export function ClaapRecordingDetailsPanel({ recordingId, recordingTitle, recordingUrl, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState<Details | null>(null);

  useEffect(() => {
    if (!recordingId) return;
    let cancelled = false;
    setLoading(true);
    setDetails(null);
    (async () => {
      const { data } = await (supabase.from('claap_recordings') as any)
        .select('summary, action_items, key_takeaways, recording_url')
        .eq('external_id', recordingId)
        .maybeSingle();
      if (cancelled) return;
      setDetails({
        summary: data?.summary ? stripClaapTimestamps(data.summary) : null,
        actionItems: asStringArray(data?.action_items ?? null),
        keyTakeaways: asStringArray(data?.key_takeaways ?? null),
        url: data?.recording_url ?? recordingUrl ?? null,
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [recordingId, recordingUrl]);

  const url = details?.url ?? recordingUrl ?? null;

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <Video className="h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{recordingTitle || 'Meeting'}</p>
        {url && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => window.open(url, '_blank')}>
            <ExternalLink className="h-3 w-3" /> Open in Claap
          </Button>
        )}
        {onClose && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} title="Close">
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ScrollArea className="flex-1 min-h-0" viewportClassName="pr-3 [scrollbar-gutter:stable]">
          <div className="space-y-5 p-4">
            <section>
              <h4 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Summary</h4>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {details?.summary || 'No summary available yet for this recording.'}
              </p>
            </section>

            {(details?.keyTakeaways?.length ?? 0) > 0 && (
              <section>
                <h4 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Key takeaways</h4>
                <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm leading-relaxed text-foreground/90">
                  {details!.keyTakeaways.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </section>
            )}

            <section>
              <h4 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Action items</h4>
              {(details?.actionItems?.length ?? 0) > 0 ? (
                <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm leading-relaxed text-foreground/90">
                  {details!.actionItems.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              ) : (
                <p className="mt-1.5 text-sm text-muted-foreground">No action items captured.</p>
              )}
            </section>
          </div>
        </ScrollArea>
      )}
    </div>
  );
}