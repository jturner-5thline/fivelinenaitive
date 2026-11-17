import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { QBO_ENTITY_BY_KEY } from '@/config/qboEntities';
import { loadFinServNrr, priorWindow, type NrrCustomerRow } from '@/lib/dashboardTiles/finservTiles';

const FINSERV_REALM_ID = QBO_ENTITY_BY_KEY.finserv.realmId;

export type { NrrCustomerRow };

export interface FinServNrrResult {
  nrr: number | null;
  priorTotal: number;
  currentTotal: number;
  customers: NrrCustomerRow[];
  priorLabel: string;
  isLoading: boolean;
}

export { priorWindow };

/**
 * Net Revenue Retention for the FinServ QBO entity.
 * Cohort = customers billed in the prior period. NRR = their revenue this
 * period ÷ their revenue last period. Customers first billed this period
 * are excluded entirely.
 */
export function useFinServNrr(start: string | undefined, end: string | undefined): FinServNrrResult {
  const prior = start && end ? priorWindow(start, end) : null;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['finserv-nrr', start, end],
    enabled: !!start && !!end,
    staleTime: 60_000,
    queryFn: async () => {
      const r = await loadFinServNrr(supabase, start!, end!, FINSERV_REALM_ID);
      return { customers: r.customers, priorTotal: r.priorTotal, currentTotal: r.currentTotal, nrr: r.nrr };
    },
  });

  return {
    nrr: data?.nrr ?? null,
    priorTotal: data?.priorTotal ?? 0,
    currentTotal: data?.currentTotal ?? 0,
    customers: data?.customers ?? [],
    priorLabel: prior ? `${prior.start} → ${prior.end}` : '',
    isLoading: isLoading || isFetching,
  };
}
