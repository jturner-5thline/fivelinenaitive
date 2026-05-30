import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { asStringArray, type MeetingClaapContextValue, type MeetingClaapDebugInfo } from '@/types/claap';

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

export function useMeetingClaapContext(input: UseMeetingClaapContextInput): MeetingClaapContextValue & { refetch: () => Promise<unknown> } {
  const { company } = useCompany();
  let eventId: string | null = null;
  let eventTitle: string | null = null;
  let eventStart: string | null = null;
  let organizerEmail: string | null = null;

  if (typeof input === 'string') {
    eventId = input;
  } else if (input) {
    eventId = input.eventId ?? null;
    eventTitle = input.eventTitle ?? null;
    eventStart = input.eventStart ?? null;
    organizerEmail = input.organizerEmail ?? null;
  }

  const query = useQuery<MeetingClaapQueryData | null>({
    queryKey: ['meeting-claap-context', eventId, company?.id, eventTitle, eventStart, organizerEmail],
    enabled: !!eventId && !!company?.id,
    staleTime: 60_000,
    queryFn: async () => {
      try {
        const { data, error } = await supabase.rpc('get_event_claap_prefill_context', {
          p_event_id: eventId!,
        });
        if (error) throw error;

        const payload = (data ?? null) as Record<string, unknown> | null;
        if (!payload) return null;

        const recordingPayload = payload.recording as Record<string, unknown> | null;
        const debugPayload = payload.debug as Record<string, unknown> | null;
        const debug: MeetingClaapDebugInfo = {
          querySql: typeof debugPayload?.query_sql === 'string' ? debugPayload.query_sql : PREFILL_QUERY_SQL,
          eventLinkRecordingId: typeof debugPayload?.event_link_recording_id === 'string' ? debugPayload.event_link_recording_id : null,
          meetingMatchId: typeof debugPayload?.meeting_match_id === 'string' ? debugPayload.meeting_match_id : null,
          recordingExternalId: typeof debugPayload?.recording_external_id === 'string' ? debugPayload.recording_external_id : null,
          recordingRowId: typeof debugPayload?.recording_row_id === 'string' ? debugPayload.recording_row_id : null,
          hookSource: typeof payload.source === 'string' ? payload.source : 'none',
        };

        return {
          recording: recordingPayload ? {
            id: typeof recordingPayload.id === 'string' ? recordingPayload.id : (eventId ?? ''),
            rowId: typeof recordingPayload.row_id === 'string' ? recordingPayload.row_id : null,
            meetingRowId: typeof recordingPayload.meetingRowId === 'string' ? recordingPayload.meetingRowId : null,
            title: typeof recordingPayload.title === 'string' ? recordingPayload.title : null,
            url: typeof recordingPayload.url === 'string' ? recordingPayload.url : null,
            linkedNote: typeof recordingPayload.linkedNote === 'string' ? recordingPayload.linkedNote : null,
          } : null,
          summary: typeof payload.summary === 'string' ? payload.summary : null,
          actionItems: asStringArray((payload.actionItems ?? null) as never),
          keyTakeaways: asStringArray((payload.keyTakeaways ?? null) as never),
          source: payload.source === 'claap' || payload.source === 'synthesized' ? payload.source : 'none',
          transcriptAvailable: Boolean(payload.transcriptAvailable),
          debug,
          fetching: false,
        };
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