import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Video, Check, Pencil, X, ExternalLink, RefreshCw } from 'lucide-react';
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

type ResolutionStatus =
  | 'auto_linked'
  | 'suggested'
  | 'no_match'
  | 'manual_linked'
  | 'manually_changed';

interface ResolutionRow {
  id: string;
  resolution_status: ResolutionStatus;
  top_candidate_recording_id: string | null;
  top_candidate_external_id: string | null;
  top_candidate_score: number | null;
  top_candidate_title: string | null;
  top_candidate_url: string | null;
}

export function MeetingClaapInlineAction(props: Props) {
  const { eventId, eventTitle, eventStart, eventEnd, organizerEmail, attendees, onOpenPicker } = props;
  const { company } = useCompany();
  const qc = useQueryClient();
  const { recordings, fetchRecordings } = useClaapRecordings();
  const [didFetch, setDidFetch] = useState(false);
  const [ranked, setRanked] = useState<RankedTop | null>(null);
  const [ranking, setRanking] = useState(false);
  const [approving, setApproving] = useState(false);
  const [autoApproved, setAutoApproved] = useState(false);
  const [userRejected, setUserRejected] = useState(false);
  const [forceRescore, setForceRescore] = useState(0);
  const scoringStartedRef = useRef<string | null>(null);

  // Existing manual link for this event (kept for display fallback)
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

  // Persisted resolution row — primary source of truth.
  const { data: resolution, isLoading: resolutionLoading } = useQuery<ResolutionRow | null>({
    queryKey: ['meeting-claap-resolution', eventId, company?.id],
    enabled: !!company?.id && !!eventId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase
        .from('meeting_claap_resolution') as any)
        .select('id, resolution_status, top_candidate_recording_id, top_candidate_external_id, top_candidate_score, top_candidate_title, top_candidate_url')
        .eq('org_company_id', company!.id)
        .eq('event_id', eventId)
        .maybeSingle();
      if (error) {
        console.warn('meeting_claap_resolution query failed', error);
        return null;
      }
      return (data as ResolutionRow | null) || null;
    },
  });

  // Realtime: refresh when this meeting's resolution row changes.
  useEffect(() => {
    if (!company?.id || !eventId) return;
    const channel = supabase
      .channel(`mcr-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'meeting_claap_resolution',
          filter: `event_id=eq.${eventId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ['meeting-claap-resolution', eventId, company.id] });
          qc.invalidateQueries({ queryKey: ['event-claap-inline-link', eventId, company.id] });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [eventId, company?.id, qc]);

  const needsScoring = !resolutionLoading && !resolution && !existing;
  const computing = needsScoring || ranking || (forceRescore > 0 && ranking);

  // Lazy load recordings only when we actually need to score.
  useEffect(() => {
    if (!eventId || didFetch) return;
    if (!needsScoring && forceRescore === 0) return;
    setDidFetch(true);
    fetchRecordings().catch((err) => console.warn('claap recordings fetch failed', err));
  }, [eventId, didFetch, fetchRecordings, needsScoring, forceRescore]);

  // Persist a resolution row (idempotent upsert).
  const persistResolution = async (
    status: ResolutionStatus,
    top: { externalId: string | null; score: number | null; title: string | null; url: string | null } | null,
  ) => {
    if (!company?.id) return;
    try {
      let canonicalId: string | null = null;
      if (top?.externalId) {
        const { data: rec } = await (supabase
          .from('claap_recordings') as any)
          .select('id')
          .eq('external_id', top.externalId)
          .maybeSingle();
        canonicalId = (rec?.id as string | undefined) ?? null;
      }
      await (supabase.from('meeting_claap_resolution') as any).upsert({
        org_company_id: company.id,
        event_id: eventId,
        resolution_status: status,
        resolved_at: new Date().toISOString(),
        top_candidate_recording_id: canonicalId,
        top_candidate_external_id: top?.externalId ?? null,
        top_candidate_score: top?.score ?? null,
        top_candidate_title: top?.title ?? null,
        top_candidate_url: top?.url ?? null,
      }, { onConflict: 'org_company_id,event_id' });
      qc.invalidateQueries({ queryKey: ['meeting-claap-resolution', eventId, company.id] });
    } catch (err) {
      console.warn('meeting_claap_resolution upsert failed', err);
    }
  };

  // Run scoring ONLY when no resolution exists or user forced a re-score.
  useEffect(() => {
    if (!eventId) return;
    if (!needsScoring && forceRescore === 0) return;
    if (!recordings) return;
    // Cap rescoring re-entry per event/run.
    const runKey = `${eventId}:${forceRescore}`;
    if (scoringStartedRef.current === runKey) return;
    scoringStartedRef.current = runKey;

    if (recordings.length === 0) {
      // No recordings exist at all — persist no_match so we never spin again.
      void persistResolution('no_match', null);
      return;
    }

    let cancelled = false;
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      setRanking(false);
      // Time-out: persist no_match so subsequent loads are instant.
      void persistResolution('no_match', null);
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
          void persistResolution('no_match', null);
          return;
        }
        const top = (data?.ranked || [])[0];
        if (!top) {
          void persistResolution('no_match', null);
          return;
        }
        const rec = recordings.find(r => r.id === top.external_id);
        if (!rec) {
          void persistResolution('no_match', null);
          return;
        }
        const score = top.score || 0;
        setRanked({ recording: rec, score, reasons: top.reasons || [] });
        const status: ResolutionStatus =
          score >= 0.90 ? 'auto_linked' : score >= 0.65 ? 'suggested' : 'no_match';
        void persistResolution(status, {
          externalId: rec.id,
          score,
          title: rec.title || null,
          url: rec.url || null,
        });
      } catch (err) {
        console.warn('claap inline rank threw', err);
        void persistResolution('no_match', null);
      } finally {
        if (!cancelled) {
          clearTimeout(timeoutId);
          setRanking(false);
        }
      }
    })();
    return () => { cancelled = true; clearTimeout(timeoutId); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, recordings, needsScoring, forceRescore]);

  const band: 'linked' | 'auto' | 'review' | 'none' = useMemo(() => {
    if (existing) return 'linked';
    if (userRejected) return 'none';
    // Prefer persisted resolution when present.
    if (resolution) {
      switch (resolution.resolution_status) {
        case 'manual_linked':
        case 'manually_changed':
          return 'linked';
        case 'auto_linked':
          return 'auto';
        case 'suggested':
          return 'review';
        case 'no_match':
          return 'none';
      }
    }
    if (!ranked) return 'none';
    if (ranked.score >= 0.90) return 'auto';
    if (ranked.score >= 0.65) return 'review';
    return 'none';
  }, [existing, ranked, userRejected, resolution]);

  const handleApprove = async () => {
    const externalId = ranked?.recording.id ?? resolution?.top_candidate_external_id ?? null;
    if (!externalId) return;
    const fromRanked = !!ranked;
    const recording = ranked?.recording ?? null;
    setApproving(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        'claap-rank-recordings-for-meeting',
        {
          body: {
            action: 'confirm',
            event_id: eventId,
            recording: recording ?? { id: externalId, title: resolution?.top_candidate_title, url: resolution?.top_candidate_url },
            confidence: ranked?.score ?? resolution?.top_candidate_score ?? null,
            reasons: ranked?.reasons ?? [],
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
      if (company?.id && fromRanked && recording) {
        try {
          await (supabase.from('event_claap_recordings') as any).upsert({
            org_company_id: company.id,
            event_id: eventId,
            recording_id: recording.id,
            recording_title: recording.title || null,
            recording_url: recording.url || null,
            thumbnail_url: recording.thumbnailUrl || null,
            duration_seconds: recording.durationSeconds || null,
            recorder_name: recording.recorder?.name || null,
            recorder_email: recording.recorder?.email || null,
            recorded_at: recording.createdAt || null,
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
            feedback: { source: 'inline_meeting_action', confidence: ranked?.score ?? resolution?.top_candidate_score ?? null, reasons: ranked?.reasons ?? [] },
          });
        } catch (err) {
          console.warn('claap_mapping_reviews insert failed', err);
        }
      }
      // Lock in as manual_linked so future loads skip the scorer.
      await persistResolution('manual_linked', {
        externalId,
        score: ranked?.score ?? resolution?.top_candidate_score ?? null,
        title: recording?.title ?? resolution?.top_candidate_title ?? null,
        url: recording?.url ?? resolution?.top_candidate_url ?? null,
      });
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

  const handleFindAgain = () => {
    setUserRejected(false);
    setRanked(null);
    setForceRescore((n) => n + 1);
    setDidFetch(false);
  };

  // Render variants ---------------------------------------------------------
  if (band === 'none') {
    const isComputing = computing && !resolution; // never show spinner once we have a persisted decision
    return (
      <Button
        size="sm"
        variant="outline"
        className="h-8 justify-start gap-2 text-xs col-span-2 border-primary/30 bg-primary/[0.06] hover:bg-primary/[0.12] text-white"
        onClick={isComputing ? undefined : onOpenPicker}
      >
        <Video className="h-3.5 w-3.5 text-primary" />
        {isComputing ? 'Checking for Claap recording…' : 'Link Claap Recording'}
        {isComputing && <Loader2 className="h-3 w-3 animate-spin ml-1" />}
        {!isComputing && resolution && (
          <span
            role="button"
            tabIndex={0}
            className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-white"
            onClick={(e) => { e.stopPropagation(); handleFindAgain(); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); handleFindAgain(); } }}
          >
            <RefreshCw className="h-3 w-3" /> Find again
          </span>
        )}
      </Button>
    );
  }

  const title = existing
    ? (existing.recording_title || 'Linked recording')
    : (ranked?.recording.title || resolution?.top_candidate_title || 'Suggested recording');
  const url = existing
    ? existing.recording_url
    : (ranked?.recording.url || resolution?.top_candidate_url || null);
  const effectiveScore = ranked?.score ?? resolution?.top_candidate_score ?? null;
  const scorePct = effectiveScore != null ? Math.round((effectiveScore || 0) * 100) : null;

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
          Auto-matched{scorePct != null ? ` ${scorePct}%` : ''}
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-amber-500/40 text-amber-300 bg-amber-500/10">
        Suggested{scorePct != null ? ` ${scorePct}%` : ''}
      </Badge>
    );
  })();

  const labelPrefix = band === 'review' ? 'Suggested: ' : '';

  return (
    <div
      className={cn(
        'col-span-2 rounded-md border px-2.5 py-1.5 flex items-center gap-2',
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
          'flex items-center gap-1.5 min-w-0 flex-1 text-xs text-white hover:underline',
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
}