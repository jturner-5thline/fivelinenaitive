import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';

// ============================================
// Types
// ============================================
export interface ClaapMeeting {
  id: string;
  claap_id: string;
  title: string | null;
  recording_url: string | null;
  transcript: string | null;
  ai_summary: string | null;
  key_decisions: string[];
  next_steps: string[];
  topics: string[];
  sentiment: string | null;
  organizer_email: string | null;
  duration_seconds: number | null;
  started_at: string | null;
  status: 'pending_review' | 'routed' | 'excluded' | 'awaiting_confirmation';
  exclusion_reason: string | null;
  transcript_missing: boolean;
  no_internal_participant: boolean;
  company_id: string | null;
  deal_id: string | null;
  call_type: string | null;
  match_source: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClaapMeetingParticipant {
  id: string;
  meeting_id: string;
  name: string | null;
  email: string | null;
  domain: string | null;
  is_internal: boolean;
  contact_id: string | null;
  resolved: boolean;
  created_at: string;
}

export interface ClaapRoutingTask {
  id: string;
  meeting_id: string;
  task_type: 'confirm_contact' | 'confirm_company' | 'create_deal' | 'disambiguate_deal';
  status: 'pending' | 'completed' | 'expired' | 'dismissed';
  assigned_to: string | null;
  prefilled_data: Record<string, any>;
  resolved_data: Record<string, any> | null;
  expires_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClaapRoutingRule {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  conditions: any[];
  condition_logic: string;
  actions: any[];
  position: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClaapIntegrationConfig {
  id: string;
  company_id: string;
  internal_domains: string[];
  min_duration_seconds: number;
  excluded_title_patterns: string[];
  fallback_admin_user_id: string | null;
  task_expiry_days: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================
// Hooks
// ============================================

export function useClaapConfig() {
  const { company } = useCompany();
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ['claap-config', company?.id],
    queryFn: async () => {
      if (!company?.id) return null;
      const { data, error } = await supabase
        .from('claap_integration_config')
        .select('*')
        .eq('company_id', company.id)
        .maybeSingle();
      if (error) throw error;
      return data as ClaapIntegrationConfig | null;
    },
    enabled: !!company?.id,
  });

  const upsertConfig = useMutation({
    mutationFn: async (updates: Partial<ClaapIntegrationConfig>) => {
      if (!company?.id) throw new Error('No company');
      const { data, error } = await supabase
        .from('claap_integration_config')
        .upsert({ company_id: company.id, ...updates }, { onConflict: 'company_id' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claap-config'] });
      toast.success('Claap configuration saved');
    },
    onError: (err: any) => toast.error(err.message || 'Failed to save configuration'),
  });

  return { config, isLoading, upsertConfig };
}

export function useClaapMeetings(filters?: { status?: string; dealId?: string }) {
  const { company } = useCompany();

  return useQuery({
    queryKey: ['claap-meetings', company?.id, filters],
    queryFn: async () => {
      if (!company?.id) return [];
      let query = supabase
        .from('claap_meetings')
        .select('*')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false });

      if (filters?.status) query = query.eq('status', filters.status as any);
      if (filters?.dealId) query = query.eq('deal_id', filters.dealId);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as ClaapMeeting[];
    },
    enabled: !!company?.id,
  });
}

export function useClaapMeetingsByDeal(dealId: string) {
  return useQuery({
    queryKey: ['claap-meetings-deal', dealId],
    queryFn: async () => {
      if (!dealId) return [];
      const { data, error } = await supabase
        .from('claap_meetings')
        .select('*')
        .eq('deal_id', dealId)
        .order('started_at', { ascending: false });
      if (error) throw error;
      return (data || []) as ClaapMeeting[];
    },
    enabled: !!dealId,
  });
}

export function useClaapMeetingParticipants(meetingId: string) {
  return useQuery({
    queryKey: ['claap-meeting-participants', meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('claap_meeting_participants')
        .select('*')
        .eq('meeting_id', meetingId);
      if (error) throw error;
      return (data || []) as ClaapMeetingParticipant[];
    },
    enabled: !!meetingId,
  });
}

export function useClaapRoutingTasks() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['claap-routing-tasks', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('claap_routing_tasks')
        .select('*')
        .eq('assigned_to', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as ClaapRoutingTask[];
    },
    enabled: !!user?.id,
  });
}

