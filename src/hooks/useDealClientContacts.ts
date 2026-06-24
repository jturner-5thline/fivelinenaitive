import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface DealClientContact {
  id: string;
  name: string;
  email: string | null;
  role: string | null;
  createdAt: string | null;
  lastContactAt: string | null;
}

function composeName(c: {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  email?: string | null;
}): string {
  const composed = [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
  if (composed) return composed;
  const full = (c.full_name || '').trim();
  if (full && full.toLowerCase() !== (c.email || '').toLowerCase()) return full;
  return c.email || 'Unnamed contact';
}

/**
 * All contacts linked to a deal via the `contact_deals` junction.
 * Ordered: role='primary' first, then by created_at ascending.
 */
export function useDealClientContacts(dealId: string | null | undefined) {
  return useQuery({
    queryKey: ['deal-client-contacts', dealId],
    enabled: !!dealId,
    staleTime: 30_000,
    queryFn: async (): Promise<DealClientContact[]> => {
      if (!dealId) return [];
      const { data: links, error: linksError } = await supabase
        .from('contact_deals')
        .select('contact_id, role, created_at')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: true });
      if (linksError) throw linksError;
      const rows = (links || []) as Array<{
        contact_id: string;
        role: string | null;
        created_at: string | null;
      }>;
      if (!rows.length) return [];
      const ids = rows.map((r) => r.contact_id).filter(Boolean);
      const { data: contacts, error: contactsError } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, full_name, email, last_contact_at')
        .in('id', ids);
      if (contactsError) throw contactsError;
      const byId = new Map((contacts || []).map((c: any) => [c.id, c]));
      const sorted = [...rows].sort((a, b) => {
        const ap = (a.role || '').toLowerCase() === 'primary' ? 0 : 1;
        const bp = (b.role || '').toLowerCase() === 'primary' ? 0 : 1;
        if (ap !== bp) return ap - bp;
        const at = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
        return at - bt;
      });
      const out: DealClientContact[] = [];
      for (const row of sorted) {
        const c: any = byId.get(row.contact_id);
        if (!c) continue;
        out.push({
          id: c.id,
          name: composeName(c),
          email: c.email ?? null,
          role: row.role ?? null,
          createdAt: row.created_at,
          lastContactAt: c.last_contact_at ?? null,
        });
      }
      return out;
    },
  });
}

export function useAddDealClientContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ dealId, contactId }: { dealId: string; contactId: string }) => {
      // Avoid duplicates
      const { data: existing } = await supabase
        .from('contact_deals')
        .select('contact_id')
        .eq('deal_id', dealId)
        .eq('contact_id', contactId)
        .maybeSingle();
      if (existing) return { skipped: true };
      const { error } = await supabase
        .from('contact_deals')
        .insert({ deal_id: dealId, contact_id: contactId } as any);
      if (error) throw error;
      return { skipped: false };
    },
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['deal-client-contacts', vars.dealId] });
      qc.invalidateQueries({ queryKey: ['primary-deal-contact', vars.dealId] });
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to link contact'),
  });
}

export function useRemoveDealClientContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ dealId, contactId }: { dealId: string; contactId: string }) => {
      const { error } = await supabase
        .from('contact_deals')
        .delete()
        .eq('deal_id', dealId)
        .eq('contact_id', contactId);
      if (error) throw error;
    },
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['deal-client-contacts', vars.dealId] });
      qc.invalidateQueries({ queryKey: ['primary-deal-contact', vars.dealId] });
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to remove contact'),
  });
}

/**
 * Mark one linked contact as the "primary" (preferred) contact for a deal.
 * All other rows for the deal have their role cleared so there is exactly
 * one preferred contact at a time. Downstream features (lender submissions,
 * email drafts, automatic reminders) read the primary via
 * `usePrimaryDealContact`, which prioritises role='primary'.
 */
export function useSetPreferredDealContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ dealId, contactId }: { dealId: string; contactId: string }) => {
      // Clear primary from everyone else on this deal.
      const { error: clearErr } = await supabase
        .from('contact_deals')
        .update({ role: null } as any)
        .eq('deal_id', dealId)
        .neq('contact_id', contactId);
      if (clearErr) throw clearErr;
      const { error: setErr } = await supabase
        .from('contact_deals')
        .update({ role: 'primary' } as any)
        .eq('deal_id', dealId)
        .eq('contact_id', contactId);
      if (setErr) throw setErr;
    },
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['deal-client-contacts', vars.dealId] });
      qc.invalidateQueries({ queryKey: ['primary-deal-contact', vars.dealId] });
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to set preferred contact'),
  });
}