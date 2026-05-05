import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';

/**
 * Hardcoded "Projects" portfolio used by the Weekly Rundown Ops & Projects
 * page. Source URL:
 * https://app.asana.com/0/portfolio/1211488283335033/1211488267032869
 */
export const OPS_PROJECTS_PORTFOLIO_GID = '1211488283335033';

export interface AsanaPortfolioMilestone {
  id: string;            // task gid
  title: string;
  projectGid: string | null;
  projectName: string;
  dueDate: string;       // ISO YYYY-MM-DD (best available)
  completed: boolean;
  status: 'On Track' | 'At Risk' | 'Overdue';
  url: string | null;
  assignee: string | null;
}

interface AsanaMilestoneApi {
  gid: string;
  name?: string;
  completed?: boolean;
  due_on?: string | null;
  due_at?: string | null;
  permalink_url?: string | null;
  resource_subtype?: string;
  assignee?: { name?: string } | null;
  project_gid?: string;
  project_name?: string;
}

function deriveStatus(due: Date, now: Date): AsanaPortfolioMilestone['status'] {
  if (due < now) return 'Overdue';
  const days = (due.getTime() - now.getTime()) / 86_400_000;
  if (days <= 7) return 'At Risk';
  return 'On Track';
}

/**
 * Fetch upcoming milestone tasks across all projects in the configured
 * Asana portfolio. Returns ONLY incomplete milestones, sorted by due date.
 */
export function useAsanaPortfolioMilestones(portfolioGid: string = OPS_PROJECTS_PORTFOLIO_GID) {
  const { company } = useCompany();
  const companyId = company?.id ?? null;
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryKey = ['asana-portfolio-milestones', companyId, portfolioGid];

  const query = useQuery({
    queryKey,
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async ({ meta }): Promise<AsanaPortfolioMilestone[]> => {
      const { data: integration, error: intErr } = await supabase
        .from('integrations')
        .select('id')
        .eq('type', 'asana')
        .eq('status', 'connected')
        .eq('company_id', companyId)
        .limit(1)
        .maybeSingle();
      if (intErr) throw intErr;
      if (!integration) return [];

      const { data, error } = await supabase.functions.invoke('asana-proxy', {
        body: {
          action: 'portfolio_milestones',
          integration_id: integration.id,
          portfolio_gid: portfolioGid,
          force_refresh: (meta as { forceRefresh?: boolean } | undefined)?.forceRefresh === true,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to load portfolio milestones');

      const now = new Date();
      const milestones = (data.milestones as AsanaMilestoneApi[]) || [];
      return milestones
        .filter(m => !m.completed)
        .map(m => {
          const dueRaw = m.due_on || (m.due_at ? m.due_at.slice(0, 10) : null);
          if (!dueRaw) return null;
          const due = new Date(dueRaw + 'T00:00:00');
          return {
            id: m.gid,
            title: m.name || '(Untitled milestone)',
            projectGid: m.project_gid || null,
            projectName: m.project_name || '—',
            dueDate: dueRaw,
            completed: false,
            status: deriveStatus(due, now),
            url: m.permalink_url || null,
            assignee: m.assignee?.name || null,
          } as AsanaPortfolioMilestone;
        })
        .filter((m): m is AsanaPortfolioMilestone => m !== null)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    },
  });

  const forceRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await queryClient.fetchQuery({
        queryKey,
        meta: { forceRefresh: true },
        queryFn: query.refetch as never, // overridden below
      } as never).catch(() => undefined);
      // Simpler & reliable: call refetch with meta override via invalidate then refetch.
      await queryClient.invalidateQueries({ queryKey });
      await query.refetch();
    } finally {
      setIsRefreshing(false);
    }
  }, [queryClient, query, queryKey]);

  return { ...query, forceRefresh, isRefreshing };
}
