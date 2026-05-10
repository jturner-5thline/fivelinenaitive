import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface MicrosoftStatus {
  connected: boolean;
  email?: string;
  display_name?: string;
  connected_at?: string;
  is_expired?: boolean;
  sync_email_enabled?: boolean;
  sync_calendar_enabled?: boolean;
  last_email_sync_at?: string | null;
  last_calendar_sync_at?: string | null;
}

const MS_STATE_KEY = "ms_oauth_state";

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
      const { data, error } = await supabase.functions.invoke("microsoft-auth", {
        body: { action: "get_auth_url" },
      });
      if (error) throw error;
      if (data?.state) sessionStorage.setItem(MS_STATE_KEY, data.state);
      window.location.href = data.url;
    } catch (err) {
      console.error("Microsoft connect failed:", err);
    }
  }, [user]);

  const exchangeCode = useCallback(async (code: string): Promise<boolean> => {
    if (!user) return false;
    try {
      const { data, error } = await supabase.functions.invoke("microsoft-auth", {
        body: { action: "exchange_code", code, user_id: user.id },
      });
      if (error) throw error;
      sessionStorage.removeItem(MS_STATE_KEY);
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

  const setSyncToggle = useCallback(
    async (opts: { sync_email_enabled?: boolean; sync_calendar_enabled?: boolean }) => {
      if (!user) return;
      await supabase.functions.invoke("microsoft-auth", {
        body: { action: "set_sync_toggle", user_id: user.id, ...opts },
      });
      await checkStatus();
    },
    [user, checkStatus],
  );

  const syncNow = useCallback(
    async (target: "emails" | "calendar") => {
      if (!user) return;
      const fn = target === "emails" ? "microsoft-sync-emails" : "microsoft-sync-calendar";
      await supabase.functions.invoke(fn, { body: { user_id: user.id } });
      await checkStatus();
    },
    [user, checkStatus],
  );

  return {
    status,
    isStatusLoading,
    connect,
    exchangeCode,
    disconnect,
    checkStatus,
    setSyncToggle,
    syncNow,
  };
}