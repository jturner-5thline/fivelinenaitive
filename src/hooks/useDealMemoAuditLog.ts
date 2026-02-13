import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface MemoAuditEntry {
  id: string;
  deal_id: string;
  user_id: string | null;
  user_display_name: string | null;
  field_changed: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

const FIELD_LABELS: Record<string, string> = {
  narrative: 'Narrative',
  highlights: 'Deal Highlights',
  hurdles: 'Deal Hurdles',
  lender_notes: 'Lender Notes',
  analyst_notes: 'Analyst Notes',
  other_notes: 'Other Notes',
};

export function getFieldLabel(field: string): string {
  return FIELD_LABELS[field] || field;
}

export function useDealMemoAuditLog(dealId: string | undefined) {
  const [entries, setEntries] = useState<MemoAuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchEntries = useCallback(async () => {
    if (!dealId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('deal_memo_audit_logs')
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setEntries(data || []);
    } catch (err) {
      console.error('Error fetching memo audit logs:', err);
    } finally {
      setIsLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const logChanges = useCallback(async (
    dealId: string,
    oldValues: Record<string, string | null>,
    newValues: Record<string, string | null>,
  ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .single();

      const displayName = profile?.display_name || user.email || 'Unknown';

      const inserts: Array<{
        deal_id: string;
        user_id: string;
        user_display_name: string;
        field_changed: string;
        old_value: string | null;
        new_value: string | null;
      }> = [];

      for (const key of Object.keys(newValues)) {
        const oldVal = oldValues[key] || null;
        const newVal = newValues[key] || null;
        if (oldVal !== newVal) {
          inserts.push({
            deal_id: dealId,
            user_id: user.id,
            user_display_name: displayName,
            field_changed: key,
            old_value: oldVal,
            new_value: newVal,
          });
        }
      }

      if (inserts.length > 0) {
        await supabase.from('deal_memo_audit_logs').insert(inserts);
        fetchEntries();
      }
    } catch (err) {
      console.error('Error logging memo changes:', err);
    }
  }, [fetchEntries]);

  return { entries, isLoading, logChanges, refetch: fetchEntries };
}
