import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";

interface DocuSignStatus {
  connected: boolean;
  is_expired?: boolean;
  account_name?: string;
  account_id?: string;
  last_synced?: string;
}

export function useDocuSign() {
  const { company } = useCompany();
  const [status, setStatus] = useState<DocuSignStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const companyId = company?.id;

  const checkStatus = useCallback(async () => {
    if (!companyId) return;
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke("docusign-auth", {
        body: { action: "status", company_id: companyId },
      });
      if (error) throw error;
      setStatus(data as DocuSignStatus);
    } catch (err) {
      console.error("DocuSign status check failed:", err);
      setStatus({ connected: false });
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (companyId) checkStatus();
  }, [companyId, checkStatus]);

  const connect = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("docusign-auth", {
        body: { action: "get_auth_url" },
      });
      if (error) throw error;
      window.location.href = data.url;
    } catch (err) {
      console.error("Failed to start DocuSign OAuth:", err);
      throw err;
    }
  }, []);

  const exchangeCode = useCallback(
    async (code: string): Promise<boolean> => {
      if (!companyId) return false;
      try {
        const { data, error } = await supabase.functions.invoke("docusign-auth", {
          body: { action: "exchange_code", code, company_id: companyId },
        });
        if (error) throw error;
        if (data?.success) {
          await checkStatus();
          return true;
        }
        return false;
      } catch (err) {
        console.error("DocuSign code exchange failed:", err);
        return false;
      }
    },
    [companyId, checkStatus]
  );

  const disconnect = useCallback(async () => {
    if (!companyId) return;
    try {
      const { error } = await supabase.functions.invoke("docusign-auth", {
        body: { action: "disconnect", company_id: companyId },
      });
      if (error) throw error;
      setStatus({ connected: false });
    } catch (err) {
      console.error("DocuSign disconnect failed:", err);
      throw err;
    }
  }, [companyId]);

  const refresh = useCallback(async () => {
    if (!companyId) return;
    try {
      const { data, error } = await supabase.functions.invoke("docusign-auth", {
        body: { action: "refresh", company_id: companyId },
      });
      if (error) throw error;
      if (data?.success) await checkStatus();
    } catch (err) {
      console.error("DocuSign refresh failed:", err);
      throw err;
    }
  }, [companyId, checkStatus]);

  return {
    status,
    loading,
    connect,
    exchangeCode,
    disconnect,
    refresh,
    checkStatus,
  };
}
