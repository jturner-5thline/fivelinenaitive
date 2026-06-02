import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { asStringArray, stripClaapTimestamps, type MeetingClaapContextValue, type MeetingClaapDebugInfo } from '@/types/claap';

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
          p_event_title: eventTitle ?? null,
          p_event_start: eventStart ?? null,
          p_organizer_email: organizerEmail ?? null,
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

        const rawSource = payload.source === 'claap' ? 'claap' : 'none';
        // Synthesis is disabled: ignore any non-'claap' source (e.g. 'synthesized')
        // and only surface content that comes from a real Claap recording.
        const isReal = rawSource === 'claap';
        return {
          recording: recordingPayload ? {
            id: typeof recordingPayload.id === 'string' ? recordingPayload.id : (eventId ?? ''),
            rowId: typeof recordingPayload.row_id === 'string' ? recordingPayload.row_id : null,
            meetingRowId: typeof recordingPayload.meetingRowId === 'string' ? recordingPayload.meetingRowId : null,
            title: typeof recordingPayload.title === 'string' ? recordingPayload.title : null,
            url: typeof recordingPayload.url === 'string' ? recordingPayload.url : null,
            linkedNote: typeof recordingPayload.linkedNote === 'string' ? recordingPayload.linkedNote : null,
          } : null,
          summary: isReal && typeof payload.summary === 'string' ? stripClaapTimestamps(payload.summary) : null,
          actionItems: isReal ? asStringArray((payload.actionItems ?? null) as never) : [],
          keyTakeaways: isReal ? asStringArray((payload.keyTakeaways ?? null) as never) : [],
          source: rawSource,
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

  // Realtime: when a claap_recording_links row is inserted for the matched meeting,
  // re-fetch immediately so the textarea picks up the freshly-linked real summary.
  useEffect(() => {
    const meetingRowId = query.data?.recording?.meetingRowId ?? null;
    if (!meetingRowId) return;
    const channel = supabase
      .channel(`claap-links-${meetingRowId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'claap_recording_links',
          filter: `entity_id=eq.${meetingRowId}`,
        },
        () => {
          void query.refetch();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [query.data?.recording?.meetingRowId, query.refetch]);

  // Realtime: when the linked claap_recordings row gets its summary/action_items
  // populated by the background backfill (or when new task suggestions land),
  // re-fetch immediately so the card flips from "Syncing Claap…" to the real
  // summary without a page reload.
  useEffect(() => {
    const recordingRowId = query.data?.recording?.rowId ?? null;
    const meetingRowId = query.data?.recording?.meetingRowId ?? null;
    if (!recordingRowId && !meetingRowId) return;
    const channel = supabase.channel(`claap-sync-${recordingRowId ?? meetingRowId}`);
    if (recordingRowId) {
      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'claap_recordings',
          filter: `id=eq.${recordingRowId}`,
        },
        () => { void query.refetch(); },
      );
    }
    if (meetingRowId) {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'meeting_task_suggestions',
          filter: `meeting_id=eq.${meetingRowId}`,
        },
        () => { void query.refetch(); },
      );
    }
    channel.subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [query.data?.recording?.rowId, query.data?.recording?.meetingRowId, query.refetch]);

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