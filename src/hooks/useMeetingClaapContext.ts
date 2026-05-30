import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import {
  asStringArray,
  asSynthesizedContent,
  type ClaapMeetingRow,
  type ClaapRecordingRow,
  type EventClaapRecordingRow,
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

export function useMeetingClaapContext(eventId: string | null | undefined): MeetingClaapContextValue & { refetch: () => Promise<unknown> } {
  const { company } = useCompany();
  const query = useQuery<MeetingClaapQueryData | null>({
    queryKey: ['meeting-claap-context', eventId, company?.id],
    enabled: !!eventId && !!company?.id,
    staleTime: 60_000,
    queryFn: async () => {
      try {
        const { data: linkData } = await supabase
          .from('event_claap_recordings')
          .select('recording_id, recording_title, recording_url, notes')
          .eq('org_company_id', company!.id)
          .eq('event_id', eventId!)
          .order('linked_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const link = (linkData ?? null) as EventClaapRecordingRow | null;
        if (!link?.recording_id) return null;

        const { data: recordingData } = await supabase
          .from('claap_recordings')
          .select('summary, action_items, key_takeaways, synthesized_note, transcript_available')
          .eq('org_company_id', company!.id)
          .eq('external_id', link.recording_id)
          .maybeSingle();
        const recording = (recordingData ?? null) as (ClaapRecordingRow & { transcript_available?: boolean | null }) | null;

        const { data: meetingData } = await supabase
          .from('claap_meetings')
          .select('id, ai_summary, next_steps, key_decisions, transcript')
          .eq('claap_id', link.recording_id)
          .maybeSingle();
        const meeting = (meetingData ?? null) as (ClaapMeetingRow & { transcript?: string | null }) | null;

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

        const ctx: MeetingClaapQueryData = {
          recording: {
            id: link.recording_id,
            meetingRowId: meeting?.id || null,
            title: link.recording_title || null,
            url: link.recording_url || null,
            linkedNote: link.notes || null,
          },
          summary,
          actionItems,
          keyTakeaways,
          source: hasReal ? 'claap' : hasSynth ? 'synthesized' : 'none',
        };
        return ctx;
      } catch (err) {
        console.warn('useMeetingClaapContext failed', err);
        return null;
      }
    },
  });

  return {
    recording: query.data?.recording ?? null,
    summary: query.data?.summary ?? null,
    actionItems: query.data?.actionItems ?? [],
    keyTakeaways: query.data?.keyTakeaways ?? [],
    source: query.data?.source ?? 'none',
    isLoading: query.isLoading || query.isFetching,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch,
  };
}