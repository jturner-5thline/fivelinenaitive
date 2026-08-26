import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * NEW QUALIFIED LENDERS
 * ---------------------
 * A funding source counts as "newly qualified" when BOTH are true:
 *  1. A qualifying event happened in the selected timeframe — the source was
 *     added to the funding source database, OR its primary contact
 *     information was created/updated.
 *  2. It was attached to a deal as a funding source within 2 weeks of that
 *     event.
 *
 * Each source is counted at most once per timeframe (earliest qualifying
 * event wins). Computed server-side by `get_new_qualified_lenders`, which is
 * workspace-scoped.
 */
export interface NewQualifiedLenderRow {
  lender_id: string;
  lender_name: string | null;
  relationship_owners: string | null;
  trigger_kind: string | null;
  trigger_at: string;
  deal_id: string | null;
  deal_company: string | null;
  deal_added_at: string | null;
  delta_seconds: number | null;
}

export function useNewQualifiedLenders(
  tenantId: string | null | undefined,
  start: Date | null,
  end: Date | null,
) {
  const startIso = start ? start.toISOString() : null;
  const endIso = end ? end.toISOString() : null;

  return useQuery({
    queryKey: ['new-qualified-lenders', tenantId, startIso, endIso],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async (): Promise<NewQualifiedLenderRow[]> => {
      const { data, error } = await supabase.rpc(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'get_new_qualified_lenders' as any,
        { p_tenant_id: tenantId, p_start: startIso, p_end: endIso },
      );
      if (error) throw error;
      return (data ?? []) as NewQualifiedLenderRow[];
    },
  });
}

export function qualifiedTriggerLabel(kind: string | null | undefined): string {
  switch ((kind || '').toLowerCase()) {
    case 'created':
      return 'Added to directory';
    case 'contact_name':
      return 'Contact name changed';
    case 'contact_email':
      return 'Contact email changed';
    case 'contact_phone':
      return 'Contact phone changed';
    case 'contact_title':
      return 'Contact title changed';
    case 'primary_contact_updated':
      return 'Primary contact updated';
    case 'name':
      return 'Name changed';
    default:
      return kind || '—';
  }
}
