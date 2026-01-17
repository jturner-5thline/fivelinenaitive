import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// System Settings
export interface SystemSetting {
  id: string;
  key: string;
  value: Record<string, any>;
  description: string | null;
  category: string;
  created_at: string;
  updated_at: string;
}

export const useSystemSettings = () => {
  return useQuery({
    queryKey: ["system-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("*")
        .order("category", { ascending: true });
      if (error) throw error;
      return data as SystemSetting[];
    },
  });
};

export const useUpdateSystemSetting = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: Record<string, any> }) => {
      const { error } = await supabase
        .from("system_settings")
        .update({ value })
        .eq("key", key);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-settings"] });
    },
  });
};

// Announcements
export interface Announcement {
  id: string;
  title: string;
  message: string;
  type: "info" | "warning" | "success" | "error";
  is_active: boolean;
  show_from: string | null;
  show_until: string | null;
  target_roles: string[] | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const useAnnouncements = () => {
  return useQuery({
    queryKey: ["announcements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_announcements")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Announcement[];
    },
  });
};

export const useActiveAnnouncements = () => {
  return useQuery({
    queryKey: ["active-announcements"],
    queryFn: async () => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("system_announcements")
        .select("*")
        .eq("is_active", true)
        .or(`show_from.is.null,show_from.lte.${now}`)
        .or(`show_until.is.null,show_until.gte.${now}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Announcement[];
    },
  });
};

export const useCreateAnnouncement = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (announcement: Omit<Announcement, "id" | "created_at" | "updated_at" | "created_by">) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("system_announcements")
        .insert({ ...announcement, created_by: user?.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      queryClient.invalidateQueries({ queryKey: ["active-announcements"] });
    },
  });
};

export const useUpdateAnnouncement = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Announcement> & { id: string }) => {
      const { error } = await supabase
        .from("system_announcements")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      queryClient.invalidateQueries({ queryKey: ["active-announcements"] });
    },
  });
};

export const useDeleteAnnouncement = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("system_announcements")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      queryClient.invalidateQueries({ queryKey: ["active-announcements"] });
    },
  });
};

// Email Templates
export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body_html: string;
  body_text: string | null;
  variables: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const useEmailTemplates = () => {
  return useQuery({
    queryKey: ["email-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_templates")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as EmailTemplate[];
    },
  });
};

export const useUpdateEmailTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<EmailTemplate> & { id: string }) => {
      const { error } = await supabase
        .from("email_templates")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
    },
  });
};

// IP Allowlist
export interface IpAllowlistEntry {
  id: string;
  ip_address: string;
  description: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

export const useIpAllowlist = () => {
  return useQuery({
    queryKey: ["ip-allowlist"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ip_allowlist")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as IpAllowlistEntry[];
    },
  });
};

export const useCreateIpAllowlistEntry = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ip_address, description }: { ip_address: string; description?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("ip_allowlist")
        .insert({ ip_address, description, created_by: user?.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ip-allowlist"] });
    },
  });
};

export const useDeleteIpAllowlistEntry = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("ip_allowlist")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ip-allowlist"] });
    },
  });
};

// Integration Logs
export interface IntegrationLog {
  id: string;
  integration_type: string;
  event_type: string;
  status: "pending" | "success" | "failed" | "retrying";
  payload: Record<string, any> | null;
  response: Record<string, any> | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
}

export const useIntegrationLogs = (limit = 100) => {
  return useQuery({
    queryKey: ["integration-logs", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("integration_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as IntegrationLog[];
    },
  });
};

// Error Logs
export interface ErrorLog {
  id: string;
  error_type: string;
  error_message: string;
  stack_trace: string | null;
  user_id: string | null;
  page_url: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

export const useErrorLogs = (limit = 100) => {
  return useQuery({
    queryKey: ["error-logs", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("error_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as ErrorLog[];
    },
  });
};

// Rate Limits (using existing table)
export const useRateLimits = () => {
  return useQuery({
    queryKey: ["rate-limits"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rate_limits")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });
};

export const useBlockedIps = () => {
  return useQuery({
    queryKey: ["blocked-ips"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rate_limits")
        .select("*")
        .not("blocked_until", "is", null)
        .gte("blocked_until", new Date().toISOString())
        .order("blocked_until", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
};

export const useUnblockIp = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("rate_limits")
        .update({ blocked_until: null, request_count: 0 })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rate-limits"] });
      queryClient.invalidateQueries({ queryKey: ["blocked-ips"] });
    },
  });
};
