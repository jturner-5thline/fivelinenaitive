import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Per-deal selection of which funding-source (lender) contact to use for
 * automatic reminders, lender submissions, and AI email drafts. Persisted
 * as `deal_lenders.selected_contact_id`. When NULL, downstream features
 * fall back to the lender directory's primary contact (master_lenders).
 */
export function useDealLenderSelectedContact(dealLenderId: string | null | undefined) {
  return useQuery({
    queryKey: ['deal-lender-selected-contact', dealLenderId],
    enabled: !!dealLenderId,
    staleTime: 30_000,
    queryFn: async (): Promise<string | null> => {
      if (!dealLenderId) return null;
      const { data, error } = await supabase
        .from('deal_lenders')
        .select('selected_contact_id')
        .eq('id', dealLenderId)
        .maybeSingle();
      if (error) throw error;
      return ((data as any)?.selected_contact_id as string | null) ?? null;
    },
  });
}

export function useSetDealLenderSelectedContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      dealLenderId,
      contactId,
    }: {
      dealLenderId: string;
      contactId: string | null;
    }) => {
      const { error } = await supabase
        .from('deal_lenders')
        .update({ selected_contact_id: contactId } as any)
        .eq('id', dealLenderId);
      if (error) throw error;
    },
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({
        queryKey: ['deal-lender-selected-contact', vars.dealLenderId],
      });
    },
    onError: (err: any) =>
      toast.error(err?.message || 'Failed to set preferred contact'),
  });
}