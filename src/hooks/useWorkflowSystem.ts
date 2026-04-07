import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "sonner";
import { ensureWorkflowsSeeded } from "@/lib/workflowDefinitions";

// Stage labels
export const DEAL_STAGE_LABELS: Record<string, string> = {
  nda_needs_list_sent: "NDA/Needs List Sent",
  pre_credit_needs: "Pre-Credit Needs / Analyst First Review",
  analyst_completes_review: "Analyst Completes Review",
  not_moving_forward: "Not Moving Forward",
  manager_approves_preview: "Manager Approves Deal for Preview",
  initial_lender_review: "Deal in Initial Lender Review",
  initial_feedback_call: "Deal in Initial Feedback Call",
  prop_in_dev: "Deal in Prop in Dev",
  prop_issued: "Deal in Prop Issued",
  agreement_pending: "Deal in Agreement Pending",
  final_credit_items: "Final Credit Items",
  client_strategy_review: "Client Strategy Review",
  write_up_pending: "Write Up Pending",
  submitted_to_lenders: "Submitted to Lenders",
  lenders_in_review: "Lenders in Review",
  terms_issued_analysis: "Terms Issued – Analysis",
  terms_issued_payment: "Terms Issued – Payment",
  due_diligence_client: "In Due Diligence – Client",
  funded_naitive: "Funded / Invoiced – Naitive",
  funded_payment: "Funded / Invoiced – Payment",
  funded_feedback_testimonials: "Funded / Invoiced – Feedback & Testimonials",
  funded_lender_review: "Funded / Invoiced – Lender Review",
};

export const DEAL_STAGES = Object.keys(DEAL_STAGE_LABELS);

export function useWfDeals() {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['wf_deals', company?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wf_deals')
        .select('*, manager:wf_users!wf_deals_manager_id_fkey(id,name), analyst:wf_users!wf_deals_analyst_id_fkey(id,name), ops:wf_users!wf_deals_ops_id_fkey(id,name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!company?.id,
  });
}

export function useWfDeal(dealId: string | undefined) {
  return useQuery({
    queryKey: ['wf_deal', dealId],
    queryFn: async () => {
      if (!dealId) return null;
      const { data, error } = await supabase
        .from('wf_deals')
        .select('*, manager:wf_users!wf_deals_manager_id_fkey(id,name), analyst:wf_users!wf_deals_analyst_id_fkey(id,name), ops:wf_users!wf_deals_ops_id_fkey(id,name)')
        .eq('id', dealId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!dealId,
  });
}

export function useWfTasks(dealId?: string, assigneeId?: string) {
  return useQuery({
    queryKey: ['wf_tasks', dealId, assigneeId],
    queryFn: async () => {
      let query = supabase.from('wf_tasks')
        .select('*, deal:wf_deals(id,name,company_name), assignee:wf_users!wf_tasks_assignee_id_fkey(id,name)')
        .order('created_at', { ascending: false });
      if (dealId) query = query.eq('deal_id', dealId);
      if (assigneeId) query = query.eq('assignee_id', assigneeId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useWfWorkflows() {
  return useQuery({
    queryKey: ['wf_workflows'],
    queryFn: async () => {
      // Ensure all registered workflows are seeded before fetching
      await ensureWorkflowsSeeded();

      const { data, error } = await supabase
        .from('wf_workflows')
        .select('*, owner:wf_users!wf_workflows_default_owner_user_id_fkey(id,name)')
        .order('key');
      if (error) throw error;
      return data;
    },
  });
}

export function useWfWorkflowsLog(dealId?: string) {
  return useQuery({
    queryKey: ['wf_workflows_log', dealId],
    queryFn: async () => {
      let query = supabase.from('wf_workflows_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (dealId) query = query.eq('deal_id', dealId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useWfUsers() {
  return useQuery({
    queryKey: ['wf_users'],
    queryFn: async () => {
      const { data, error } = await supabase.from('wf_users').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });
}

export function useWfContacts() {
  return useQuery({
    queryKey: ['wf_contacts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('wf_contacts').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });
}

export function useWfLenders(dealId?: string) {
  return useQuery({
    queryKey: ['wf_lenders', dealId],
    queryFn: async () => {
      const { data, error } = await supabase.from('wf_lenders').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });
}

export function useWfTermSheets(dealId?: string) {
  return useQuery({
    queryKey: ['wf_term_sheets', dealId],
    queryFn: async () => {
      let query = supabase.from('wf_term_sheets').select('*, lender:wf_lenders(id,name)').order('created_at', { ascending: false });
      if (dealId) query = query.eq('deal_id', dealId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useWfInvoices(dealId?: string) {
  return useQuery({
    queryKey: ['wf_invoices', dealId],
    queryFn: async () => {
      let query = supabase.from('wf_invoices').select('*').order('created_at', { ascending: false });
      if (dealId) query = query.eq('deal_id', dealId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

// Mutations
export function useCreateWfDeal() {
  const qc = useQueryClient();
  const { company } = useCompany();
  return useMutation({
    mutationFn: async (deal: { name: string; company_name?: string; client_email?: string; manager_id?: string; analyst_id?: string; ops_id?: string }) => {
      const { data, error } = await supabase.from('wf_deals').insert({
        ...deal,
        org_company_id: company?.id,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wf_deals'] });
      toast.success('Deal created');
    },
  });
}

export function useUpdateWfDealStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ dealId, stage }: { dealId: string; stage: string }) => {
      const { error } = await supabase.from('wf_deals').update({ stage: stage as any }).eq('id', dealId);
      if (error) throw error;
    },
    onSuccess: () => {
      // Small delay to let the edge function create tasks
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['wf_tasks'] });
      }, 2000);
      qc.invalidateQueries({ queryKey: ['wf_deals'] });
      qc.invalidateQueries({ queryKey: ['wf_deal'] });
      qc.invalidateQueries({ queryKey: ['wf_workflows_log'] });
      toast.success('Stage updated – workflows triggered');
    },
  });
}

export function useUpdateWfTaskStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: string }) => {
      const { error } = await supabase.from('wf_tasks').update({ status: status as any }).eq('id', taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wf_tasks'] });
      toast.success('Task updated');
    },
  });
}

export function useUpdateWfWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; default_owner_user_id?: string | null; is_active?: boolean; name?: string; description?: string | null; default_owner_role?: string }) => {
      const { error } = await supabase.from('wf_workflows').update(updates as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wf_workflows'] });
      toast.success('Workflow updated');
    },
  });
}
