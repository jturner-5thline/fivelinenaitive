import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "sonner";
import type { TriggerType, WorkflowAction } from "@/components/workflows/WorkflowBuilder";

export interface CustomWorkflowTemplate {
  id: string;
  user_id: string;
  company_id: string | null;
  name: string;
  description: string | null;
  category: string;
  trigger_type: TriggerType;
  trigger_config: Record<string, any>;
  actions: WorkflowAction[];
  tags: string[];
  is_shared: boolean;
  created_at: string;
  updated_at: string;
  isOwn?: boolean;
}

export function useWorkflowTemplates() {
  const { user } = useAuth();
  const { company } = useCompany();

  return useQuery({
    queryKey: ["workflow-templates", user?.id, company?.id],
    queryFn: async () => {
      if (!user) return [];

      // Fetch user's own templates
      const { data: ownTemplates, error: ownError } = await supabase
        .from("workflow_templates")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (ownError) throw ownError;

      // Fetch shared templates from company members (excluding own)
      let sharedTemplates: any[] = [];
      if (company?.id) {
        const { data: shared, error: sharedError } = await supabase
          .from("workflow_templates")
          .select("*")
          .eq("company_id", company.id)
          .eq("is_shared", true)
          .neq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (sharedError) throw sharedError;
        sharedTemplates = shared || [];
      }

      const allTemplates = [...(ownTemplates || []), ...sharedTemplates];

      return allTemplates.map((t) => ({
        ...t,
        trigger_type: t.trigger_type as TriggerType,
        actions: t.actions as unknown as WorkflowAction[],
        tags: t.tags || [],
        isOwn: t.user_id === user.id,
      })) as CustomWorkflowTemplate[];
    },
    enabled: !!user,
  });
}

export function useCreateWorkflowTemplate() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (template: {
      name: string;
      description?: string;
      category?: string;
      trigger_type: TriggerType;
      trigger_config: Record<string, any>;
      actions: WorkflowAction[];
      tags?: string[];
      is_shared?: boolean;
      company_id?: string;
    }) => {
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("workflow_templates")
        .insert({
          user_id: user.id,
          name: template.name,
          description: template.description || null,
          category: template.category || "custom",
          trigger_type: template.trigger_type,
          trigger_config: template.trigger_config,
          actions: template.actions as any,
          tags: template.tags || [],
          is_shared: template.is_shared || false,
          company_id: template.company_id || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflow-templates"] });
      toast.success("Template saved successfully");
    },
    onError: (error) => {
      console.error("Error creating template:", error);
      toast.error("Failed to save template");
    },
  });
}

export function useDeleteWorkflowTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("workflow_templates")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflow-templates"] });
      toast.success("Template deleted");
    },
    onError: (error) => {
      console.error("Error deleting template:", error);
      toast.error("Failed to delete template");
    },
  });
}
