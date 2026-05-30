import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';

export interface MeetingClaapContext {
  recordingId: string;
  meetingRowId: string | null;
  recordingTitle: string | null;
  recordingUrl: string | null;
  summary: string | null;
  nextSteps: string[];
  keyDecisions: string[];
  transcript: string | null;
  transcriptAvailable: boolean;
  hasContent: boolean;
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
          .select('recording_id, recording_title, recording_url')
          .eq('org_company_id', company!.id)
          .eq('event_id', eventId!)
          .order('linked_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!link?.recording_id) return null;

        const { data: meeting } = await (supabase
          .from('claap_meetings') as any)
          .select('id, ai_summary, next_steps, key_decisions, transcript')
          .eq('claap_id', link.recording_id)
          .maybeSingle();

        const summary = meeting?.ai_summary || null;
        const nextSteps = Array.isArray(meeting?.next_steps) ? meeting!.next_steps.filter(Boolean) : [];
        const keyDecisions = Array.isArray(meeting?.key_decisions) ? meeting!.key_decisions.filter(Boolean) : [];
        const transcript = meeting?.transcript || null;
        const ctx = {
          recordingId: link.recording_id,
          meetingRowId: meeting?.id || null,
          recordingTitle: link.recording_title || null,
          recordingUrl: link.recording_url || null,
          summary,
          nextSteps,
          keyDecisions,
          transcript,
          transcriptAvailable: !!transcript,
          hasContent: !!summary || nextSteps.length > 0 || keyDecisions.length > 0,
        };
        console.debug('[useMeetingClaapContext]', {
          eventId,
          recordingId: ctx.recordingId,
          meetingRowId: ctx.meetingRowId,
          transcriptLen: transcript?.length ?? 0,
          summaryLen: summary?.length ?? 0,
          nextStepsLen: nextSteps.length,
          keyDecisionsLen: keyDecisions.length,
        });
        return ctx;
      } catch (err) {
        console.warn('useMeetingClaapContext failed', err);
        return null;
      }
    },
  });
}