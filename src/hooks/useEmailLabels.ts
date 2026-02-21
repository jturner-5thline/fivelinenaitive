import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useCompany } from './useCompany';

export interface EmailLabel {
  id: string;
  company_id: string | null;
  user_id: string | null;
  name: string;
  color: string;
  description: string | null;
  is_default: boolean;
  scope: 'team' | 'user';
  position: number;
  created_at: string;
  updated_at: string;
}

export interface EmailLabelRule {
  id: string;
  label_id: string;
  field: 'sender_email' | 'sender_domain' | 'recipient_email' | 'subject' | 'body' | 'deal_name' | 'category';
  operator: 'contains' | 'equals' | 'starts_with' | 'ends_with' | 'regex';
  value: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmailThreadLabel {
  id: string;
  thread_id: string;
  label_id: string;
  applied_by: string | null;
  applied_via: 'manual' | 'rule';
  rule_id: string | null;
  is_removed: boolean;
  created_at: string;
  label?: EmailLabel;
}

export interface LabelInsert {
  name: string;
  color: string;
  description?: string;
  is_default?: boolean;
  scope: 'team' | 'user';
}

export interface RuleInsert {
  label_id: string;
  field: EmailLabelRule['field'];
  operator: EmailLabelRule['operator'];
  value: string;
}

export const LABEL_FIELD_OPTIONS = [
  { value: 'sender_email', label: 'Sender email' },
  { value: 'sender_domain', label: 'Sender domain' },
  { value: 'recipient_email', label: 'Recipient email' },
  { value: 'subject', label: 'Subject line' },
  { value: 'body', label: 'Email body' },
  { value: 'deal_name', label: 'Deal name' },
  { value: 'category', label: 'Category' },
] as const;

export const LABEL_OPERATOR_OPTIONS = [
  { value: 'contains', label: 'contains' },
  { value: 'equals', label: 'equals' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'ends_with', label: 'ends with' },
] as const;

export const DEFAULT_LABEL_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f59e0b', '#10b981', '#06b6d4', '#3b82f6',
  '#64748b', '#84cc16',
];

export function useEmailLabels() {
  const queryClient = useQueryClient();
  const { company } = useCompany();
  const labelsKey = ['email-labels'];
  const rulesKey = ['email-label-rules'];

  const { data: labels = [], isLoading: labelsLoading } = useQuery({
    queryKey: labelsKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_labels')
        .select('*')
        .order('position', { ascending: true });
      if (error) throw error;
      return data as EmailLabel[];
    },
  });

  const { data: rules = [], isLoading: rulesLoading } = useQuery({
    queryKey: rulesKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_label_rules')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as EmailLabelRule[];
    },
  });

  const teamLabels = labels.filter(l => l.scope === 'team');
  const userLabels = labels.filter(l => l.scope === 'user');

  const createLabel = useMutation({
    mutationFn: async (label: LabelInsert) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('email_labels')
        .insert({
          name: label.name,
          color: label.color,
          description: label.description || null,
          is_default: label.is_default || false,
          scope: label.scope,
          user_id: label.scope === 'user' ? user.id : null,
          company_id: label.scope === 'team' ? (company?.id || null) : null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: labelsKey });
      toast.success('Label created');
    },
    onError: () => toast.error('Failed to create label'),
  });

  const updateLabel = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<EmailLabel> & { id: string }) => {
      const { error } = await supabase.from('email_labels').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: labelsKey });
      toast.success('Label updated');
    },
    onError: () => toast.error('Failed to update label'),
  });

  const deleteLabel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('email_labels').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: labelsKey });
      toast.success('Label deleted');
    },
    onError: () => toast.error('Failed to delete label'),
  });

  // Rules
  const createRule = useMutation({
    mutationFn: async (rule: RuleInsert) => {
      const { data, error } = await supabase.from('email_label_rules').insert(rule).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rulesKey });
      toast.success('Rule added');
    },
    onError: () => toast.error('Failed to add rule'),
  });

  const toggleRule = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('email_label_rules').update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rulesKey }),
  });

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('email_label_rules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rulesKey });
      toast.success('Rule removed');
    },
    onError: () => toast.error('Failed to remove rule'),
  });

  const getRulesForLabel = (labelId: string) => rules.filter(r => r.label_id === labelId);

  return {
    labels, teamLabels, userLabels, rules,
    isLoading: labelsLoading || rulesLoading,
    createLabel, updateLabel, deleteLabel,
    createRule, toggleRule, deleteRule,
    getRulesForLabel,
  };
}

// Hook for thread-level label operations
export function useThreadLabels(threadId: string | null) {
  const queryClient = useQueryClient();
  const key = ['thread-labels', threadId];

  const { data: threadLabels = [], isLoading } = useQuery({
    queryKey: key,
    enabled: !!threadId,
    queryFn: async () => {
      if (!threadId) return [];
      const { data, error } = await supabase
        .from('email_thread_labels')
        .select('*, label:email_labels(*)')
        .eq('thread_id', threadId)
        .eq('is_removed', false);
      if (error) throw error;
      return data as (EmailThreadLabel & { label: EmailLabel })[];
    },
  });

  const addLabel = useMutation({
    mutationFn: async ({ labelId, via = 'manual', ruleId }: { labelId: string; via?: 'manual' | 'rule'; ruleId?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!threadId || !user) throw new Error('Missing context');
      const { error } = await supabase.from('email_thread_labels').upsert({
        thread_id: threadId,
        label_id: labelId,
        applied_by: user.id,
        applied_via: via,
        rule_id: ruleId || null,
        is_removed: false,
      }, { onConflict: 'thread_id,label_id' });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const removeLabel = useMutation({
    mutationFn: async (labelId: string) => {
      if (!threadId) throw new Error('No thread');
      const { error } = await supabase
        .from('email_thread_labels')
        .update({ is_removed: true })
        .eq('thread_id', threadId)
        .eq('label_id', labelId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  return { threadLabels, isLoading, addLabel, removeLabel };
}
