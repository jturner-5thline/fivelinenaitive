/**
 * useMeetingHolds — convenience client around the `meeting-holds` edge
 * function + a query for the user's active holds (used both by the
 * Scheduler card UI and by the slot-selection collision check so two
 * parallel drafts can't propose the same time).
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface MeetingHoldRow {
  id: string;
  hold_group_id: string;
  slot_start_at: string;
  slot_end_at: string;
  google_event_id: string | null;
  state: 'held' | 'confirmed' | 'released' | 'expired';
  expires_at: string;
  deal_id: string | null;
  email_message_id: string | null;
}

export function useActiveMeetingHolds() {
  return useQuery<MeetingHoldRow[]>({
    queryKey: ['active-meeting-holds'],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meeting_holds')
        .select('id, hold_group_id, slot_start_at, slot_end_at, google_event_id, state, expires_at, deal_id, email_message_id')
        .in('state', ['held', 'confirmed'])
        .gte('slot_end_at', new Date().toISOString())
        .order('slot_start_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as MeetingHoldRow[];
    },
  });
}

export interface CreateHoldArgs {
  slots: Array<{ start: string; end: string }>;
  title: string;
  description?: string;
  attendees?: Array<{ email: string; name?: string }>;
  timezone?: string;
  deal_id?: string | null;
  email_message_id?: string | null;
  org_company_id?: string | null;
  expires_at?: string;
}

export async function createMeetingHolds(args: CreateHoldArgs) {
  const { data, error } = await supabase.functions.invoke('meeting-holds', {
    body: { action: 'create', ...args },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as { hold_group_id: string; holds: MeetingHoldRow[] };
}

export async function releaseMeetingHoldGroup(hold_group_id: string) {
  const { data, error } = await supabase.functions.invoke('meeting-holds', {
    body: { action: 'release', hold_group_id },
  });
  if (error) throw error;
  return data;
}

export async function confirmMeetingHold(hold_id: string, final_title?: string) {
  const { data, error } = await supabase.functions.invoke('meeting-holds', {
    body: { action: 'confirm', hold_id, final_title },
  });
  if (error) throw error;
  return data;
}

export function useInvalidateHolds() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['active-meeting-holds'] });
}