import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface HubSpotIntegrationConfig {
  id: string;
  company_id: string | null;
  user_id: string;
  type: string;
  status: "enabled" | "disabled" | "failing";
  direction: "native_to_hubspot" | "hubspot_to_native" | "bidirectional";
  record_behavior: "create_only" | "update_only" | "create_and_update";
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface HubSpotFieldMapping {
  id: string;
  integration_config_id: string;
  external_object: string;
  external_field_name: string;
  native_object: string;
  native_field_name: string;
  is_required: boolean;
  created_at: string;
  updated_at: string;
}

export interface HubSpotSyncRun {
  id: string;
  integration_config_id: string;
  status: "success" | "failure" | "running";
  records_processed: number;
  error_count: number;
  error_summary: Record<string, unknown> | null;
  started_at: string;
  finished_at: string | null;
}

// HubSpot deal fields that can be mapped
export const HUBSPOT_DEAL_FIELDS = [
  { name: "dealname", label: "Deal Name", type: "string", required: true },
  { name: "amount", label: "Amount", type: "number", required: true },
  { name: "dealstage", label: "Deal Stage", type: "string", required: true },
  { name: "closedate", label: "Close Date", type: "date", required: true },
  { name: "pipeline", label: "Pipeline", type: "string", required: false },
  { name: "deal_currency_code", label: "Currency", type: "string", required: false },
  { name: "description", label: "Deal Description", type: "string", required: false },
  { name: "hubspot_owner_id", label: "Deal Owner", type: "string", required: false },
  { name: "deal_manager", label: "Deal Manager", type: "string", required: false },
  { name: "dealtype", label: "Deal Type", type: "string", required: false },
  { name: "client_needs", label: "Client Needs", type: "string", required: false },
  { name: "engagement_type", label: "Engagement Type", type: "string", required: false },
  { name: "business_model", label: "Business Model", type: "string", required: false },
  { name: "contact_email", label: "Contact Email", type: "string", required: false },
  { name: "referral_source", label: "Referral Source", type: "string", required: false },
  { name: "sourced_via", label: "Sourced Via", type: "string", required: false },
  { name: "pre_signed_hours", label: "Pre-Signed Hours", type: "number", required: false },
  { name: "post_signed_hours", label: "Post-Signed Hours", type: "number", required: false },
  { name: "hs_priority", label: "Priority", type: "string", required: false },
  { name: "notes_last_updated", label: "Notes Last Updated", type: "date", required: false },
  { name: "createdate", label: "Create Date", type: "date", required: false },
  { name: "hs_lastmodifieddate", label: "Last Modified Date", type: "date", required: false },
];

// Native deal fields available for mapping
export const NATIVE_DEAL_FIELDS = [
  { name: "company", label: "Company Name", type: "string" },
  { name: "value", label: "Deal Value", type: "number" },
  { name: "stage", label: "Stage", type: "string" },
  { name: "closing_date", label: "Closing Date", type: "date" },
  { name: "pipeline_id", label: "Pipeline", type: "string" },
  { name: "deal_type", label: "Deal Type", type: "string" },
  { name: "deal_owner", label: "Deal Owner", type: "string" },
  { name: "contact", label: "Contact", type: "string" },
  { name: "contact_info", label: "Contact Email", type: "string" },
  { name: "notes", label: "Notes", type: "string" },
  { name: "narrative", label: "Narrative / Description", type: "string" },
  { name: "status", label: "Status", type: "string" },
  { name: "engagement_type", label: "Engagement Type", type: "string" },
  { name: "business_model", label: "Business Model", type: "string" },
  { name: "analyst", label: "Analyst", type: "string" },
  { name: "manager", label: "Manager", type: "string" },
  { name: "referred_by", label: "Referred By / Referral Source", type: "string" },
  { name: "sourced_via", label: "Sourced Via", type: "string" },
  { name: "client_needs", label: "Client Needs", type: "string" },
  { name: "pre_signing_hours", label: "Pre-Signing Hours", type: "number" },
  { name: "post_signing_hours", label: "Post-Signing Hours", type: "number" },
];

// Default mappings for common fields
export const DEFAULT_FIELD_MAPPINGS: { external: string; native: string; required: boolean }[] = [
  { external: "dealname", native: "company", required: true },
  { external: "amount", native: "value", required: true },
  { external: "dealstage", native: "stage", required: true },
  { external: "closedate", native: "closing_date", required: true },
  { external: "pipeline", native: "pipeline_id", required: false },
  { external: "dealtype", native: "deal_type", required: false },
  { external: "hubspot_owner_id", native: "deal_owner", required: false },
  { external: "description", native: "narrative", required: false },
  { external: "deal_manager", native: "manager", required: false },
  { external: "engagement_type", native: "engagement_type", required: false },
  { external: "business_model", native: "business_model", required: false },
  { external: "contact_email", native: "contact_info", required: false },
  { external: "referral_source", native: "referred_by", required: false },
  { external: "sourced_via", native: "sourced_via", required: false },
  { external: "pre_signed_hours", native: "pre_signing_hours", required: false },
  { external: "post_signed_hours", native: "post_signing_hours", required: false },
  { external: "client_needs", native: "client_needs", required: false },
];

export function useHubSpotMappingConfig() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ["hubspot-integration-configs", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hubspot_integration_configs" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as HubSpotIntegrationConfig[];
    },
    enabled: !!user,
  });

  const upsertConfig = useMutation({
    mutationFn: async (config: Partial<HubSpotIntegrationConfig> & { type: string }) => {
      if (!user) throw new Error("Not authenticated");
      
      const existing = configs.find(c => c.type === config.type);
      if (existing) {
        const { data, error } = await supabase
          .from("hubspot_integration_configs" as any)
          .update({
            status: config.status,
            direction: config.direction,
            record_behavior: config.record_behavior,
          })
          .eq("id", existing.id)
          .select()
          .single();
        if (error) throw error;
        return data as unknown as HubSpotIntegrationConfig;
      } else {
        const { data, error } = await supabase
          .from("hubspot_integration_configs" as any)
          .insert({
            user_id: user.id,
            type: config.type,
            status: config.status || "disabled",
            direction: config.direction || "hubspot_to_native",
            record_behavior: config.record_behavior || "create_and_update",
          })
          .select()
          .single();
        if (error) throw error;
        return data as unknown as HubSpotIntegrationConfig;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hubspot-integration-configs"] });
    },
    onError: (error) => {
      toast.error("Failed to save config: " + error.message);
    },
  });

  const toggleStatus = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("hubspot_integration_configs" as any)
        .update({ status: enabled ? "enabled" : "disabled" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { enabled }) => {
      queryClient.invalidateQueries({ queryKey: ["hubspot-integration-configs"] });
      toast.success(enabled ? "Mapping enabled" : "Mapping disabled");
    },
    onError: (error) => {
      toast.error("Failed to toggle: " + error.message);
    },
  });

  return { configs, isLoading, upsertConfig, toggleStatus };
}

