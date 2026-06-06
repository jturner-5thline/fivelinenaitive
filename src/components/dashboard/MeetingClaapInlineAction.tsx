import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Video, Check, Pencil, X, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useClaapRecordings, type ClaapRecording } from '@/hooks/useClaapRecordings';
import { toast } from 'sonner';

interface Attendee { email?: string | null; displayName?: string | null; self?: boolean; responseStatus?: string | null }
interface Props {
  eventId: string;
  eventTitle: string;
  eventStart?: string | null;
  eventEnd?: string | null;
  organizerEmail?: string | null;
  attendees: Attendee[];
  onOpenPicker: () => void;
}

interface RankedTop { recording: ClaapRecording; score: number; reasons: any[] }

interface ExistingLinkRow {
  id: string;
  recording_id: string;
  recording_title: string | null;
  recording_url: string | null;
}

export function MeetingClaapInlineAction(props: Props) {
  const { eventId, eventTitle, eventStart, eventEnd, organizerEmail, attendees, onOpenPicker } = props;
  const { company } = useCompany();
  const qc = useQueryClient();
  const { recordings, fetchRecordings, loading: loadingRecordings } = useClaapRecordings();
  const [didFetch, setDidFetch] = useState(false);
  const [ranked, setRanked] = useState<RankedTop | null>(null);
  const [ranking, setRanking] = useState(false);
  const [approving, setApproving] = useState(false);
  const [autoApproved, setAutoApproved] = useState(false);
  const [userRejected, setUserRejected] = useState(false);

  // Lazy load recordings once per mount
  useEffect(() => {
    if (!eventId || didFetch) return;
    setDidFetch(true);
    fetchRecordings().catch((err) => console.warn('claap recordings fetch failed', err));
  }, [eventId, didFetch, fetchRecordings]);

  // Existing manual link for this event
  const { data: existing } = useQuery<ExistingLinkRow | null>({
    queryKey: ['event-claap-inline-link', eventId, company?.id],
    enabled: !!company?.id && !!eventId,
    queryFn: async () => {
      try {
        const { data, error } = await (supabase
          .from('event_claap_recordings') as any)
          .select('id, recording_id, recording_title, recording_url')
          .eq('org_company_id', company!.id)
          .eq('event_id', eventId)
          .order('linked_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) {
          console.warn('inline claap link query failed', error);
          return null;
        }
        return (data as ExistingLinkRow | null) || null;
      } catch (err) {
        console.warn('inline claap link query threw', err);
        return null;
      }
    },
  });

  // Run scoring once recordings load
  useEffect(() => {
    if (!eventId || !recordings || recordings.length === 0) return;
    if (existing) return; // skip — already linked
    let cancelled = false;
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      setRanking(false);
    }, 4000);
    (async () => {
      try {
        setRanking(true);
        const meeting_context = {
          title: eventTitle || null,
          start_time: eventStart || null,
          end_time: eventEnd || null,
          organizer_email: organizerEmail || null,
          attendees: (attendees || []).map(a => ({
            email: a.email || null,
            name: a.displayName || null,
            self: !!a.self,
          })),
        };
        const { data, error } = await supabase.functions.invoke(
          'claap-rank-recordings-for-meeting',
          { body: { action: 'rank', event_id: eventId, recordings, meeting_context } },
        );
        if (cancelled || timedOut) return;
        if (error) {
          console.warn('claap inline rank error', error);
          return;
        }
        const top = (data?.ranked || [])[0];
        if (!top) return;
        const rec = recordings.find(r => r.id === top.external_id);
        if (!rec) return;
        setRanked({ recording: rec, score: top.score || 0, reasons: top.reasons || [] });
      } catch (err) {
        console.warn('claap inline rank threw', err);
      } finally {
        if (!cancelled) {
          clearTimeout(timeoutId);
          setRanking(false);
        }
      }
    })();
    return () => { cancelled = true; clearTimeout(timeoutId); };
  }, [eventId, eventTitle, eventStart, eventEnd, organizerEmail, attendees, recordings, existing]);

  const band: 'linked' | 'auto' | 'review' | 'none' = useMemo(() => {
    if (existing) return 'linked';
    if (userRejected || !ranked) return 'none';
    if (ranked.score >= 0.90) return 'auto';
    if (ranked.score >= 0.65) return 'review';
    return 'none';
  }, [existing, ranked, userRejected]);

  const handleApprove = async () => {
    if (!ranked) return;
    setApproving(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        'claap-rank-recordings-for-meeting',
        {
          body: {
            action: 'confirm',
            event_id: eventId,
            recording: ranked.recording,
            confidence: ranked.score,
            reasons: ranked.reasons,
            meeting_context: {
              title: eventTitle || null,
              start_time: eventStart || null,
              end_time: eventEnd || null,
              organizer_email: organizerEmail || null,
              attendees: (attendees || []).map(a => ({
                email: a.email || null,
                name: a.displayName || null,
                self: !!a.self,
              })),
            },
          },
        },
      );
      if (error) throw error;
      const canonicalId = (data as any)?.recording_id as string | undefined;
      // Write event_claap_recordings mirror (org-scoped) so the inline button shows "Linked".
      if (company?.id) {
        try {
          await (supabase.from('event_claap_recordings') as any).upsert({
            org_company_id: company.id,
            event_id: eventId,
            recording_id: ranked.recording.id,
            recording_title: ranked.recording.title || null,
            recording_url: ranked.recording.url || null,
            thumbnail_url: ranked.recording.thumbnailUrl || null,
            duration_seconds: ranked.recording.durationSeconds || null,
            recorder_name: ranked.recording.recorder?.name || null,
            recorder_email: ranked.recording.recorder?.email || null,
            recorded_at: ranked.recording.createdAt || null,
            deal_ids: [],
            company_ids: [],
            contact_ids: [],
          }, { onConflict: 'org_company_id,event_id,recording_id' });
        } catch (err) {
          console.warn('event_claap_recordings mirror upsert failed', err);
        }
      }
      // Log the review as accepted.
      if (canonicalId) {
        try {
          await (supabase.from('claap_mapping_reviews') as any).insert({
            recording_id: canonicalId,
            resolution: 'accepted',
            feedback: { source: 'inline_meeting_action', confidence: ranked.score, reasons: ranked.reasons },
          });
        } catch (err) {
          console.warn('claap_mapping_reviews insert failed', err);
        }
      }
      toast.success('Recording linked');
      qc.invalidateQueries({ queryKey: ['event-claap-inline-link', eventId] });
      qc.invalidateQueries({ queryKey: ['event-claap-links', eventId] });
      qc.invalidateQueries({ queryKey: ['meeting-claap-context', eventId, company?.id] });
    } catch (err: any) {
      console.error('approve claap link failed', err);
      toast.error(err?.message || 'Failed to approve link');
    } finally {
      setApproving(false);
    }
  };

  useEffect(() => {
    setAutoApproved(false);
  }, [eventId]);

  useEffect(() => {
    if (band !== 'auto' || autoApproved || approving || !!existing || userRejected) return;
    setAutoApproved(true);
    void handleApprove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [band, autoApproved, approving, existing, userRejected]);

  // Render variants ---------------------------------------------------------
  const title = existing
    ? (existing.recording_title || 'Linked recording')
    : (ranked?.recording.title || 'Suggested recording');
  const url = existing ? existing.recording_url : ranked?.recording.url || null;
  const scorePct = ranked ? Math.round((ranked.score || 0) * 100) : null;

  const pill = (() => {
    if (band === 'linked') {
      return (
        <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-sky-500/40 text-sky-300 bg-sky-500/10">
          Linked
        </Badge>
      );
    }
    if (band === 'auto') {
      return (
        <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-emerald-500/40 text-emerald-300 bg-emerald-500/10">
          Auto-matched {scorePct}%
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-amber-500/40 text-amber-300 bg-amber-500/10">
        Suggested {scorePct}%
      </Badge>
    );
  })();

  const labelPrefix = band === 'review' ? 'Suggested: ' : '';

  // Primary button cell — always rendered to keep the 4-action row balanced.
  // Label/click handler match the original `none`-state CTA so we don't change
  // semantics: the rich suggestion/linked details render in the portaled bar.
  const buttonCell = (
    <Button
      size="sm"
      variant="outline"
      className={cn(
        'h-8 w-full min-w-0 justify-start gap-1.5 px-2 text-xs text-white',
        band === 'none' && 'border-primary/30 bg-primary/[0.06] hover:bg-primary/[0.12]',
        band === 'linked' && 'border-sky-500/40 bg-sky-500/[0.08] hover:bg-sky-500/[0.14]',
        band === 'auto' && 'border-emerald-500/40 bg-emerald-500/[0.08] hover:bg-emerald-500/[0.14]',
        band === 'review' && 'border-amber-500/40 bg-amber-500/[0.08] hover:bg-amber-500/[0.14]',
      )}
      onClick={onOpenPicker}
    >
      <Video className="h-3.5 w-3.5 text-primary shrink-0" />
      <span className="truncate">
        {ranking || loadingRecordings ? 'Checking Claap…' : 'Link Claap Recording'}
      </span>
      {(ranking || loadingRecordings) && <Loader2 className="h-3 w-3 animate-spin shrink-0" />}
    </Button>
  );

  if (band === 'none') return buttonCell;

  // Suggestion / linked detail bar — rendered via portal below the 4-button
  // action row so it can use full width and never clips the equal-width cell.
  const bar = (
    <div
      className={cn(
        'w-full min-w-0 rounded-md border px-2.5 py-1.5 flex flex-wrap items-center gap-2',
        band === 'auto' && 'border-emerald-500/30 bg-emerald-500/[0.05]',
        band === 'review' && 'border-amber-500/30 bg-amber-500/[0.05]',
        band === 'linked' && 'border-sky-500/30 bg-sky-500/[0.05]',
      )}
    >
      <a
        href={url || '#'}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => { if (!url) e.preventDefault(); }}
        className={cn(
          'flex items-center gap-1.5 min-w-0 flex-1 basis-[200px] text-xs text-white hover:underline',
          !url && 'pointer-events-none opacity-90',
        )}
        title={title}
      >
        <Video className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="truncate">▶ {labelPrefix}{title}</span>
        {url && <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />}
      </a>
      {pill}
      <div className="flex items-center gap-0.5 shrink-0">
        {band === 'auto' && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[10px] gap-1 text-emerald-200 hover:text-emerald-100 hover:bg-emerald-500/10"
            disabled={approving}
            onClick={handleApprove}
          >
            {approving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Approve
          </Button>
        )}
        {band === 'review' && (
          <>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px] gap-1 text-emerald-200 hover:text-emerald-100 hover:bg-emerald-500/10"
              disabled={approving}
              onClick={handleApprove}
            >
              {approving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Approve
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px] gap-1 text-rose-300 hover:text-rose-200 hover:bg-rose-500/10"
              onClick={() => setUserRejected(true)}
            >
              <X className="h-3 w-3" /> Reject
            </Button>
          </>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[10px] gap-1 text-white/80 hover:text-white hover:bg-white/[0.08]"
          onClick={onOpenPicker}
        >
          <Pencil className="h-3 w-3" /> Change
        </Button>
      </div>
    </div>
  );

  const slot = typeof document !== 'undefined'
    ? document.getElementById(`claap-suggest-slot-${eventId}`)
    : null;
  return (
    <>
      {buttonCell}
      {slot ? createPortal(bar, slot) : null}
    </>
  );
}