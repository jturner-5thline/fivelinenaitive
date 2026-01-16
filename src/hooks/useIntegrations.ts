import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface Integration {
  id: string;
  user_id: string;
  company_id: string | null;
  name: string;
  type: string;
  status: string;
  config: Record<string, string>;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useIntegrations() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: integrations = [], isLoading } = useQuery({
    queryKey: ["integrations", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("integrations")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return (data || []) as Integration[];
    },
    enabled: !!user,
  });

  const createIntegration = useMutation({
    mutationFn: async (integration: {
      name: string;
      type: string;
      config: Record<string, string>;
    }) => {
      if (!user) throw new Error("Not authenticated");
      
      const { data, error } = await supabase
        .from("integrations")
        .insert({
          user_id: user.id,
          name: integration.name,
          type: integration.type,
          config: integration.config,
          status: "disconnected",
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      toast.success("Integration added successfully");
    },
    onError: (error) => {
      toast.error("Failed to create integration: " + error.message);
    },
  });

  const updateIntegration = useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Omit<Integration, "id" | "user_id" | "created_at">>;
    }) => {
      const { data, error } = await supabase
        .from("integrations")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: (error) => {
      toast.error("Failed to update integration: " + error.message);
    },
  });

  const deleteIntegration = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("integrations")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      toast.success("Integration removed");
    },
    onError: (error) => {
      toast.error("Failed to delete integration: " + error.message);
    },
  });

  const toggleIntegration = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { data, error } = await supabase
        .from("integrations")
        .update({
          status: enabled ? "connected" : "disconnected",
          last_sync_at: enabled ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { enabled }) => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      toast.success(enabled ? "Integration enabled" : "Integration disabled");
    },
    onError: (error) => {
      toast.error("Failed to toggle integration: " + error.message);
    },
  });

  return {
    integrations,
    isLoading,
    createIntegration,
    updateIntegration,
    deleteIntegration,
    toggleIntegration,
  };
}
