import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const DEBT_REALM_ID = '193514877331929';
const FINSERV_REALM_ID = '9341451968897660';

export interface AREntitySlice {
  entity: string;
  realmId: string;
  balance: number;
}

export function useOutstandingARByEntity() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['outstanding-ar-by-entity'],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('quickbooks_invoices')
        .select('realm_id, balance')
        .in('realm_id', [DEBT_REALM_ID, FINSERV_REALM_ID])
        .gt('balance', 0);

      if (error) throw error;
      return rows ?? [];
    },
    enabled: !!user,
  });

  const debtTotal = (data ?? [])
    .filter(r => r.realm_id === DEBT_REALM_ID)
    .reduce((s, r) => s + (Number(r.balance) || 0), 0);

  const finservTotal = (data ?? [])
    .filter(r => r.realm_id === FINSERV_REALM_ID)
    .reduce((s, r) => s + (Number(r.balance) || 0), 0);

  const slices: AREntitySlice[] = [
    { entity: '5th Line Capital Advisors, LLC', realmId: DEBT_REALM_ID, balance: debtTotal },
    { entity: '5th Line Financial Services, LLC', realmId: FINSERV_REALM_ID, balance: finservTotal },
  ];

  return { slices, total: debtTotal + finservTotal, isLoading };
}
