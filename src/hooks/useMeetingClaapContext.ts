import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';

export interface MeetingClaapContext {
  recordingId: string;
  meetingRowId: string | null;
  recordingTitle: string | null;
  recordingUrl: string | null;
  linkedNote: string | null;
  summary: string | null;
  nextSteps: string[];
  keyDecisions: string[];
  transcript: string | null;
  transcriptAvailable: boolean;
  hasContent: boolean;
  source: 'claap' | 'synthesized' | null;
}

/**
 * For a given calendar event id, returns the linked Claap recording and (if any)
 * its parsed AI summary / next-steps / decisions / transcript. Used by the
 * Daily Rundown inline action items (Follow-up, Tasks, Schedule next) to
 * decide whether they can be pre-filled with intelligence.
 *
 * Read-only, RLS-scoped. Silently returns null on any failure so the calling
 * action falls back to its legacy CTA — no toasts, no spinners stuck.
 */
export function useMeetingClaapContext(eventId: string | null | undefined) {
  const { company } = useCompany();
  return useQuery<MeetingClaapContext | null>({
    queryKey: ['meeting-claap-context', eventId, company?.id],
    enabled: !!eventId && !!company?.id,
    staleTime: 60_000,
    queryFn: async () => {
      try {
        const { data: link } = await (supabase
          .from('event_claap_recordings') as any)
          .select('recording_id, recording_title, recording_url, notes')
          .eq('org_company_id', company!.id)
          .eq('event_id', eventId!)
          .order('linked_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!link?.recording_id) return null;

        const { data: recording } = await (supabase
          .from('claap_recordings') as any)
          .select('summary, action_items, key_takeaways, synthesized_note, transcript_available')
          .eq('org_company_id', company!.id)
          .eq('external_id', link.recording_id)
          .maybeSingle();

        const { data: meeting } = await (supabase
          .from('claap_meetings') as any)
          .select('id, ai_summary, next_steps, key_decisions, transcript')
          .eq('claap_id', link.recording_id)
          .maybeSingle();

        const recordingSummary = typeof recording?.summary === 'string' ? recording.summary.trim() : '';
        const recordingSteps = Array.isArray(recording?.action_items) ? recording.action_items.filter(Boolean) : [];
        const recordingTakeaways = Array.isArray(recording?.key_takeaways) ? recording.key_takeaways.filter(Boolean) : [];
        const synthesized = recording?.synthesized_note || null;
        const synthesizedSummary = typeof synthesized?.summary_md === 'string' ? synthesized.summary_md.trim() : '';
        const synthesizedSteps = Array.isArray(synthesized?.action_items) ? synthesized.action_items.filter(Boolean) : [];
        const synthesizedTakeaways = Array.isArray(synthesized?.key_takeaways) ? synthesized.key_takeaways.filter(Boolean) : [];

        const hasReal = !!recordingSummary || recordingSteps.length > 0 || recordingTakeaways.length > 0;
        const hasSynth = !!synthesizedSummary || synthesizedSteps.length > 0 || synthesizedTakeaways.length > 0;
        const summary = hasReal
          ? (recordingSummary || meeting?.ai_summary || null)
          : (synthesizedSummary || meeting?.ai_summary || null);
        const nextSteps = hasReal
          ? recordingSteps
          : (hasSynth ? synthesizedSteps : (Array.isArray(meeting?.next_steps) ? meeting.next_steps.filter(Boolean) : []));
        const keyDecisions = hasReal
          ? recordingTakeaways
          : (hasSynth ? synthesizedTakeaways : (Array.isArray(meeting?.key_decisions) ? meeting.key_decisions.filter(Boolean) : []));
        const transcript = meeting?.transcript || null;
        const ctx = {
          recordingId: link.recording_id,
          meetingRowId: meeting?.id || null,
          recordingTitle: link.recording_title || null,
          recordingUrl: link.recording_url || null,
          linkedNote: link.notes || null,
          summary,
          nextSteps,
          keyDecisions,
          transcript,
          transcriptAvailable: !!transcript || !!recording?.transcript_available,
          hasContent: !!summary || nextSteps.length > 0 || keyDecisions.length > 0,
          source: hasReal ? 'claap' : hasSynth ? 'synthesized' : null,
        };
        console.debug('[useMeetingClaapContext]', {
          eventId,
          recordingId: ctx.recordingId,
          meetingRowId: ctx.meetingRowId,
          transcriptLen: transcript?.length ?? 0,
          summaryLen: summary?.length ?? 0,
          nextStepsLen: nextSteps.length,
          keyDecisionsLen: keyDecisions.length,
          source: ctx.source,
          linkedNoteLen: ctx.linkedNote?.length ?? 0,
        });
        return ctx;
      } catch (err) {
        console.warn('useMeetingClaapContext failed', err);
        return null;
      }
    },
  });
}