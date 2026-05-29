import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';

export interface MeetingClaapContext {
  recordingId: string;
  recordingTitle: string | null;
  recordingUrl: string | null;
  summary: string | null;
  nextSteps: string[];
  keyDecisions: string[];
  transcript: string | null;
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
          .select('ai_summary, next_steps, key_decisions, transcript')
          .eq('claap_id', link.recording_id)
          .maybeSingle();

        return {
          recordingId: link.recording_id,
          recordingTitle: link.recording_title || null,
          recordingUrl: link.recording_url || null,
          summary: meeting?.ai_summary || null,
          nextSteps: Array.isArray(meeting?.next_steps) ? meeting!.next_steps.filter(Boolean) : [],
          keyDecisions: Array.isArray(meeting?.key_decisions) ? meeting!.key_decisions.filter(Boolean) : [],
          transcript: meeting?.transcript || null,
        };
      } catch (err) {
        console.warn('useMeetingClaapContext failed', err);
        return null;
      }
    },
  });
}