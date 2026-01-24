import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface LenderSyncRequest {
  id: string;
  source_system: string;
  source_lender_id: string | null;
  request_type: 'new_lender' | 'update_existing' | 'merge_conflict';
  incoming_data: Record<string, unknown>;
  existing_lender_id: string | null;
  existing_lender_name: string | null;
  changes_diff: Record<string, { old: unknown; new: unknown }> | null;
  status: 'pending' | 'approved' | 'rejected' | 'merged' | 'auto_approved';
  processed_by: string | null;
  processed_at: string | null;
  processing_notes: string | null;
  created_at: string;
  updated_at: string;
}

interface UseLenderSyncRequestsResult {
  requests: LenderSyncRequest[];
  pendingCount: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  approveRequest: (id: string, notes?: string) => Promise<boolean>;
  rejectRequest: (id: string, notes?: string) => Promise<boolean>;
  mergeRequest: (id: string, mergedData: Record<string, unknown>, notes?: string) => Promise<boolean>;
}

export function useLenderSyncRequests(): UseLenderSyncRequestsResult {
  const [requests, setRequests] = useState<LenderSyncRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('lender_sync_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      setRequests((data || []) as LenderSyncRequest[]);
    } catch (err) {
      console.error('Error fetching lender sync requests:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch sync requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  const approveRequest = async (id: string, notes?: string): Promise<boolean> => {
    try {
      const request = requests.find(r => r.id === id);
      if (!request) throw new Error('Request not found');

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      if (request.request_type === 'new_lender') {
        // Insert the new lender
        const incomingData = request.incoming_data as Record<string, unknown>;
        const { error: insertError } = await supabase
          .from('master_lenders')
          .insert({
            user_id: userData.user.id,
            name: incomingData.name as string,
            email: incomingData.email as string | null,
            lender_type: incomingData.lender_type as string | null,
            loan_types: incomingData.loan_types as string[] | null,
            sub_debt: incomingData.sub_debt as string | null,
            cash_burn: incomingData.cash_burn as string | null,
            sponsorship: incomingData.sponsorship as string | null,
            min_revenue: incomingData.min_revenue as number | null,
            ebitda_min: incomingData.ebitda_min as number | null,
            min_deal: incomingData.min_deal as number | null,
            max_deal: incomingData.max_deal as number | null,
            industries: incomingData.industries as string[] | null,
            industries_to_avoid: incomingData.industries_to_avoid as string[] | null,
            b2b_b2c: incomingData.b2b_b2c as string | null,
            refinancing: incomingData.refinancing as string | null,
            company_requirements: incomingData.company_requirements as string | null,
            deal_structure_notes: incomingData.deal_structure_notes as string | null,
            geo: incomingData.geo as string | null,
            contact_name: incomingData.contact_name as string | null,
            contact_title: incomingData.contact_title as string | null,
            relationship_owners: incomingData.relationship_owners as string | null,
            lender_one_pager_url: incomingData.lender_one_pager_url as string | null,
            referral_lender: incomingData.referral_lender as string | null,
            referral_fee_offered: incomingData.referral_fee_offered as string | null,
            referral_agreement: incomingData.referral_agreement as string | null,
            nda: incomingData.nda as string | null,
            onboarded_to_flex: incomingData.onboarded_to_flex as string | null,
            upfront_checklist: incomingData.upfront_checklist as string | null,
            post_term_sheet_checklist: incomingData.post_term_sheet_checklist as string | null,
            gift_address: incomingData.gift_address as string | null,
            tier: incomingData.tier as string | null,
            active: incomingData.active as boolean ?? true,
            sync_source: 'flex',
            flex_lender_id: request.source_lender_id,
            last_synced_from_flex: new Date().toISOString(),
          });

        if (insertError) throw insertError;
      } else if (request.request_type === 'update_existing' && request.existing_lender_id) {
        // Apply the incoming changes to the existing lender
        const incomingData = request.incoming_data as Record<string, unknown>;
        const { error: updateError } = await supabase
          .from('master_lenders')
          .update({
            email: incomingData.email as string | null,
            lender_type: incomingData.lender_type as string | null,
            loan_types: incomingData.loan_types as string[] | null,
            sub_debt: incomingData.sub_debt as string | null,
            cash_burn: incomingData.cash_burn as string | null,
            sponsorship: incomingData.sponsorship as string | null,
            min_revenue: incomingData.min_revenue as number | null,
            ebitda_min: incomingData.ebitda_min as number | null,
            min_deal: incomingData.min_deal as number | null,
            max_deal: incomingData.max_deal as number | null,
            industries: incomingData.industries as string[] | null,
            industries_to_avoid: incomingData.industries_to_avoid as string[] | null,
            b2b_b2c: incomingData.b2b_b2c as string | null,
            refinancing: incomingData.refinancing as string | null,
            company_requirements: incomingData.company_requirements as string | null,
            deal_structure_notes: incomingData.deal_structure_notes as string | null,
            geo: incomingData.geo as string | null,
            contact_name: incomingData.contact_name as string | null,
            contact_title: incomingData.contact_title as string | null,
            relationship_owners: incomingData.relationship_owners as string | null,
            lender_one_pager_url: incomingData.lender_one_pager_url as string | null,
            referral_lender: incomingData.referral_lender as string | null,
            referral_fee_offered: incomingData.referral_fee_offered as string | null,
            referral_agreement: incomingData.referral_agreement as string | null,
            nda: incomingData.nda as string | null,
            onboarded_to_flex: incomingData.onboarded_to_flex as string | null,
            upfront_checklist: incomingData.upfront_checklist as string | null,
            post_term_sheet_checklist: incomingData.post_term_sheet_checklist as string | null,
            gift_address: incomingData.gift_address as string | null,
            tier: incomingData.tier as string | null,
            active: incomingData.active as boolean ?? true,
            flex_lender_id: request.source_lender_id || undefined,
            last_synced_from_flex: new Date().toISOString(),
          })
          .eq('id', request.existing_lender_id);

        if (updateError) throw updateError;
      }

      // Update the request status
      const { error: statusError } = await supabase
        .from('lender_sync_requests')
        .update({
          status: 'approved',
          processed_by: userData.user.id,
          processed_at: new Date().toISOString(),
          processing_notes: notes || null,
        })
        .eq('id', id);

      if (statusError) throw statusError;

      await fetchRequests();
      return true;
    } catch (err) {
      console.error('Error approving request:', err);
      return false;
    }
  };

  const rejectRequest = async (id: string, notes?: string): Promise<boolean> => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('lender_sync_requests')
        .update({
          status: 'rejected',
          processed_by: userData.user.id,
          processed_at: new Date().toISOString(),
          processing_notes: notes || null,
        })
        .eq('id', id);

      if (error) throw error;

      await fetchRequests();
      return true;
    } catch (err) {
      console.error('Error rejecting request:', err);
      return false;
    }
  };

  const mergeRequest = async (
    id: string,
    mergedData: Record<string, unknown>,
    notes?: string
  ): Promise<boolean> => {
    try {
      const request = requests.find(r => r.id === id);
      if (!request || !request.existing_lender_id) throw new Error('Request not found');

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      // Update the existing lender with merged data
      const { error: updateError } = await supabase
        .from('master_lenders')
        .update({
          ...mergedData,
          flex_lender_id: request.source_lender_id || undefined,
          last_synced_from_flex: new Date().toISOString(),
        })
        .eq('id', request.existing_lender_id);

      if (updateError) throw updateError;

      // Update the request status
      const { error: statusError } = await supabase
        .from('lender_sync_requests')
        .update({
          status: 'merged',
          processed_by: userData.user.id,
          processed_at: new Date().toISOString(),
          processing_notes: notes || null,
        })
        .eq('id', id);

      if (statusError) throw statusError;

      await fetchRequests();
      return true;
    } catch (err) {
      console.error('Error merging request:', err);
      return false;
    }
  };

  return {
    requests,
    pendingCount,
    loading,
    error,
    refetch: fetchRequests,
    approveRequest,
    rejectRequest,
    mergeRequest,
  };
}
