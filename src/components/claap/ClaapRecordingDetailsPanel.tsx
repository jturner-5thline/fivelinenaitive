import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, ExternalLink, Video, X, Sparkles } from 'lucide-react';
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
  /** Meeting row id (claap_meetings.id) when the content lives there. */
  meetingId?: string | null;
  hasTranscript?: boolean;
}

/**
 * Read-only Claap details for a linked recording (summary, key takeaways,
 * action items) — the same content the End of Day meeting cards surface.
 * Rendered inline in the Notes tab's main panel.
 */
export function ClaapRecordingDetailsPanel({ recordingId, recordingTitle, recordingUrl, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState<Details | null>(null);
  const [generating, setGenerating] = useState(false);
  const autoTriedRef = useRef<string | null>(null);

  const load = useCallback(async (): Promise<Details | null> => {
    if (!recordingId) return null;
    // 1) Hydrated recording row (Claap-provided summary/action items).
    const { data: rec } = await (supabase.from('claap_recordings') as any)
      .select('summary, action_items, key_takeaways, recording_url')
      .eq('external_id', recordingId)
      .maybeSingle();

    let next: Details = {
      summary: rec?.summary ? stripClaapTimestamps(rec.summary) : null,
      actionItems: asStringArray(rec?.action_items ?? null),
      keyTakeaways: asStringArray(rec?.key_takeaways ?? null),
      url: rec?.recording_url ?? recordingUrl ?? null,
    };

    // 2) Fall back to the meeting row — this is what the email drafters read,
    //    so a recording without a Claap summary can still have content here.
    if (!next.summary || (!next.actionItems.length && !next.keyTakeaways.length)) {
      const { data: mtg } = await (supabase.from('claap_meetings') as any)
        .select('id, ai_summary, next_steps, key_decisions, recording_url, transcript')
        .eq('claap_id', recordingId)
        .maybeSingle();
      if (mtg) {
        next = {
          summary: next.summary || (mtg.ai_summary ? stripClaapTimestamps(mtg.ai_summary) : null),
          actionItems: next.actionItems.length ? next.actionItems : asStringArray(mtg.next_steps ?? null),
          keyTakeaways: next.keyTakeaways.length ? next.keyTakeaways : asStringArray(mtg.key_decisions ?? null),
          url: next.url ?? mtg.recording_url ?? null,
          meetingId: mtg.id ?? null,
          hasTranscript: Boolean(mtg.transcript && String(mtg.transcript).trim().length > 0),
        };
      }
    }
    return next;
  }, [recordingId, recordingUrl]);

  const generate = useCallback(async (meetingId: string) => {
    setGenerating(true);
    try {
      await supabase.functions.invoke('claap-analyze-meeting', { body: { meeting_id: meetingId } });
      const refreshed = await load();
      if (refreshed) setDetails(refreshed);
    } finally {
      setGenerating(false);
    }
  }, [load]);

  useEffect(() => {
    if (!recordingId) return;
    let cancelled = false;
    setLoading(true);
    setDetails(null);
    (async () => {
      const next = await load();
      if (cancelled) return;
      setDetails(next);
      setLoading(false);
      // Auto-generate once when a transcript exists but no summary was ever made.
      if (next && !next.summary && next.hasTranscript && next.meetingId && autoTriedRef.current !== recordingId) {
        autoTriedRef.current = recordingId;
        void generate(next.meetingId);
      }
    })();
    return () => { cancelled = true; };
  }, [recordingId, load, generate]);

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
              {details?.summary ? (
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                  {details.summary}
                </p>
              ) : generating ? (
                <p className="mt-1.5 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating summary from the transcript…
                </p>
              ) : details?.hasTranscript && details?.meetingId ? (
                <div className="mt-1.5 space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Transcript is available, but no summary has been generated yet.
                  </p>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => generate(details.meetingId!)}>
                    <Sparkles className="h-3 w-3" /> Generate summary
                  </Button>
                </div>
              ) : (
                <p className="mt-1.5 text-sm text-muted-foreground">No summary available yet for this recording.</p>
              )}
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