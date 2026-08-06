import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Video, Check, Pencil, X, ExternalLink, RefreshCw, Sparkles } from 'lucide-react';
import { LinkedCallActionsDialog } from './LinkedCallActionsDialog';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useClaapRecordings, type ClaapRecording } from '@/hooks/useClaapRecordings';
import { useMeetingClaapContext } from '@/hooks/useMeetingClaapContext';
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

// Extract the most distinctive token from a meeting title so we can query
// the Claap live-list API with a hint that widens the recording window
// beyond the latest 100 by recency. Prefer the longest capitalized/word
// token that isn't a generic joiner ("meeting", "call", "5th line", …).
const HINT_STOPWORDS = new Set([
  'meeting','call','sync','review','5th','line','vs','and','with','w','x',
  'the','a','an','of','for','to','from','intro','follow','followup','follow-up',
  'weekly','biweekly','monthly','quarterly','update','check','checkin','check-in',
  'zoom','google','meet','teams',
]);
function deriveSearchHint(title: string | null | undefined): string | null {
  if (!title) return null;
  const cleaned = String(title)
    .replace(/[<>|/\\\-_:,;.!?()\[\]{}"'`~@#$%^*+=&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  const tokens = cleaned.split(' ').filter(t => t.length >= 3 && !HINT_STOPWORDS.has(t.toLowerCase()));
  if (tokens.length === 0) return null;
  // Prefer the longest token (usually a proper noun / surname).
  tokens.sort((a, b) => b.length - a.length);
  return tokens[0];
}

function getClaapSearchWindow(start?: string | null, end?: string | null): { from?: string; to?: string } {
  const anchor = start ? Date.parse(start) : NaN;
  if (!Number.isFinite(anchor)) return {};
  const endMs = end && Number.isFinite(Date.parse(end)) ? Date.parse(end) : anchor;
  return {
    from: new Date(anchor - 36 * 60 * 60 * 1000).toISOString(),
    to: new Date(endMs + 36 * 60 * 60 * 1000).toISOString(),
  };
}

interface ExistingLinkRow {
  id: string;
  recording_id: string;
  recording_title: string | null;
  recording_url: string | null;
}

interface CachedMatchRow {
  id: string;
  status: 'suggested' | 'approved' | 'rejected' | 'none';
  locked: boolean;
  recording_id: string | null;
  recording_title: string | null;
  recording_url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  recorder_name: string | null;
  recorder_email: string | null;
  recorded_at: string | null;
  score: number | null;
  reasons: any;
  generated_at: string;
}

export function MeetingClaapInlineAction(props: Props) {
  const { eventId, eventTitle, eventStart, eventEnd, organizerEmail, attendees, onOpenPicker } = props;
  const { company } = useCompany();
  const qc = useQueryClient();
  const { fetchRecordings, loading: loadingRecordings } = useClaapRecordings();
  const [ranked, setRanked] = useState<RankedTop | null>(null);
  const [ranking, setRanking] = useState(false);
  const [approving, setApproving] = useState(false);
  const [autoApproved, setAutoApproved] = useState(false);
  const [userRejected, setUserRejected] = useState(false);
  const [locallyLinked, setLocallyLinked] = useState(false);
  const [source, setSource] = useState<'stored' | 'fresh' | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [rankPending, setRankPending] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);

  // Client-side gate: once we auto-attempt a search for this event and it
  // completes (whether or not a match was found and whether or not the DB
  // cache write succeeded), don't auto-retry. The user must click
  // "Find again" to run another attempt. Prevents wasted Claap API calls
  // for meetings that will never have a recording (e.g. internal syncs).
  const AUTO_ATTEMPT_STORAGE_KEY = 'claap:auto-attempted-events';
  const readAutoAttempted = (): Set<string> => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(AUTO_ATTEMPT_STORAGE_KEY) : null;
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []);
    } catch {
      return new Set();
    }
  };
  const markAutoAttempted = (id: string) => {
    try {
      const set = readAutoAttempted();
      set.add(id);
      // Cap to last 500 to prevent unbounded growth.
      const trimmed = Array.from(set).slice(-500);
      window.localStorage.setItem(AUTO_ATTEMPT_STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      /* ignore quota / storage errors */
    }
  };
  const clearAutoAttempted = (id: string) => {
    try {
      const set = readAutoAttempted();
      if (set.delete(id)) {
        window.localStorage.setItem(AUTO_ATTEMPT_STORAGE_KEY, JSON.stringify(Array.from(set)));
      }
    } catch {
      /* ignore */
    }
  };

  // Existing manual link for this event
  const { data: existing, isLoading: existingLoading, isFetching: existingFetching } = useQuery<ExistingLinkRow | null>({
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

  // Canonical linked recording via claap_recording_links (auto-confirm path).
  // If a recording is already linked here, treat this event as "linked" even
  // if the org-scoped event_claap_recordings mirror hasn't been populated yet.
  const canonical = useMeetingClaapContext({
    eventId,
    eventTitle,
    eventStart,
    organizerEmail,
  });
  const canonicalLinked = !!canonical.recording && canonical.source === 'claap';
  const canonicalLoading = canonical.isLoading;

  // -------------------------------------------------------------------------
  // PERSISTED SUGGESTION CACHE
  // -------------------------------------------------------------------------
  // Read persisted suggestion FIRST. Opening an item must be a pure read —
  // we only call the Claap ranking API when no stored row exists OR the
  // user explicitly triggers "Find again".
  const { data: cached, isLoading: cachedLoading, isFetching: cachedFetching } = useQuery<CachedMatchRow | null>({
    queryKey: ['event-claap-match-cache', eventId, company?.id],
    enabled: !!company?.id && !!eventId,
    // Session cache — never refetch on mount/focus. Explicit refresh only.
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      try {
        const { data, error } = await (supabase
          .from('event_claap_match_cache') as any)
          .select('id,status,locked,recording_id,recording_title,recording_url,thumbnail_url,duration_seconds,recorder_name,recorder_email,recorded_at,score,reasons,generated_at')
          .eq('org_company_id', company!.id)
          .eq('event_id', eventId)
          .maybeSingle();
        if (error) {
          console.warn('claap match cache read failed', error);
          return null;
        }
        return (data as CachedMatchRow | null) || null;
      } catch (err) {
        console.warn('claap match cache read threw', err);
        return null;
      }
    },
  });

  // Hydrate the local `ranked` state from cache exactly once per event —
  // this is a read, not a compute.
  useEffect(() => {
    if (!cached || !cached.recording_id) return;
    if (cached.status === 'rejected') { setUserRejected(true); setSource('stored'); return; }
    setRanked({
      recording: {
        id: cached.recording_id,
        title: cached.recording_title || '',
        url: cached.recording_url || '',
        thumbnailUrl: cached.thumbnail_url || undefined,
        durationSeconds: cached.duration_seconds || undefined,
        recorder: cached.recorder_name || cached.recorder_email ? {
          name: cached.recorder_name || undefined,
          email: cached.recorder_email || undefined,
        } : undefined,
        createdAt: cached.recorded_at || undefined,
      } as unknown as ClaapRecording,
      score: Number(cached.score || 0),
      reasons: Array.isArray(cached.reasons) ? cached.reasons : [],
    });
    setSource('stored');
  }, [cached]);

  const persistSuggestion = useCallback(async (rec: ClaapRecording, score: number, reasons: any[], status: 'suggested' | 'approved' | 'rejected', locked: boolean) => {
    if (!company?.id) return;
    try {
      await (supabase.from('event_claap_match_cache') as any).upsert({
        org_company_id: company.id,
        event_id: eventId,
        status,
        locked,
        recording_id: rec.id,
        recording_title: rec.title || null,
        recording_url: rec.url || null,
        thumbnail_url: (rec as any).thumbnailUrl || null,
        duration_seconds: (rec as any).durationSeconds || null,
        recorder_name: (rec as any).recorder?.name || null,
        recorder_email: (rec as any).recorder?.email || null,
        recorded_at: (rec as any).createdAt || null,
        score,
        reasons,
        generated_at: new Date().toISOString(),
      }, { onConflict: 'org_company_id,event_id' });
      qc.invalidateQueries({ queryKey: ['event-claap-match-cache', eventId, company.id] });
    } catch (err) {
      console.warn('claap match cache upsert failed', err);
    }
  }, [company?.id, eventId, qc]);

  const persistNoMatch = useCallback(async () => {
    if (!company?.id) return;
    try {
      await (supabase.from('event_claap_match_cache') as any).upsert({
        org_company_id: company.id,
        event_id: eventId,
        status: 'none',
        locked: false,
        recording_id: null,
        recording_title: null,
        recording_url: null,
        reasons: [],
        generated_at: new Date().toISOString(),
      }, { onConflict: 'org_company_id,event_id' });
      qc.invalidateQueries({ queryKey: ['event-claap-match-cache', eventId, company.id] });
    } catch (err) {
      console.warn('claap no-match cache upsert failed', err);
    }
  }, [company?.id, eventId, qc]);

  const meetingContext = useCallback(() => ({
    title: eventTitle || null,
    start_time: eventStart || null,
    end_time: eventEnd || null,
    organizer_email: organizerEmail || null,
    attendees: (attendees || []).map(a => ({
      email: a.email || null,
      name: a.displayName || null,
      self: !!a.self,
    })),
  }), [eventTitle, eventStart, eventEnd, organizerEmail, attendees]);

  const rankRecordings = useCallback(async (list: ClaapRecording[]): Promise<RankedTop | null> => {
    if (!list.length) return null;
    const { data, error } = await supabase.functions.invoke(
      'claap-rank-recordings-for-meeting',
      { body: { action: 'rank', event_id: eventId, recordings: list, meeting_context: meetingContext() } },
    );
    if (error) {
      console.warn('claap inline rank error', error);
      return null;
    }
    const top = (data?.ranked || [])[0];
    if (!top || Number(top.score || 0) < 0.65) return null;
    const rec = list.find(r => r.id === top.external_id);
    if (!rec) return null;
    return {
      recording: rec,
      score: Number(top.score || 0),
      reasons: top.reasons || [],
    };
  }, [eventId, meetingContext]);

  // Explicit generator — ONLY called when there's no stored suggestion OR
  // the user clicks "Find again". It scores the local mirror first (fast),
  // then falls back to the live Claap list only if the mirror has no plausible
  // match. This keeps the button responsive while preserving the auto-fetch
  // behavior for recordings that have not mirrored yet.
  const requestGenerate = useCallback(async () => {
    if (!eventId) return;
    setRanking(true);
    setSource('fresh');
    setRankPending(true);
    try {
      // Derive a targeted search hint from the event title so Claap surfaces
      // older matches whose titles reference attendees (e.g. "Syed").
      const hint = deriveSearchHint(eventTitle) || undefined;
      const searchWindow = getClaapSearchWindow(eventStart, eventEnd);
      const fastList = await fetchRecordings(undefined, { live: false, ...searchWindow, limit: 80 });
      let top = await rankRecordings(fastList || []);

      if (!top) {
        const liveList = await fetchRecordings(hint, { live: true, ...searchWindow, limit: 80 });
        top = await rankRecordings(liveList || []);
      }

      if (!top) {
        await persistNoMatch();
        return;
      }

      setRanked(top);
      await persistSuggestion(top.recording, top.score, top.reasons, 'suggested', false);
    } catch (err) {
      console.warn('claap generate rank threw', err);
    } finally {
      setRankPending(false);
      setRanking(false);
      if (eventId) markAutoAttempted(eventId);
    }
  }, [eventId, eventTitle, eventStart, eventEnd, fetchRecordings, rankRecordings, persistNoMatch, persistSuggestion]);

  // Trigger requestGenerate ONLY when: no stored cache, not already linked,
  // and either first mount or an explicit refresh tick. Additionally,
  // skip if this event has already been auto-attempted in a prior session
  // (localStorage-tracked) — the user must click "Find again" to retry.
  const hasStored = !!cached; // any row (including 'none') means we've asked before
  useEffect(() => {
    if (!eventId) return;
    if (existingLoading || existingFetching || canonicalLoading || cachedLoading || cachedFetching) return;
    if (existing || canonicalLinked) return;      // already linked upstream
    if (hasStored && refreshTick === 0) return;   // stored answer — read only
    if (ranking || rankPending) return;
    // NOTE: auto-fetch always runs when there is no stored suggestion.
    // The `hasStored` check above already prevents repeat fetches once a
    // result (including 'none') is cached in event_claap_match_cache, so
    // we don't need an extra client-side localStorage gate here.
    void requestGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, existing, existingLoading, existingFetching, canonicalLinked, canonicalLoading, cachedLoading, cachedFetching, hasStored, refreshTick]);

  const handleRefresh = useCallback(() => {
    setUserRejected(false);
    setAutoApproved(false);
    setRanked(null);
    if (eventId) clearAutoAttempted(eventId);
    setRefreshTick((n) => n + 1);
  }, [eventId]);

  const band: 'linked' | 'auto' | 'review' | 'none' = useMemo(() => {
    if (existing || locallyLinked || canonicalLinked) return 'linked';
    if (userRejected || !ranked) return 'none';
    if (ranked.score >= 0.90) return 'auto';
    if (ranked.score >= 0.65) return 'review';
    return 'none';
  }, [existing, locallyLinked, canonicalLinked, ranked, userRejected]);

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
      // Pull transcript / notes for the newly-linked recording so the meeting
      // surfaces Claap notes immediately (matching the auto-match path).
      try {
        await supabase.functions.invoke('claap-sync-recording-content', {
          body: {
            recording_id: canonicalId || undefined,
            external_id: ranked.recording.id,
          },
        });
      } catch (err) {
        console.warn('claap-sync-recording-content failed', err);
      }
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
      setLocallyLinked(true);
      // Lock the cache row so it never re-suggests automatically.
      await persistSuggestion(ranked.recording, ranked.score, ranked.reasons, 'approved', true);
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
    setLocallyLinked(false);
    setRanked(null);
    setUserRejected(false);
    setSource(null);
    setRefreshTick(0);
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
    : canonicalLinked
      ? (canonical.recording?.title || 'Linked recording')
      : (ranked?.recording.title || 'Suggested recording');
  const url = existing
    ? existing.recording_url
    : canonicalLinked
      ? (canonical.recording?.url || null)
      : (ranked?.recording.url || null);
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
  const handleReject = useCallback(async () => {
    setUserRejected(true);
    if (ranked) {
      await persistSuggestion(ranked.recording, ranked.score, ranked.reasons, 'rejected', true);
    }
  }, [ranked, persistSuggestion]);

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
      {band === 'linked' ? (
        <Check className="h-3.5 w-3.5 text-emerald-300 shrink-0" />
      ) : (
        <Video className="h-3.5 w-3.5 text-primary shrink-0" />
      )}
      <span className={cn('truncate', band === 'linked' && 'text-emerald-200')}>
        {band === 'linked'
          ? 'Matched'
          : ranking || loadingRecordings
            ? 'Checking Claap…'
            : 'Link Claap Recording'}
      </span>
      {band !== 'linked' && (ranking || loadingRecordings) && (
        <Loader2 className="h-3 w-3 animate-spin shrink-0" />
      )}
    </Button>
  );

  // Once a recording is officially linked (manual approve or post-refresh
  // hydration from event_claap_recordings), collapse back to the plain button
  // cell — no banner. The button itself reflects the linked state via color.
  if (band === 'none' || band === 'linked') return buttonCell;

  // Suggestion / linked detail bar — rendered via portal below the 4-button
  // action row so it can use full width and never clips the equal-width cell.
  const bar = (
    <div
      className={cn(
        'w-full min-w-0 rounded-md border px-2.5 py-1.5 flex flex-wrap items-center gap-2',
        band === 'auto' && 'border-emerald-500/30 bg-emerald-500/[0.05]',
        band === 'review' && 'border-amber-500/30 bg-amber-500/[0.05]',
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
      {source && (band === 'auto' || band === 'review') && (
        <Badge
          variant="outline"
          className={cn(
            'h-5 px-1.5 text-[10px]',
            source === 'stored'
              ? 'border-slate-500/40 text-slate-300 bg-slate-500/10'
              : 'border-blue-500/40 text-blue-300 bg-blue-500/10',
          )}
          title={source === 'stored' ? 'Loaded from saved suggestion' : 'Freshly generated'}
        >
          {source === 'stored' ? 'Stored match' : 'Fresh suggestion'}
        </Badge>
      )}
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
              onClick={handleReject}
            >
              <X className="h-3 w-3" /> Reject
            </Button>
          </>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[10px] gap-1 text-white/80 hover:text-white hover:bg-white/[0.08]"
          disabled={ranking}
          onClick={handleRefresh}
          title="Re-run Claap match"
        >
          <RefreshCw className={cn('h-3 w-3', ranking && 'animate-spin')} /> Find again
        </Button>
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

  return (
    <>
      {buttonCell}
      <ClaapBarPortal eventId={eventId}>{bar}</ClaapBarPortal>
    </>
  );
}

function ClaapBarPortal({ eventId, children }: { eventId: string; children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    let raf = 0;
    const find = () => {
      const el = document.getElementById(`claap-suggest-slot-${eventId}`);
      if (el) setSlot(el);
      else raf = requestAnimationFrame(find);
    };
    find();
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [eventId]);
  if (!slot) return null;
  return createPortal(children, slot);
}