import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const STORAGE_KEY = 'approval-queue-scope';

export type ApprovalQueueScope = 'all' | 'me';

function read(): ApprovalQueueScope {
  if (typeof window === 'undefined') return 'all';
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === 'me' ? 'me' : 'all';
}

/**
 * Persisted "All" vs "Me" scope for the Approval Queue. Shared between the
 * queue panel and the header badge so the badge count matches the filtered
 * view the admin is looking at.
 */
export function useApprovalQueueScope(): [ApprovalQueueScope, (s: ApprovalQueueScope) => void] {
  const [scope, setScopeState] = useState<ApprovalQueueScope>(() => read());
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setScopeState(read());
    };
    const local = () => setScopeState(read());
    window.addEventListener('storage', handler);
    window.addEventListener('approval-queue-scope-changed', local);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener('approval-queue-scope-changed', local);
    };
  }, []);
  const setScope = (s: ApprovalQueueScope) => {
    window.localStorage.setItem(STORAGE_KEY, s);
    window.dispatchEvent(new Event('approval-queue-scope-changed'));
    setScopeState(s);
  };
  return [scope, setScope];
}

/**
 * Deal IDs where the current user is tagged as the deal manager. Mirrors the
 * matching logic previously inlined in ActionQueuePanel so the badge and the
 * panel agree on which deals belong to "me".
 */
export function useMyManagedDealIds(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['approval-queue', 'my-managed-deal-ids', user?.id],
    enabled: !!user?.id && enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<Set<string>> => {
      const { data: prof } = await supabase
        .from('profiles')
        .select('first_name,last_name,display_name,email')
        .eq('id', user!.id)
        .maybeSingle();
      const tokens = new Set<string>();
      const add = (v?: string | null) => {
        const t = (v ?? '').trim();
        if (t && t.length >= 2) tokens.add(t.toLowerCase());
      };
      add(prof?.display_name);
      add(prof?.first_name);
      add(prof?.last_name);
      if (prof?.first_name && prof?.last_name) add(`${prof.first_name} ${prof.last_name}`);
      if (prof?.email) add(prof.email.split('@')[0]);
      add(user?.email?.split('@')[0]);
      add((user?.user_metadata as any)?.full_name);
      add((user?.user_metadata as any)?.name);
      if (!tokens.size) return new Set();
      const { data, error } = await supabase.from('deals').select('id,manager');
      if (error) return new Set();
      const matched = new Set<string>();
      for (const row of (data || []) as Array<{ id: string; manager: string | null }>) {
        const m = (row.manager ?? '').toLowerCase();
        if (!m) continue;
        for (const t of tokens) {
          if (m.includes(t)) {
            matched.add(row.id);
            break;
          }
        }
      }
      return matched;
    },
  });
}