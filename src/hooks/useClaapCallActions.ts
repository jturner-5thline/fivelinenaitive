import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

export function useClaapCallActions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['claap-matched-calls'] });
    queryClient.invalidateQueries({ queryKey: ['claap-all-calls'] });
    queryClient.invalidateQueries({ queryKey: ['claap-skipped-calls'] });
    queryClient.invalidateQueries({ queryKey: ['deal-activity-details'] });
    queryClient.invalidateQueries({ queryKey: ['claap-calls'] });
  };

  const linkToDeal = useMutation({
    mutationFn: async ({ meetingId, dealId, dealName }: { meetingId: string; dealId: string; dealName: string }) => {
      // Get current state for audit
      const { data: meeting } = await (supabase
        .from('claap_meetings')
        .select('deal_id, match_status, claap_id, title, recording_url, duration_seconds, organizer_email')
        .eq('id', meetingId)
        .single() as any);

      // Update meeting
      const { error } = await (supabase
        .from('claap_meetings')
        .update({
          deal_id: dealId,
          match_status: 'manually_linked',
          match_method: 'manual',
          manually_locked: true,
          matched_at: new Date().toISOString(),
          matched_by: user?.id,
          match_reason: `Manually linked by user to "${dealName}"`,
          status: 'routed',
        } as any)
        .eq('id', meetingId) as any);

      if (error) throw error;

      // Audit trail
      await (supabase.from('claap_match_audit').insert({
        meeting_id: meetingId,
        action: 'manual_link',
        previous_deal_id: meeting?.deal_id || null,
        new_deal_id: dealId,
        previous_status: meeting?.match_status || 'unmatched',
        new_status: 'manually_linked',
        match_method: 'manual',
        match_reason: `Manually linked to "${dealName}"`,
        performed_by: user?.id,
      }) as any);

      // Also create deal_claap_recordings entry
      await (supabase.from('deal_claap_recordings').upsert({
        deal_id: dealId,
        recording_id: meeting?.claap_id || meetingId,
        recording_title: meeting?.title,
        recording_url: meeting?.recording_url,
        duration_seconds: meeting?.duration_seconds,
        recorder_email: meeting?.organizer_email,
        linked_by: user?.id,
        notes: 'Manually linked by user',
      }, { onConflict: 'deal_id,recording_id' }) as any);
    },
    onSuccess: () => {
      invalidateAll();
      toast.success('Call linked to deal');
    },
    onError: (err: any) => toast.error('Failed to link call', { description: err.message }),
  });

  const changeDeal = useMutation({
    mutationFn: async ({ meetingId, newDealId, newDealName }: { meetingId: string; newDealId: string; newDealName: string }) => {
      const { data: meeting } = await (supabase
        .from('claap_meetings')
        .select('deal_id, match_status, claap_id')
        .eq('id', meetingId)
        .single() as any);

      const previousDealId = meeting?.deal_id;

      // Remove old deal_claap_recordings
      if (previousDealId && meeting?.claap_id) {
        await (supabase.from('deal_claap_recordings')
          .delete()
          .eq('deal_id', previousDealId)
          .eq('recording_id', meeting.claap_id) as any);
      }

      const { error } = await (supabase
        .from('claap_meetings')
        .update({
          deal_id: newDealId,
          match_status: 'manually_linked',
          match_method: 'manual',
          manually_locked: true,
          matched_at: new Date().toISOString(),
          matched_by: user?.id,
          match_reason: `Manually reassigned to "${newDealName}"`,
        } as any)
        .eq('id', meetingId) as any);

      if (error) throw error;

      await (supabase.from('claap_match_audit').insert({
        meeting_id: meetingId,
        action: 'manual_reassign',
        previous_deal_id: previousDealId,
        new_deal_id: newDealId,
        previous_status: meeting?.match_status || 'matched',
        new_status: 'manually_linked',
        match_method: 'manual',
        match_reason: `Reassigned to "${newDealName}"`,
        performed_by: user?.id,
      }) as any);
    },
    onSuccess: () => {
      invalidateAll();
      toast.success('Call reassigned to new deal');
    },
    onError: (err: any) => toast.error('Failed to reassign call', { description: err.message }),
  });

  const unlinkFromDeal = useMutation({
    mutationFn: async ({ meetingId }: { meetingId: string }) => {
      const { data: meeting } = await (supabase
        .from('claap_meetings')
        .select('deal_id, match_status, claap_id')
        .eq('id', meetingId)
        .single() as any);

      if (meeting?.deal_id && meeting?.claap_id) {
        await (supabase.from('deal_claap_recordings')
          .delete()
          .eq('deal_id', meeting.deal_id)
          .eq('recording_id', meeting.claap_id) as any);
      }

      const { error } = await (supabase
        .from('claap_meetings')
        .update({
          deal_id: null,
          match_status: 'unmatched',
          match_method: 'manual',
          manually_locked: false,
          matched_at: new Date().toISOString(),
          matched_by: user?.id,
          match_reason: 'Manually unlinked by user',
        } as any)
        .eq('id', meetingId) as any);

      if (error) throw error;

      await (supabase.from('claap_match_audit').insert({
        meeting_id: meetingId,
        action: 'manual_unlink',
        previous_deal_id: meeting?.deal_id,
        new_deal_id: null,
        previous_status: meeting?.match_status || 'matched',
        new_status: 'unmatched',
        match_method: 'manual',
        match_reason: 'Manually unlinked',
        performed_by: user?.id,
      }) as any);
    },
    onSuccess: () => {
      invalidateAll();
      toast.success('Call unlinked from deal');
    },
    onError: (err: any) => toast.error('Failed to unlink call', { description: err.message }),
  });

  const setIgnored = useMutation({
    mutationFn: async ({ meetingId, ignored }: { meetingId: string; ignored: boolean }) => {
      const { data: meeting } = await (supabase
        .from('claap_meetings')
        .select('match_status')
        .eq('id', meetingId)
        .single() as any);

      const { error } = await (supabase
        .from('claap_meetings')
        .update({
          match_status: ignored ? 'ignored' : 'unmatched',
          manually_locked: ignored,
          matched_at: new Date().toISOString(),
          matched_by: user?.id,
        } as any)
        .eq('id', meetingId) as any);

      if (error) throw error;

      await (supabase.from('claap_match_audit').insert({
        meeting_id: meetingId,
        action: ignored ? 'ignored' : 'unignored',
        previous_status: meeting?.match_status,
        new_status: ignored ? 'ignored' : 'unmatched',
        match_method: 'manual',
        performed_by: user?.id,
      }) as any);
    },
    onSuccess: (_, { ignored }) => {
      invalidateAll();
      toast.success(ignored ? 'Call ignored' : 'Call restored for matching');
    },
    onError: (err: any) => toast.error('Failed to update call', { description: err.message }),
  });

  return {
    linkToDeal,
    changeDeal,
    unlinkFromDeal,
    setIgnored,
    isLoading: linkToDeal.isPending || changeDeal.isPending || unlinkFromDeal.isPending || setIgnored.isPending,
  };
}