export function useClaapResolveTask() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ taskId, resolvedData }: { taskId: string; resolvedData: Record<string, any> }) => {
      // 1. Complete the routing task
      const { error } = await supabase
        .from('claap_routing_tasks')
        .update({
          status: 'completed',
          resolved_data: resolvedData,
          completed_at: new Date().toISOString(),
        })
        .eq('id', taskId);
      if (error) throw error;

      // 2. If a deal_id was resolved, link recording + update meeting
      const dealId = resolvedData?.deal_id;
      if (dealId) {
        // Get the meeting info for this task
        const { data: taskData } = await supabase
          .from('claap_routing_tasks')
          .select('meeting_id')
          .eq('id', taskId)
          .single();

        if (taskData?.meeting_id) {
          // Get meeting details
          const { data: meeting } = await supabase
            .from('claap_meetings')
            .select('claap_id, title, recording_url, duration_seconds, organizer_email')
            .eq('id', taskData.meeting_id)
            .single();

          if (meeting) {
            // Update meeting with deal_id and status
            await supabase
              .from('claap_meetings')
              .update({ deal_id: dealId, status: 'routed' } as any)
              .eq('id', taskData.meeting_id);

            // Insert into deal_claap_recordings
            await supabase
              .from('deal_claap_recordings')
              .upsert({
                deal_id: dealId,
                recording_id: meeting.claap_id,
                recording_title: meeting.title,
                recording_url: meeting.recording_url,
                thumbnail_url: null,
                duration_seconds: meeting.duration_seconds,
                recorder_name: null,
                recorder_email: meeting.organizer_email,
                linked_by: user?.id || null,
                notes: 'Auto-linked by Claap routing engine',
              } as any, { onConflict: 'deal_id,recording_id' });

            // Log activity
            await supabase
              .from('activity_logs')
              .insert({
                deal_id: dealId,
                activity_type: 'claap_recording_linked',
                description: `Claap recording linked: ${meeting.title || 'Untitled recording'}`,
                user_id: user?.id || null,
                metadata: {
                  claap_id: meeting.claap_id,
                  recording_url: meeting.recording_url,
                  source: 'routing_task_resolution',
                },
              } as any);
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claap-routing-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['claap-meetings'] });
      queryClient.invalidateQueries({ queryKey: ['deal-claap-recordings'] });
    },
  });
}

export function useClaapDismissTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from('claap_routing_tasks')
        .update({ status: 'dismissed' })
        .eq('id', taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claap-routing-tasks'] });
    },
  });
}

export function useClaapRoutingRules() {
  const { company } = useCompany();
  const queryClient = useQueryClient();

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['claap-routing-rules', company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const { data, error } = await supabase
        .from('claap_routing_rules')
        .select('*')
        .eq('company_id', company.id)
        .order('position', { ascending: true });
      if (error) throw error;
      return (data || []) as ClaapRoutingRule[];
    },
    enabled: !!company?.id,
  });

  const createRule = useMutation({
    mutationFn: async (rule: Partial<ClaapRoutingRule>) => {
      const { data, error } = await supabase
        .from('claap_routing_rules')
        .insert({ company_id: company!.id, ...rule } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claap-routing-rules'] });
      toast.success('Rule created');
    },
  });

  const updateRule = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ClaapRoutingRule> & { id: string }) => {
      const { error } = await supabase
        .from('claap_routing_rules')
        .update(updates as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claap-routing-rules'] });
    },
  });

  const deleteRule = useMutation({
    mutationFn: async (ruleId: string) => {
      const { error } = await supabase
        .from('claap_routing_rules')
        .delete()
        .eq('id', ruleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claap-routing-rules'] });
      toast.success('Rule deleted');
    },
  });

  const reorderRules = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const updates = orderedIds.map((id, index) =>
        supabase.from('claap_routing_rules').update({ position: index } as any).eq('id', id)
      );
      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claap-routing-rules'] });
    },
  });

  return { rules, isLoading, createRule, updateRule, deleteRule, reorderRules };
}

export function useClaapExcludedMeetings() {
  const { company } = useCompany();
  const queryClient = useQueryClient();

  const { data: meetings = [], isLoading } = useQuery({
    queryKey: ['claap-excluded-meetings', company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const { data, error } = await supabase
        .from('claap_meetings')
        .select('*')
        .eq('company_id', company.id)
        .eq('status', 'excluded')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as ClaapMeeting[];
    },
    enabled: !!company?.id,
  });

  const reroute = useMutation({
    mutationFn: async (meetingId: string) => {
      const { error } = await supabase
        .from('claap_meetings')
        .update({ status: 'pending_review', exclusion_reason: null } as any)
        .eq('id', meetingId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claap-excluded-meetings'] });
      queryClient.invalidateQueries({ queryKey: ['claap-meetings'] });
      toast.success('Meeting re-queued for routing');
    },
  });

  return { meetings, isLoading, reroute };
}

export function useClaapWebhookErrors() {
  return useQuery({
    queryKey: ['claap-webhook-errors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('claap_webhook_errors')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });
}

export function useClaapUpdateMeeting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<ClaapMeeting>) => {
      const { error } = await supabase
        .from('claap_meetings')
        .update(updates as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claap-meetings'] });
      queryClient.invalidateQueries({ queryKey: ['claap-meetings-deal'] });
    },
  });
}
