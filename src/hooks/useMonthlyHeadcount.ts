import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { buildHeadcountChanges, headcountKey, type HeadcountDraft } from '@/lib/monthlyHeadcount';

export function useMonthlyHeadcount(companyId: string, year: number, enabled: boolean) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ['monthly-entity-headcount', companyId, year, user?.id];
  const query = useQuery({
    queryKey,
    enabled: enabled && !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('monthly_entity_headcount').select('realm_id,month,headcount')
        .eq('company_id', companyId).gte('month', `${year}-01-01`).lt('month', `${year + 1}-01-01`);
      if (error) throw error;
      const draft: HeadcountDraft = {};
      for (const row of data) draft[headcountKey(row.realm_id, Number(row.month.slice(5, 7)) - 1)] = row.headcount == null ? '' : String(row.headcount);
      return draft;
    },
  });
  async function save(draft: HeadcountDraft, baseline: HeadcountDraft) {
    const changes = buildHeadcountChanges(companyId, year, draft, baseline);
    if (changes.length) {
      const { error } = await supabase.from('monthly_entity_headcount').upsert(changes, { onConflict: 'company_id,realm_id,month' });
      if (error) throw error;
    }
    queryClient.setQueryData(queryKey, { ...draft });
  }
  return { ...query, save };
}