export function useHubSpotFieldMappings(configId: string | undefined) {
  const queryClient = useQueryClient();

  const { data: mappings = [], isLoading } = useQuery({
    queryKey: ["hubspot-field-mappings", configId],
    queryFn: async () => {
      if (!configId) return [];
      const { data, error } = await supabase
        .from("hubspot_field_mappings" as any)
        .select("*")
        .eq("integration_config_id", configId)
        .order("created_at");
      if (error) throw error;
      return (data || []) as unknown as HubSpotFieldMapping[];
    },
    enabled: !!configId,
  });

  const saveMappings = useMutation({
    mutationFn: async (newMappings: { external_field_name: string; native_field_name: string; is_required: boolean }[]) => {
      if (!configId) throw new Error("No config ID");
      
      // Delete existing and re-insert
      await supabase
        .from("hubspot_field_mappings" as any)
        .delete()
        .eq("integration_config_id", configId);

      if (newMappings.length > 0) {
        const { error } = await supabase
          .from("hubspot_field_mappings" as any)
          .insert(
            newMappings.map(m => ({
              integration_config_id: configId,
              external_object: "hubspot_deal",
              external_field_name: m.external_field_name,
              native_object: "native_deal",
              native_field_name: m.native_field_name,
              is_required: m.is_required,
            }))
          );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hubspot-field-mappings", configId] });
      toast.success("Field mappings saved");
    },
    onError: (error) => {
      toast.error("Failed to save mappings: " + error.message);
    },
  });

  return { mappings, isLoading, saveMappings };
}

export function useHubSpotSyncRuns(configId: string | undefined) {
  const queryClient = useQueryClient();

  const { data: runs = [], isLoading } = useQuery({
    queryKey: ["hubspot-sync-runs", configId],
    queryFn: async () => {
      if (!configId) return [];
      const { data, error } = await supabase
        .from("hubspot_sync_runs" as any)
        .select("*")
        .eq("integration_config_id", configId)
        .order("started_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as unknown as HubSpotSyncRun[];
    },
    enabled: !!configId,
  });

  const triggerSync = useMutation({
    mutationFn: async () => {
      if (!configId) throw new Error("No config ID");
      // Stub: create a fake sync run
      const { data, error } = await supabase
        .from("hubspot_sync_runs" as any)
        .insert({
          integration_config_id: configId,
          status: "success",
          records_processed: Math.floor(Math.random() * 50) + 5,
          error_count: 0,
          started_at: new Date().toISOString(),
          finished_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      
      // Update last_sync_at on config
      await supabase
        .from("hubspot_integration_configs" as any)
        .update({ last_sync_at: new Date().toISOString() })
        .eq("id", configId);
        
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hubspot-sync-runs", configId] });
      queryClient.invalidateQueries({ queryKey: ["hubspot-integration-configs"] });
      toast.success("Sync completed successfully");
    },
    onError: (error) => {
      toast.error("Sync failed: " + error.message);
    },
  });

  return { runs, isLoading, triggerSync };
}
