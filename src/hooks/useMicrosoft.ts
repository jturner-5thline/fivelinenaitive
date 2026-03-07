import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface MicrosoftStatus {
  connected: boolean;
  email?: string;
  display_name?: string;
  connected_at?: string;
  is_expired?: boolean;
}

export function useMicrosoft() {
  const { user } = useAuth();
  const [status, setStatus] = useState<MicrosoftStatus | null>(null);
  const [isStatusLoading, setIsStatusLoading] = useState(true);

  const checkStatus = useCallback(async () => {
    if (!user) return;
    setIsStatusLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("microsoft-auth", {
        body: { action: "check_status", user_id: user.id },
      });
      if (error) throw error;
      setStatus(data as MicrosoftStatus);
    } catch (err) {
      console.error("Microsoft status check failed:", err);
      setStatus({ connected: false });
    } finally {
      setIsStatusLoading(false);
    }
  }, [user]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const connect = useCallback(async () => {
    if (!user) return;
    try {
      const redirectUri = `${window.location.origin}/integrations?microsoft_callback=true`;
      const { data, error } = await supabase.functions.invoke("microsoft-auth", {
        body: { action: "get_auth_url", redirect_uri: redirectUri },
      });
      if (error) throw error;
      window.location.href = data.url;
    } catch (err) {
      console.error("Microsoft connect failed:", err);
    }
  }, [user]);

  const exchangeCode = useCallback(async (code: string): Promise<boolean> => {
    if (!user) return false;
    try {
      const redirectUri = `${window.location.origin}/integrations?microsoft_callback=true`;
      const { data, error } = await supabase.functions.invoke("microsoft-auth", {
        body: { action: "exchange_code", code, redirect_uri: redirectUri, user_id: user.id },
      });
      if (error) throw error;
      return data?.success ?? false;
    } catch (err) {
      console.error("Microsoft code exchange failed:", err);
      return false;
    }
  }, [user]);

  const disconnect = useCallback(async () => {
    if (!user) return;
    try {
      await supabase.functions.invoke("microsoft-auth", {
        body: { action: "disconnect", user_id: user.id },
      });
      setStatus({ connected: false });
    } catch (err) {
      console.error("Microsoft disconnect failed:", err);
    }
  }, [user]);

  return { status, isStatusLoading, connect, exchangeCode, disconnect, checkStatus };
}
