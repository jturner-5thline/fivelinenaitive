import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import {
  asStringArray,
  asSynthesizedContent,
  type ClaapMeetingRow,
  type ClaapRecordingRow,
  type MeetingClaapDebugInfo,
  type MeetingClaapContextValue,
  type MeetingSynthesizedNoteRow,
} from '@/types/claap';

/**
 * For a given calendar event id, returns the linked Claap recording and (if any)
 * its parsed AI summary / next-steps / decisions / transcript. Used by the
 * Daily Rundown inline action items (Follow-up, Tasks, Schedule next) to
 * decide whether they can be pre-filled with intelligence.
 *
 * Read-only, RLS-scoped. Silently returns null on any failure so the calling
 * action falls back to its legacy CTA — no toasts, no spinners stuck.
 */
type MeetingClaapQueryData = Omit<MeetingClaapContextValue, 'isLoading' | 'error'>;

type UseMeetingClaapContextInput =
  | string
  | null
  | undefined
  | {
      eventId: string | null | undefined;
      eventTitle?: string | null;
      eventStart?: string | null;
      organizerEmail?: string | null;
    };

const PREFILL_QUERY_SQL = "claap_meetings(company_id scoped, scored by title/organizer/time) -> claap_recording_links(entity_type='meeting', link_role='primary_meeting') -> claap_recordings(summary, action_items, key_takeaways, recording_url); fallback direct match: claap_recordings scoped by title/organizer/time; synthesized fallback: meeting_synthesized_notes(meeting_id)";

