import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export function useClaapSuggestions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch suggestions grouped by meeting
  const { data: suggestions, isLoading } = useQuery({
    queryKey: ['claap-suggestions'],
    queryFn: async () => {
      const { data } = await (supabase
        .from('claap_match_suggestions')
        .select('id, meeting_id, deal_id, confidence, reason, suggestion_source, rank, status')
        .eq('status', 'pending')
        .order('rank', { ascending: true }) as any);

      if (!data?.length) return {};

      // Fetch deal names
      const dealIds = [...new Set(data.filter((s: any) => s.deal_id).map((s: any) => s.deal_id))] as string[];
      let dealNames: Record<string, string> = {};
      if (dealIds.length > 0) {
        const { data: deals } = await supabase
          .from('deals')
          .select('id, company')
          .in('id', dealIds);
        if (deals) dealNames = Object.fromEntries(deals.map(d => [d.id, d.company]));
      }

      // Group by meeting_id
      const grouped: Record<string, any[]> = {};
      for (const s of data) {
        if (!grouped[s.meeting_id]) grouped[s.meeting_id] = [];
        grouped[s.meeting_id].push({
          ...s,
          deal_name: s.deal_id ? dealNames[s.deal_id] || null : null,
        });
      }
      return grouped;
    },
    enabled: !!user,
  });

  // Generate suggestions
  const generateSuggestions = useMutation({
    mutationFn: async (arg?: string[] | { allUnmatched?: boolean; meetingIds?: string[] }) => {
      const meetingIds = Array.isArray(arg) ? arg : arg?.meetingIds;
      const allUnmatched = !Array.isArray(arg) ? !!arg?.allUnmatched : false;
      const { data: member } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', user!.id)
        .maybeSingle();

      if (!member?.company_id) throw new Error('No company');

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      // For "all unmatched" we batch through pages so the function stays under timeout.
      let totalProcessed = 0;
      let totalSuggestions = 0;
      let totalReview = 0;
      const pages = allUnmatched ? 20 : 1;
      for (let i = 0; i < pages; i++) {
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/claap-suggest-matches`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              company_id: member.company_id,
              meeting_ids: meetingIds,
              all_unmatched: allUnmatched,
              batch_size: allUnmatched ? 50 : undefined,
            }),
          }
        );
        const r = await response.json();
        if (r.error) throw new Error(r.error);
        totalProcessed += r.processed || 0;
        totalSuggestions += r.suggestions || 0;
        totalReview += r.promoted_to_review || 0;
        if (!allUnmatched || (r.processed || 0) === 0) break;
      }
      return { processed: totalProcessed, suggestions: totalSuggestions, promoted_to_review: totalReview };
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['claap-suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['claap-all-calls'] });
      toast.success('Suggestions generated', {
        description: `${result.suggestions || 0} suggestions across ${result.processed || 0} calls; ${result.promoted_to_review || 0} routed to Review`,
      });
    },
    onError: (err: any) => toast.error('Failed to generate suggestions', { description: err.message }),
  });

  return {
    suggestions: suggestions || {},
    isLoading,
    generateSuggestions,
  };
}
