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
  phone: string | null;
  role: string | null;
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
        .select('role, created_at, contact:contacts(id, first_name, last_name, email, phone)')
        .eq('deal_id', dealId);
      if (error) throw error;
      const rows = (data || []) as any[];
      if (!rows.length) return null;
      const primary = rows.find((r) => (r.role || '').toLowerCase() === 'primary') ?? rows[0];
      const c = primary?.contact;
      if (!c) return null;
      const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || c.email || 'Unknown';
      return {
        id: c.id,
        name,
        email: c.email ?? null,
        phone: c.phone ?? null,
        role: primary.role ?? null,
      };
    },
  });
}