function normalizeMeetingTitle(value: string | null | undefined) {
  return (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleScore(a: string | null | undefined, b: string | null | undefined) {
  const left = normalizeMeetingTitle(a);
  const right = normalizeMeetingTitle(b);
  if (!left || !right) return 0;
  if (left === right) return 100;
  if (left.includes(right) || right.includes(left)) return 85;
  const leftTokens = new Set(left.split(' ').filter((token) => token.length > 2));
  const rightTokens = right.split(' ').filter((token) => token.length > 2);
  if (leftTokens.size === 0 || rightTokens.length === 0) return 0;
  const overlap = rightTokens.filter((token) => leftTokens.has(token)).length;
  return Math.round((overlap / Math.max(leftTokens.size, rightTokens.length)) * 70);
}

function minutesApart(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const left = new Date(a).getTime();
  const right = new Date(b).getTime();
  if (Number.isNaN(left) || Number.isNaN(right)) return Number.POSITIVE_INFINITY;
  return Math.abs(left - right) / 60000;
}

function pickBestMatch<T extends { title?: string | null; organizer_email?: string | null; started_at?: string | null }>(
  rows: T[],
  input: { eventTitle?: string | null; organizerEmail?: string | null; eventStart?: string | null },
) {
  const wantedTitle = input.eventTitle || null;
  const wantedOrganizer = (input.organizerEmail || '').trim().toLowerCase();
  return rows
    .map((row) => {
      const score =
        titleScore(row.title, wantedTitle) +
        ((wantedOrganizer && (row.organizer_email || '').trim().toLowerCase() === wantedOrganizer) ? 30 : 0) +
        Math.max(0, 30 - Math.min(minutesApart(row.started_at || null, input.eventStart || null), 180) / 6);
      return { row, score };
    })
    .sort((a, b) => b.score - a.score)[0]?.row ?? null;
}

export function useMeetingClaapContext(input: UseMeetingClaapContextInput): MeetingClaapContextValue & { refetch: () => Promise<unknown> } {
  const { company } = useCompany();
  const eventId = typeof input === 'string' || !input ? input : input.eventId;
  const eventTitle = typeof input === 'string' || !input ? null : input.eventTitle ?? null;
  const eventStart = typeof input === 'string' || !input ? null : input.eventStart ?? null;
  const organizerEmail = typeof input === 'string' || !input ? null : input.organizerEmail ?? null;

  const query = useQuery<MeetingClaapQueryData | null>({
    queryKey: ['meeting-claap-context', eventId, company?.id, eventTitle, eventStart, organizerEmail],
    enabled: !!eventId && !!company?.id,
    staleTime: 60_000,
    queryFn: async () => {
      try {
        const eventWindowStart = eventStart ? new Date(new Date(eventStart).getTime() - 24 * 60 * 60 * 1000).toISOString() : null;
        const eventWindowEnd = eventStart ? new Date(new Date(eventStart).getTime() + 24 * 60 * 60 * 1000).toISOString() : null;

        let meeting: (ClaapMeetingRow & {
          title?: string | null;
          organizer_email?: string | null;
          started_at?: string | null;
          transcript?: string | null;
          recording_url?: string | null;
        }) | null = null;

        if (eventWindowStart && eventWindowEnd) {
          const { data: meetingRows } = await supabase
            .from('claap_meetings')
            .select('id, claap_id, ai_summary, next_steps, key_decisions, transcript, title, organizer_email, started_at, recording_url')
            .eq('company_id', company!.id)
            .gte('started_at', eventWindowStart)
            .lte('started_at', eventWindowEnd)
            .limit(25);
          meeting = pickBestMatch(meetingRows ?? [], { eventTitle, organizerEmail, eventStart }) as typeof meeting;
        }

        let recording: (ClaapRecordingRow & {
          id?: string | null;
          recording_url?: string | null;
          transcript_available?: boolean | null;
          title?: string | null;
          organizer_email?: string | null;
          started_at?: string | null;
        }) | null = null;
        let linkedNote: string | null = null;

        if (meeting?.id) {
          const { data: linkRows } = await supabase
            .from('claap_recording_links')
            .select('id, recording_id, confidence, link_role, created_at')
            .eq('entity_type', 'meeting')
            .eq('entity_id', meeting.id)
            .eq('link_role', 'primary_meeting')
            .order('confidence', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(1);
          const primaryLink = (linkRows ?? [])[0];

          if (primaryLink?.recording_id) {
            const { data: recordingData } = await supabase
              .from('claap_recordings')
              .select('id, external_id, summary, action_items, key_takeaways, synthesized_note, transcript_available, recording_url, title, organizer_email, started_at')
              .eq('id', primaryLink.recording_id)
              .maybeSingle();
            recording = (recordingData ?? null) as typeof recording;
          }
        }

        if (!recording && eventWindowStart && eventWindowEnd) {
          const { data: recordingRows } = await supabase
            .from('claap_recordings')
            .select('id, external_id, summary, action_items, key_takeaways, synthesized_note, transcript_available, recording_url, title, organizer_email, started_at')
            .eq('org_company_id', company!.id)
            .gte('started_at', eventWindowStart)
            .lte('started_at', eventWindowEnd)
            .limit(25);
          recording = pickBestMatch(recordingRows ?? [], { eventTitle, organizerEmail, eventStart }) as typeof recording;
        }

        if (!recording && meeting?.claap_id) {
          const { data: recordingData } = await supabase
            .from('claap_recordings')
            .select('id, external_id, summary, action_items, key_takeaways, synthesized_note, transcript_available, recording_url, title, organizer_email, started_at')
            .eq('org_company_id', company!.id)
            .eq('external_id', meeting.claap_id)
            .maybeSingle();
          recording = (recordingData ?? null) as typeof recording;
        }

        const { data: eventLinkData } = await supabase
          .from('event_claap_recordings')
          .select('notes')
          .eq('org_company_id', company!.id)
          .eq('event_id', eventId!)
          .order('linked_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        linkedNote = eventLinkData?.notes || null;

        const { data: synthRowData } = meeting?.id
          ? await supabase
              .from('meeting_synthesized_notes')
              .select('meeting_id, content, model, updated_at')
              .eq('meeting_id', meeting.id)
              .maybeSingle()
          : { data: null };
        const synthRow = (synthRowData ?? null) as MeetingSynthesizedNoteRow | null;

        const recordingSummary = typeof recording?.summary === 'string' ? recording.summary.trim() : '';
        const recordingSteps = asStringArray(recording?.action_items);
        const recordingTakeaways = asStringArray(recording?.key_takeaways);
        const recordingSynth = asSynthesizedContent(recording?.synthesized_note ?? null);
        const meetingSynth = asSynthesizedContent(synthRow?.content ?? null);
        const synthesized = meetingSynth ?? recordingSynth;
        const synthesizedSummary = synthesized?.summary_md ?? '';
        const synthesizedSteps = synthesized?.action_items ?? [];
        const synthesizedTakeaways = synthesized?.key_takeaways ?? [];
        const meetingSteps = asStringArray(meeting?.next_steps ?? null);
        const meetingTakeaways = asStringArray(meeting?.key_decisions ?? null);

        const hasReal = !!recordingSummary || recordingSteps.length > 0 || recordingTakeaways.length > 0;
        const hasSynth = !!synthesizedSummary || synthesizedSteps.length > 0 || synthesizedTakeaways.length > 0;
        const summary = hasReal
          ? (recordingSummary || meeting?.ai_summary || null)
          : hasSynth
            ? (synthesizedSummary || meeting?.ai_summary || null)
            : null;
        const actionItems = hasReal ? recordingSteps : hasSynth ? synthesizedSteps : meetingSteps;
        const keyTakeaways = hasReal ? recordingTakeaways : hasSynth ? synthesizedTakeaways : meetingTakeaways;
        const debug: MeetingClaapDebugInfo = {
          querySql: PREFILL_QUERY_SQL,
          meetingMatchId: meeting?.id ?? null,
          eventLinkRecordingId: null,
          recordingExternalId: recording?.external_id ?? null,
          recordingRowId: recording?.id ?? null,
          hookSource: hasReal ? 'claap' : hasSynth ? 'synthesized' : 'none',
        };

        const ctx: MeetingClaapQueryData = {
          recording: {
            id: recording?.external_id || meeting?.claap_id || eventId!,
            rowId: recording?.id ?? null,
            meetingRowId: meeting?.id || null,
            title: recording?.title || meeting?.title || null,
            url: recording?.recording_url || meeting?.recording_url || null,
            linkedNote: linkedNote || null,
          },
          summary,
          actionItems,
          keyTakeaways,
          source: hasReal ? 'claap' : hasSynth ? 'synthesized' : 'none',
          transcriptAvailable: Boolean(recording?.transcript_available || meeting?.transcript),
          debug,
          fetching: false,
        };
        return ctx;
      } catch (err) {
        console.warn('useMeetingClaapContext failed', err);
        return null;
      }
    },
  });

  const synthesisAttemptedRef = useRef<string | null>(null);

  useEffect(() => {
    const recording = query.data?.recording;
    if (!eventId || !company?.id || !recording) return;
    if (query.isLoading || query.isFetching) return;
    if (query.data?.source !== 'none') return;

    const attemptKey = recording.meetingRowId || recording.id;
    if (!attemptKey || synthesisAttemptedRef.current === attemptKey) return;
    synthesisAttemptedRef.current = attemptKey;

    void supabase.functions.invoke('synthesize-meeting-note', {
      body: {
        event_id: eventId,
        meeting_id: recording.meetingRowId,
        recording_id: recording.id,
      },
    }).then(({ error }) => {
      if (error) {
        console.warn('useMeetingClaapContext synthesis invoke failed', error);
        return;
      }
      void query.refetch();
    }).catch((err) => {
      console.warn('useMeetingClaapContext synthesis threw', err);
    });
  }, [company?.id, eventId, query.data, query.isFetching, query.isLoading, query.refetch]);

  return {
    recording: query.data?.recording ?? null,
    summary: query.data?.summary ?? null,
    actionItems: query.data?.actionItems ?? [],
    keyTakeaways: query.data?.keyTakeaways ?? [],
    source: query.data?.source ?? 'none',
    transcriptAvailable: query.data?.transcriptAvailable ?? false,
    debug: query.data?.debug ?? null,
    isLoading: query.isLoading || query.isFetching,
    fetching: query.isFetching,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch,
  };
}