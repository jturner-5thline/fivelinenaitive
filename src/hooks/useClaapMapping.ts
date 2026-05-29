import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type ClaapEntityType = 'meeting' | 'contact' | 'company' | 'deal';
export type ClaapLinkRole =
  | 'primary_meeting' | 'attendee_contact' | 'primary_company' | 'primary_deal' | 'secondary_deal';

export interface ClaapCandidate {
  id: string;
  recording_id: string;
  entity_type: ClaapEntityType;
  entity_id: string;
  score: number;
  rank: number;
  reasons: Array<{ code: string; label: string; weight: number }>;
  evidence: Record<string, unknown>;
  run_type: 'post_call' | 'end_of_day';
  created_at: string;
}

export interface ClaapLink {
  id: string;
  recording_id: string;
  entity_type: ClaapEntityType;
  entity_id: string;
  link_role: ClaapLinkRole;
  confidence: number | null;
  source: 'auto' | 'manual' | 'eod';
  created_at: string;
}

/** Live candidates + links for a single recording. */
export function useClaapMapping(recordingId: string | null | undefined) {
  const qc = useQueryClient();

  const { data: candidates = [], isLoading: candLoading } = useQuery({
    queryKey: ['claap-mapping-candidates', recordingId],
    enabled: !!recordingId,
    queryFn: async () => {
      const { data, error } = await (supabase
        .from('claap_recording_candidates' as any)
        .select('*')
        .eq('recording_id', recordingId)
        .gte('rank', 0)
        .order('score', { ascending: false })) as any;
      if (error) throw error;
      return (data || []) as ClaapCandidate[];
    },
  });

  const { data: links = [], isLoading: linkLoading } = useQuery({
    queryKey: ['claap-mapping-links', recordingId],
    enabled: !!recordingId,
    queryFn: async () => {
      const { data, error } = await (supabase
        .from('claap_recording_links' as any)
        .select('*')
        .eq('recording_id', recordingId)) as any;
      if (error) throw error;
      return (data || []) as ClaapLink[];
    },
  });

  useEffect(() => {
    if (!recordingId) return;
    const ch = supabase
      .channel(`claap-mapping-${recordingId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'claap_recording_candidates', filter: `recording_id=eq.${recordingId}` },
        () => qc.invalidateQueries({ queryKey: ['claap-mapping-candidates', recordingId] }))
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'claap_recording_links', filter: `recording_id=eq.${recordingId}` },
        () => qc.invalidateQueries({ queryKey: ['claap-mapping-links', recordingId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [recordingId, qc]);

  const accept = useMutation({
    mutationFn: async ({ candidateId, linkRole }: { candidateId: string; linkRole: ClaapLinkRole }) => {
      const { error } = await (supabase.rpc as any)('claap_accept_suggestion', {
        p_candidate_id: candidateId, p_link_role: linkRole,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Linked');
      qc.invalidateQueries({ queryKey: ['claap-mapping-candidates', recordingId] });
      qc.invalidateQueries({ queryKey: ['claap-mapping-links', recordingId] });
    },
    onError: (e: any) => toast.error(e.message || 'Failed to accept'),
  });

  const reject = useMutation({
    mutationFn: async ({ candidateId, reason }: { candidateId: string; reason?: string }) => {
      const { error } = await (supabase.rpc as any)('claap_reject_suggestion', {
        p_candidate_id: candidateId, p_reason: reason ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Suggestion dismissed');
      qc.invalidateQueries({ queryKey: ['claap-mapping-candidates', recordingId] });
    },
  });

  const markUnrelated = useMutation({
    mutationFn: async (entityType: ClaapEntityType) => {
      const { error } = await (supabase.rpc as any)('claap_mark_unrelated', {
        p_recording_id: recordingId, p_entity_type: entityType,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Marked unrelated');
      qc.invalidateQueries({ queryKey: ['claap-mapping-candidates', recordingId] });
    },
  });

  return {
    candidates, links,
    isLoading: candLoading || linkLoading,
    accept, reject, markUnrelated,
  };
}

/** Global review queue: recordings whose status is 'review' or that have pending suggestions. */
export function useClaapReviewQueue(filters?: { entityType?: ClaapEntityType; band?: 'auto'|'review' }) {
  return useQuery({
    queryKey: ['claap-review-queue', filters],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from('claap_recordings' as any)
        .select('id,title,started_at,organizer_email,status,last_scored_at')
        .in('status', ['review','scored','new'])
        .order('started_at', { ascending: false })
        .limit(200)) as any;
      if (error) throw error;
      return (data || []) as Array<{
        id: string; title: string | null; started_at: string | null;
        organizer_email: string | null; status: string; last_scored_at: string | null;
      }>;
    },
  });
}