import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type KnowledgeTestQuestionResult = {
  question: string;
  expected_doc_id: string;
  expected_doc_title: string;
  expected_snippet: string;
  rubric: string;
  answer: string;
  retrieved: Array<{ chunk_id: string; doc_id: string; title: string; similarity: number }>;
  grade: {
    pass: boolean;
    retrieval_hit: boolean;
    answer_hit: boolean;
    reason: string;
  };
};

export type KnowledgeTestRun = {
  id: string;
  created_at: string;
  score: number;
  total: number;
  tag_filter: string[];
  results: KnowledgeTestQuestionResult[];
};

export function useAdminAgentKnowledgeTest(companyId: string | null | undefined) {
  const qc = useQueryClient();
  const [isRunning, setIsRunning] = useState(false);
  const [latestRun, setLatestRun] = useState<KnowledgeTestRun | null>(null);

  const historyQ = useQuery<KnowledgeTestRun[]>({
    queryKey: ['admin-agent-knowledge-test-runs', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_agent_knowledge_test_runs')
        .select('id, created_at, score, total, tag_filter, results')
        .eq('company_id', companyId!)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        id: r.id,
        created_at: r.created_at,
        score: r.score ?? 0,
        total: r.total ?? 0,
        tag_filter: Array.isArray(r.tag_filter) ? r.tag_filter : [],
        results: Array.isArray(r.results) ? (r.results as KnowledgeTestQuestionResult[]) : [],
      }));
    },
  });

  const run = useCallback(async () => {
    if (!companyId) return null;
    setIsRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-agent-knowledge-test', {
        body: { company_id: companyId, agent_key: 'admin_agent' },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const runPayload = (data as any)?.run;
      if (!runPayload) throw new Error('No run payload returned.');
      const next: KnowledgeTestRun = {
        id: runPayload.id,
        created_at: runPayload.created_at,
        score: runPayload.score ?? 0,
        total: runPayload.total ?? 0,
        tag_filter: Array.isArray(runPayload.tag_filter) ? runPayload.tag_filter : [],
        results: Array.isArray(runPayload.results) ? runPayload.results : [],
      };
      setLatestRun(next);
      await qc.invalidateQueries({ queryKey: ['admin-agent-knowledge-test-runs', companyId] });
      toast.success(`Knowledge test complete — ${next.score}/${next.total} correct`);
      return next;
    } catch (e: any) {
      toast.error(e?.message || 'Knowledge test failed.');
      return null;
    } finally {
      setIsRunning(false);
    }
  }, [companyId, qc]);

  return {
    run,
    isRunning,
    latestRun,
    setLatestRun,
    history: historyQ.data ?? [],
    historyLoading: historyQ.isLoading,
  };
}