import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Replicates the same data assembly as the `morning-followup-digest` edge
 * function (which used to email "Your follow-ups for today") so the same
 * content can render in the Daily Briefing → Pipeline & Clients tab.
 *
 * Sources:
 *  - `wf_tasks` open tasks due within the next 24h, assigned to or owned by
 *    the current user.
 *  - `scheduled_followup_actions` pending actions due within the next 24h
 *    on deals owned by the current user.
 *
 * Returns a flat list of follow-up items grouped by deal, with enough
 * context (company, stage, action label, deal id) to render a briefing
 * row with a deep link.
 */
export interface FollowupItem {
  key: string;
  /** wf_task id or scheduled_followup_actions id */
  sourceId: string;
  source: 'task' | 'scheduled';
  dealId: string | null;
  company: string;
  stage: string | null;
  title: string;
  dueAt: string | null;
}

export function useMorningFollowups(enabled: boolean) {
  const { user } = useAuth();

  return useQuery<FollowupItem[]>({
    queryKey: ['morning-followups', user?.id],
    enabled: enabled && !!user?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!user?.id) return [];

      // Same ±24h horizon as the edge function (next 24h ahead).
      const horizon = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const [tasksRes, scheduledRes] = await Promise.all([
        supabase
          .from('wf_tasks')
          .select('id, title, due_at, deal_id')
          .eq('status', 'open')
          .or(`assignee_id.eq.${user.id},workflow_owner_id.eq.${user.id}`)
          .lte('due_at', horizon)
          .limit(100),
        supabase
          .from('scheduled_followup_actions')
          .select('id, trigger_key, deal_id, scheduled_for')
          .eq('status', 'pending')
          .lte('scheduled_for', horizon)
          .limit(100),
      ]);

      const tasks = tasksRes.data ?? [];
      const scheduled = scheduledRes.data ?? [];

      const dealIds = Array.from(new Set([
        ...tasks.map(t => t.deal_id).filter(Boolean) as string[],
        ...scheduled.map(s => s.deal_id).filter(Boolean) as string[],
      ]));
      if (dealIds.length === 0) return [];

      const { data: deals } = await supabase
        .from('deals')
        .select('id, company, stage, deal_owner, manager, user_id')
        .in('id', dealIds);
      const dealMap = new Map((deals ?? []).map(d => [d.id, d]));

      const items: FollowupItem[] = [];

      for (const t of tasks) {
        const d = t.deal_id ? dealMap.get(t.deal_id) : null;
        if (!d) continue;
        items.push({
          key: `task-${t.id}`,
          sourceId: String(t.id),
          source: 'task',
          dealId: d.id,
          company: d.company ?? 'Untitled deal',
          stage: d.stage ?? null,
          title: t.title ?? 'Follow-up task',
          dueAt: t.due_at ?? null,
        });
      }

      for (const s of scheduled) {
        const d = s.deal_id ? dealMap.get(s.deal_id) : null;
        if (!d) continue;
        // Same gating as the edge function: only include if this user is the
        // deal owner/creator on the row.
        if (d.user_id !== user.id) continue;
        items.push({
          key: `sched-${s.id}`,
          sourceId: String(s.id),
          source: 'scheduled',
          dealId: d.id,
          company: d.company ?? 'Untitled deal',
          stage: d.stage ?? null,
          title: '3-day follow-up due',
          dueAt: s.scheduled_for ?? null,
        });
      }

      return items;
    },
  });
}
