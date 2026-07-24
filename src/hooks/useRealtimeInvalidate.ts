import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Subscribe to Postgres changes on a table and invalidate the given
 * React Query keys whenever a matching row changes. Ensures edits made
 * by other users (or in other tabs) become visible without a page reload.
 */
export function useRealtimeInvalidate(opts: {
  table: string;
  filter?: string; // e.g. `id=eq.${contactId}` or `company_id=eq.${companyId}`
  queryKeys: (readonly unknown[])[];
  enabled?: boolean;
  channelName?: string;
}) {
  const qc = useQueryClient();
  const { table, filter, queryKeys, enabled = true, channelName } = opts;
  const keySig = JSON.stringify(queryKeys);

  useEffect(() => {
    if (!enabled) return;
    const name = channelName || `rt:${table}:${filter || 'all'}:${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(name)
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
        () => {
          for (const key of queryKeys) {
            qc.invalidateQueries({ queryKey: key as any });
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, filter, enabled, keySig]);
}