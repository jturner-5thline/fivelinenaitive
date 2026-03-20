import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useAuth } from '@/contexts/AuthContext';
import type { VdrIrlRequest } from '@/components/vdr/types';
import { toast } from 'sonner';

export type IrlStatus = VdrIrlRequest['status'];

export function useVdrIrlRequests(dealId: string) {
  const { user } = useAuth();
  const { company } = useCompany();
  const [requests, setRequests] = useState<VdrIrlRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRequests = useCallback(async () => {
    if (!dealId || !company?.id) return;
    const { data, error } = await (supabase as any)
      .from('vdr_irl_requests')
      .select('*')
      .eq('deal_id', dealId)
      .eq('company_id', company.id)
      .order('request_number', { ascending: true });

    if (error) {
      console.error('Error fetching IRL requests:', error);
      return;
    }
    setRequests(data || []);
    setLoading(false);
  }, [dealId, company?.id]);

  useEffect(() => {
    if (dealId && company?.id) fetchRequests();
  }, [dealId, company?.id, fetchRequests]);

  const addRequest = useCallback(async (req: {
    request_number?: string;
    request_name: string;
    description?: string;
    category?: string;
    status?: IrlStatus;
  }) => {
    if (!dealId || !company?.id) return;
    const { error } = await (supabase as any).from('vdr_irl_requests').insert({
      deal_id: dealId,
      company_id: company.id,
      request_number: req.request_number || null,
      request_name: req.request_name,
      description: req.description || null,
      category: req.category || null,
      status: req.status || 'open',
      created_by: user?.id,
    });
    if (error) { toast.error('Failed to add request'); return; }
    await fetchRequests();
    toast.success('Request added');
  }, [dealId, company?.id, user?.id, fetchRequests]);

  const updateRequest = useCallback(async (id: string, updates: Partial<Pick<VdrIrlRequest, 'request_number' | 'request_name' | 'description' | 'category' | 'status'>>) => {
    const { error } = await (supabase as any).from('vdr_irl_requests').update(updates).eq('id', id);
    if (error) { toast.error('Failed to update'); return; }
    await fetchRequests();
  }, [fetchRequests]);

  const deleteRequest = useCallback(async (id: string) => {
    const { error } = await (supabase as any).from('vdr_irl_requests').delete().eq('id', id);
    if (error) { toast.error('Failed to delete'); return; }
    await fetchRequests();
    toast.success('Request deleted');
  }, [fetchRequests]);

  const bulkUpdateStatus = useCallback(async (ids: string[], status: IrlStatus) => {
    for (const id of ids) {
      await (supabase as any).from('vdr_irl_requests').update({ status }).eq('id', id);
    }
    await fetchRequests();
    toast.success(`Updated ${ids.length} request(s)`);
  }, [fetchRequests]);

  const importFromCsv = useCallback(async (rows: Array<{
    request_number?: string;
    request_name: string;
    description?: string;
    category?: string;
    status?: string;
  }>) => {
    if (!dealId || !company?.id) return;
    const inserts = rows.map(r => ({
      deal_id: dealId,
      company_id: company.id,
      request_number: r.request_number || null,
      request_name: r.request_name,
      description: r.description || null,
      category: r.category || null,
      status: (['open', 'addressed', 'pending_review'].includes(r.status?.toLowerCase() || '') ? r.status!.toLowerCase() : 'open') as IrlStatus,
      created_by: user?.id,
    }));
    const { error } = await (supabase as any).from('vdr_irl_requests').insert(inserts);
    if (error) { toast.error('Import failed'); console.error(error); return; }
    await fetchRequests();
    toast.success(`Imported ${inserts.length} request(s)`);
  }, [dealId, company?.id, user?.id, fetchRequests]);

  const counts = {
    total: requests.length,
    open: requests.filter(r => r.status === 'open').length,
    addressed: requests.filter(r => r.status === 'addressed').length,
    pending: requests.filter(r => r.status === 'pending_review').length,
  };

  return { requests, loading, counts, addRequest, updateRequest, deleteRequest, bulkUpdateStatus, importFromCsv, refetch: fetchRequests };
}
