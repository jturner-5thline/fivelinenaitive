import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Json } from '@/integrations/supabase/types';

export interface LenderAuditEntry {
  id: string;
  lender_id: string;
  user_id: string | null;
  user_display_name: string | null;
  action: string;
  field_changed: string | null;
  old_value: string | null;
  new_value: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export function useLenderAuditLog(lenderId: string | undefined) {
  const [entries, setEntries] = useState<LenderAuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();

  const fetchEntries = useCallback(async () => {
    if (!lenderId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('lender_audit_logs')
        .select('*')
        .eq('lender_id', lenderId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!error && data) {
        setEntries(data as unknown as LenderAuditEntry[]);
      }
    } finally {
      setIsLoading(false);
    }
  }, [lenderId]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const logChange = useCallback(async (
    action: string,
    fieldChanged?: string,
    oldValue?: string | null,
    newValue?: string | null,
    metadata?: Record<string, unknown>,
  ) => {
    if (!lenderId || !user) return;

    // Get display name
    const { data: profileData } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('user_id', user.id)
      .single();

    await supabase.from('lender_audit_logs').insert([{
      lender_id: lenderId,
      user_id: user.id,
      user_display_name: profileData?.display_name || user.email || 'Unknown',
      action,
      field_changed: fieldChanged || null,
      old_value: oldValue || null,
      new_value: newValue || null,
      metadata: (metadata as Json) || null,
    }]);

    fetchEntries();
  }, [lenderId, user, fetchEntries]);

  return { entries, isLoading, logChange, refetch: fetchEntries };
}
