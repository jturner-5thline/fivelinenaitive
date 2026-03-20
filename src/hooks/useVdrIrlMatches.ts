import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface IrlDocumentMatch {
  id: string;
  irl_request_id: string;
  document_id: string;
  deal_id: string;
  match_type: 'full' | 'partial' | 'mislabeled';
  confidence_score: number;
  explanation: string | null;
  flagged_mislabel: boolean;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  // joined
  filename?: string;
}

export function useVdrIrlMatches(dealId: string) {
  const [matches, setMatches] = useState<Map<string, IrlDocumentMatch[]>>(new Map());
  const [isMatching, setIsMatching] = useState(false);
  const [matchProgress, setMatchProgress] = useState({ total: 0, processed: 0 });

  const fetchMatches = useCallback(async () => {
    if (!dealId) return;
    const { data, error } = await (supabase as any)
      .from('vdr_irl_document_matches')
      .select('*, vdr_documents(filename)')
      .eq('deal_id', dealId);

    if (error) {
      console.error('Error fetching IRL matches:', error);
      return;
    }

    const grouped = new Map<string, IrlDocumentMatch[]>();
    for (const row of data || []) {
      const match: IrlDocumentMatch = {
        ...row,
        filename: row.vdr_documents?.filename || 'Unknown',
      };
      const existing = grouped.get(row.irl_request_id) || [];
      existing.push(match);
      grouped.set(row.irl_request_id, existing);
    }
    setMatches(grouped);
  }, [dealId]);

  const runMatching = useCallback(async (requestIds?: string[]) => {
    if (!dealId) return;
    setIsMatching(true);

    try {
      // If matching specific requests, do them individually for progress
      if (requestIds && requestIds.length > 0) {
        setMatchProgress({ total: requestIds.length, processed: 0 });
        for (let i = 0; i < requestIds.length; i++) {
          const { data, error } = await supabase.functions.invoke('vdr-irl-match', {
            body: { deal_id: dealId, irl_request_id: requestIds[i] },
          });
          if (error) console.error('Match error:', error);
          setMatchProgress({ total: requestIds.length, processed: i + 1 });
        }
      } else {
        // Match all at once
        setMatchProgress({ total: 1, processed: 0 });
        const { data, error } = await supabase.functions.invoke('vdr-irl-match', {
          body: { deal_id: dealId },
        });
        if (error) throw new Error(error.message);
        if (data?.error) {
          toast.error(data.error);
          return;
        }
        setMatchProgress({ total: 1, processed: 1 });
        toast.success(`Matched ${data.total_matches} document(s) across ${data.processed} request(s)`);
      }

      await fetchMatches();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Matching failed';
      toast.error(msg);
    } finally {
      setIsMatching(false);
      setMatchProgress({ total: 0, processed: 0 });
    }
  }, [dealId, fetchMatches]);

  const updateMatchStatus = useCallback(async (matchId: string, status: 'accepted' | 'rejected') => {
    const { error } = await (supabase as any)
      .from('vdr_irl_document_matches')
      .update({ status })
      .eq('id', matchId);

    if (error) {
      toast.error('Failed to update match status');
      return;
    }
    await fetchMatches();
  }, [fetchMatches]);

  const getMatchesForRequest = useCallback((requestId: string) => {
    return matches.get(requestId) || [];
  }, [matches]);

  const getMatchCount = useCallback((requestId: string) => {
    return (matches.get(requestId) || []).length;
  }, [matches]);

  return {
    matches,
    isMatching,
    matchProgress,
    fetchMatches,
    runMatching,
    updateMatchStatus,
    getMatchesForRequest,
    getMatchCount,
  };
}
