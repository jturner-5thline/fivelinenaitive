import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

/**
 * Powers the in-app "Today's Follow-Ups" section inside the Daily Briefing
 * (Pipeline & Clients tab). This replaces the legacy
 * "Your follow-ups for today" email which was permanently disabled
 * platform-wide on 2026-04-29.
 *
 * Same data sources the email used:
 *   - `wf_tasks` open tasks due within the next 24h, assigned to or
 *     workflow-owned by the current user.
 *   - `scheduled_followup_actions` pending 3-day actions due within the
 *     same window, on deals owned by the current user.
 *
 * Returns items already grouped by deal so the UI can render
 *   <Deal header>
 *     ↳ task
 *     ↳ task
 */
export interface FollowupItem {
  key: string;
  /** wf_task id or scheduled_followup_actions id */
  sourceId: string;
  source: 'task' | 'scheduled';
  dealId: string | null;
  title: string;
  dueAt: string | null;
  /** Primary contact name on the associated deal, if any. */
  contact?: string | null;
  /** CRM company id on the associated deal, if any. */
  companyId?: string | null;
}

export interface FollowupDealGroup {
  dealId: string;
  company: string;
  stage: string | null;
  items: FollowupItem[];
}

const QKEY = 'morning-followups-grouped';

export function useMorningFollowups(enabled: boolean) {
  const { user } = useAuth();

  return useQuery<FollowupDealGroup[]>({
    queryKey: [QKEY, user?.id],
    enabled: enabled && !!user?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!user?.id) return [];

      // Same ±24h horizon as the legacy edge function (next 24h ahead).
      const horizon = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const [tasksRes, scheduledRes] = await Promise.all([
        supabase
          .from('wf_tasks')
          .select('id, title, due_at, deal_id')
          .eq('status', 'open')
          .or(`assignee_id.eq.${user.id},workflow_owner_id.eq.${user.id}`)
          .lte('due_at', horizon)
          .limit(200),
        supabase
          .from('scheduled_followup_actions')
          .select('id, trigger_key, deal_id, scheduled_for')
          .eq('status', 'pending')
          .lte('scheduled_for', horizon)
          .limit(200),
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
        .select('id, company, stage, user_id, contact, company_id')
        .in('id', dealIds);
      const dealMap = new Map((deals ?? []).map(d => [d.id, d]));

      const groups = new Map<string, FollowupDealGroup>();
      const ensure = (id: string, company: string, stage: string | null) => {
        let g = groups.get(id);
        if (!g) {
          g = { dealId: id, company, stage, items: [] };
          groups.set(id, g);
        }
        return g;
      };

      for (const t of tasks) {
        const d = t.deal_id ? dealMap.get(t.deal_id) : null;
        if (!d) continue;
        ensure(d.id, d.company ?? 'Untitled deal', d.stage ?? null).items.push({
          key: `task-${t.id}`,
          sourceId: String(t.id),
          source: 'task',
          dealId: d.id,
          title: t.title ?? 'Follow-up task',
          dueAt: t.due_at ?? null,
          contact: (d as any).contact ?? null,
          companyId: (d as any).company_id ?? null,
        });
      }

      for (const s of scheduled) {
        const d = s.deal_id ? dealMap.get(s.deal_id) : null;
        if (!d) continue;
        // Same gating as the edge function: only include if this user is the
        // deal owner/creator on the row.
        if (d.user_id !== user.id) continue;
        ensure(d.id, d.company ?? 'Untitled deal', d.stage ?? null).items.push({
          key: `sched-${s.id}`,
          sourceId: String(s.id),
          source: 'scheduled',
          dealId: d.id,
          title: '3-day follow-up due',
          dueAt: s.scheduled_for ?? null,
          contact: (d as any).contact ?? null,
          companyId: (d as any).company_id ?? null,
        });
      }

      // Sort: deals alphabetically, items by due_at asc within each
      const list = Array.from(groups.values()).sort((a, b) =>
        a.company.localeCompare(b.company),
      );
      for (const g of list) {
        g.items.sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''));
      }
      return list;
    },
  });
}

/**
 * Quick actions for follow-up items rendered in the Daily Briefing.
 * - mark done: closes the wf_task / cancels the scheduled action
 * - snooze:    pushes due_at / scheduled_for forward by N hours (default 24)
 */
export function useFollowupActions() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [QKEY, user?.id] });
  };

  const markDone = useMutation({
    mutationFn: async (item: FollowupItem) => {
      if (item.source === 'task') {
        const { error } = await supabase
          .from('wf_tasks')
          .update({ status: 'done' } as any)
          .eq('id', item.sourceId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('scheduled_followup_actions')
          .update({ status: 'cancelled', fired_at: new Date().toISOString() } as any)
          .eq('id', item.sourceId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success('Marked done');
      invalidate();
    },
    onError: (err: any) => {
      console.error('[followups] markDone failed', err);
      toast.error('Could not mark as done');
    },
  });

  const snooze = useMutation({
    mutationFn: async ({ item, hours = 24 }: { item: FollowupItem; hours?: number }) => {
      const next = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
      if (item.source === 'task') {
        const { error } = await supabase
          .from('wf_tasks')
          .update({ due_at: next } as any)
          .eq('id', item.sourceId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('scheduled_followup_actions')
          .update({ scheduled_for: next } as any)
          .eq('id', item.sourceId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success('Snoozed 24h');
      invalidate();
    },
    onError: (err: any) => {
      console.error('[followups] snooze failed', err);
      toast.error('Could not snooze');
    },
  });

  return { markDone, snooze };
}
