import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';

export type AgentActivityKind = 'run' | 'action' | 'learn' | 'audit';

export interface AgentActivityEvent {
  id: string;
  kind: AgentActivityKind;
  timestamp: string;
  title: string;
  subtitle?: string;
  status?: 'success' | 'failed' | 'pending' | 'info';
  badge?: string;
  detail?: Record<string, any>;
}

export function useAgentActivity(limit = 100) {
  const { company } = useCompany();
  const companyId = company?.id ?? null;

  return useQuery({
    queryKey: ['agent-activity', companyId, limit],
    enabled: !!companyId,
    queryFn: async (): Promise<AgentActivityEvent[]> => {
      const events: AgentActivityEvent[] = [];

      // 1. Agent runs (actions performed by triggered agents)
      const { data: runs } = await supabase
        .from('agent_runs')
        .select('id, status, trigger_event, created_at, duration_ms, output_content, error_message, agents(name, avatar_emoji), deals(company)')
        .order('created_at', { ascending: false })
        .limit(limit);

      runs?.forEach((r: any) => {
        events.push({
          id: `run-${r.id}`,
          kind: 'run',
          timestamp: r.created_at,
          title: `${r.agents?.name || 'Agent'} ran ${r.trigger_event || 'task'}${r.deals?.company ? ` · ${r.deals.company}` : ''}`,
          subtitle: r.output_content?.slice(0, 140) || r.error_message?.slice(0, 140),
          status: r.status === 'completed' ? 'success' : r.status === 'failed' ? 'failed' : 'pending',
          badge: 'Action',
          detail: r,
        });
      });

      // 2. Approval queue audit (Admin Agent performing/recording actions)
      const { data: audits } = await supabase
        .from('approval_queue_audit')
        .select('id, action_type, decision, execution_status, was_edited, rejection_reason, created_at, ai_action_queue!inner(title, deal_name, company_id)')
        .eq('ai_action_queue.company_id', companyId!)
        .order('created_at', { ascending: false })
        .limit(limit);

      audits?.forEach((a: any) => {
        const verb = a.was_edited ? 'edited & approved'
          : a.decision === 'approved' ? 'approved'
          : a.decision === 'rejected' ? 'rejected'
          : a.decision === 'email_sent' ? 'sent email'
          : a.decision === 'email_staged' ? 'staged email'
          : a.decision;
        events.push({
          id: `audit-${a.id}`,
          kind: 'action',
          timestamp: a.created_at,
          title: `Admin Agent ${verb}: ${a.ai_action_queue?.title || a.action_type}`,
          subtitle: a.ai_action_queue?.deal_name || a.rejection_reason || undefined,
          status: a.execution_status === 'success' ? 'success' : a.execution_status === 'failed' ? 'failed' : 'info',
          badge: 'Action',
          detail: a,
        });
      });

      // 3. Agent learned rules (learning events)
      const { data: learned } = await supabase
        .from('agent_learned_rules')
        .select('id, rule_text, status, source, occurrences, confidence, created_at, updated_at, decided_at')
        .eq('company_id', companyId!)
        .order('updated_at', { ascending: false })
        .limit(limit);

      learned?.forEach((l: any) => {
        const stamp = l.decided_at || l.updated_at || l.created_at;
        const label = l.status === 'proposed' ? 'proposed new rule'
          : l.status === 'active' ? 'rule accepted'
          : 'rule dismissed';
        events.push({
          id: `learn-${l.id}-${l.status}`,
          kind: 'learn',
          timestamp: stamp,
          title: `Admin Agent ${label}`,
          subtitle: l.rule_text,
          status: l.status === 'active' ? 'success' : l.status === 'dismissed' ? 'failed' : 'info',
          badge: 'Learning',
          detail: l,
        });
      });

      // 4. Admin agent audit runs (sweeps / portfolio updates)
      const { data: sweeps } = await supabase
        .from('admin_agent_audit_runs')
        .select('id, scope_type, total_evaluated, total_flagged, triggered_by, created_at')
        .eq('company_id', companyId!)
        .order('created_at', { ascending: false })
        .limit(limit);

      sweeps?.forEach((s: any) => {
        events.push({
          id: `sweep-${s.id}`,
          kind: 'audit',
          timestamp: s.created_at,
          title: `Admin Agent ${s.triggered_by === 'friday_sweep' ? 'Friday sweep' : `${s.scope_type} audit`} · ${s.total_flagged}/${s.total_evaluated} flagged`,
          subtitle: `Triggered by ${s.triggered_by}`,
          status: 'info',
          badge: 'Update',
          detail: s,
        });
      });

      events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return events.slice(0, limit);
    },
    staleTime: 30_000,
  });
}
