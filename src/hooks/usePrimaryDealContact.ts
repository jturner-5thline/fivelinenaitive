import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Primary contact linked to a deal via the `contact_deals` junction
 * (role = 'primary'). Falls back to any linked contact if no row is
 * explicitly tagged 'primary'. Returns null when no link exists — the
 * caller should then fall back to the legacy free-text deal.contact
 * field for backward compatibility with tenants that haven't migrated
 * to contact links yet.
 *
 * Tenant-agnostic by design: RLS on contacts/contact_deals already
 * scopes results to the caller's tenant, so no company_id filter is
 * needed here.
 */
export interface PrimaryDealContact {
  id: string;
  name: string;
  email: string | null;
  role: string | null;
}

function sortLinkedContacts(a: any, b: any) {
  const aPrimary = (a?.role || '').toLowerCase() === 'primary' ? 0 : 1;
  const bPrimary = (b?.role || '').toLowerCase() === 'primary' ? 0 : 1;
  if (aPrimary !== bPrimary) return aPrimary - bPrimary;

  const aCreated = a?.created_at ? new Date(a.created_at).getTime() : 0;
  const bCreated = b?.created_at ? new Date(b.created_at).getTime() : 0;
  if (aCreated !== bCreated) return aCreated - bCreated;

  const aName = [a?.contact?.first_name, a?.contact?.last_name].filter(Boolean).join(' ').trim();
  const bName = [b?.contact?.first_name, b?.contact?.last_name].filter(Boolean).join(' ').trim();
  return aName.localeCompare(bName);
}

export function usePrimaryDealContact(dealId: string | null | undefined) {
  return useQuery({
    queryKey: ['primary-deal-contact', dealId],
    enabled: !!dealId,
    staleTime: 30_000,
    queryFn: async (): Promise<PrimaryDealContact | null> => {
      if (!dealId) return null;
      const { data, error } = await supabase
        .from('contact_deals')
        .select('role, created_at, contact:contacts(id, first_name, last_name, email)')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      const rows = ((data || []) as any[]).sort(sortLinkedContacts);
      if (!rows.length) return null;
      const primary = rows[0];
      const c = primary?.contact;
      if (!c) return null;
      const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || c.email || 'Unknown';
      return {
        id: c.id,
        name,
        email: c.email ?? null,
        role: primary.role ?? null,
      };
    },
  });
}