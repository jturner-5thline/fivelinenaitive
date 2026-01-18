import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// Types
export interface HubSpotContact {
  id: string;
  properties: {
    email?: string;
    firstname?: string;
    lastname?: string;
    phone?: string;
    company?: string;
    jobtitle?: string;
    createdate?: string;
    lastmodifieddate?: string;
  };
}

export interface HubSpotDeal {
  id: string;
  properties: {
    dealname?: string;
    amount?: string;
    dealstage?: string;
    pipeline?: string;
    closedate?: string;
    createdate?: string;
    hs_lastmodifieddate?: string;
  };
  associations?: {
    contacts?: { results: Array<{ id: string }> };
    companies?: { results: Array<{ id: string }> };
  };
}

export interface HubSpotCompany {
  id: string;
  properties: {
    name?: string;
    domain?: string;
    industry?: string;
    phone?: string;
    city?: string;
    state?: string;
    country?: string;
    description?: string;
    numberofemployees?: string;
    annualrevenue?: string;
  };
}

export interface HubSpotNote {
  id: string;
  properties: {
    hs_note_body?: string;
    hs_timestamp?: string;
    hs_lastmodifieddate?: string;
  };
}

export interface HubSpotPipeline {
  id: string;
  label: string;
  stages: Array<{
    id: string;
    label: string;
    displayOrder: number;
  }>;
}

interface PaginatedResponse<T> {
  results: T[];
  paging?: {
    next?: {
      after: string;
    };
  };
}

// Helper function to call the edge function
async function hubspotFetch<T>(
  path: string,
  method: string = 'GET',
  body?: any
): Promise<T> {
  const { data, error } = await supabase.functions.invoke('hubspot-sync', {
    method: method as 'GET' | 'POST' | 'PATCH' | 'DELETE',
    body: method === 'GET' ? undefined : body,
    headers: {
      'x-path': path,
    },
  });

  // For GET requests with query params, we need to use a different approach
  if (method === 'GET') {
    const response = await supabase.functions.invoke(`hubspot-sync/${path}`, {
      method: 'GET',
    });
    if (response.error) throw new Error(response.error.message);
    return response.data as T;
  }

  if (error) throw new Error(error.message);
  return data as T;
}

// POST/PATCH helper
async function hubspotMutate<T>(
  path: string,
  method: 'POST' | 'PATCH',
  body: any
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(`hubspot-sync/${path}`, {
    method,
    body,
  });

  if (error) throw new Error(error.message);
  return data as T;
}

export function useHubSpot() {
  const queryClient = useQueryClient();

  // Test connection
  const testConnection = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke('hubspot-sync/test');
    if (error) throw new Error(error.message);
    return data;
  }, []);

  // ===== CONTACTS =====
  
  const useContacts = (limit = 100) => {
    return useQuery({
      queryKey: ['hubspot', 'contacts', limit],
      queryFn: async () => {
        const { data, error } = await supabase.functions.invoke(`hubspot-sync/contacts?limit=${limit}`);
        if (error) throw new Error(error.message);
        return data as PaginatedResponse<HubSpotContact>;
      },
      staleTime: 1000 * 60 * 5, // 5 minutes
    });
  };

  const useContact = (contactId: string) => {
    return useQuery({
      queryKey: ['hubspot', 'contacts', contactId],
      queryFn: async () => {
        const { data, error } = await supabase.functions.invoke(`hubspot-sync/contacts/${contactId}`);
        if (error) throw new Error(error.message);
        return data as HubSpotContact;
      },
      enabled: !!contactId,
    });
  };

  const createContact = useMutation({
    mutationFn: async (contact: { properties: Record<string, string> }) => {
      return hubspotMutate<HubSpotContact>('contacts', 'POST', contact);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubspot', 'contacts'] });
      toast.success('Contact created in HubSpot');
    },
    onError: (error: Error) => {
      toast.error('Failed to create contact', { description: error.message });
    },
  });

  const updateContact = useMutation({
    mutationFn: async ({ contactId, properties }: { contactId: string; properties: Record<string, string> }) => {
      return hubspotMutate<HubSpotContact>(`contacts/${contactId}`, 'PATCH', { properties });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubspot', 'contacts'] });
      toast.success('Contact updated in HubSpot');
    },
    onError: (error: Error) => {
      toast.error('Failed to update contact', { description: error.message });
    },
  });

  const searchContacts = useCallback(async (query: string) => {
    const { data, error } = await supabase.functions.invoke(`hubspot-sync/contacts/search?query=${encodeURIComponent(query)}`);
    if (error) throw new Error(error.message);
    return data as PaginatedResponse<HubSpotContact>;
  }, []);

  // ===== DEALS =====

  const useDeals = (limit = 100) => {
    return useQuery({
      queryKey: ['hubspot', 'deals', limit],
      queryFn: async () => {
        const { data, error } = await supabase.functions.invoke(`hubspot-sync/deals?limit=${limit}`);
        if (error) throw new Error(error.message);
        return data as PaginatedResponse<HubSpotDeal>;
      },
      staleTime: 1000 * 60 * 5,
    });
  };

  const useDeal = (dealId: string) => {
    return useQuery({
      queryKey: ['hubspot', 'deals', dealId],
      queryFn: async () => {
        const { data, error } = await supabase.functions.invoke(`hubspot-sync/deals/${dealId}`);
        if (error) throw new Error(error.message);
        return data as HubSpotDeal;
      },
      enabled: !!dealId,
    });
  };

  const usePipelines = () => {
    return useQuery({
      queryKey: ['hubspot', 'pipelines'],
      queryFn: async () => {
        const { data, error } = await supabase.functions.invoke('hubspot-sync/deals/pipelines');
        if (error) throw new Error(error.message);
        return data as { results: HubSpotPipeline[] };
      },
      staleTime: 1000 * 60 * 30, // 30 minutes
    });
  };

  const createDeal = useMutation({
    mutationFn: async (deal: { properties: Record<string, string> }) => {
      return hubspotMutate<HubSpotDeal>('deals', 'POST', deal);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubspot', 'deals'] });
      toast.success('Deal created in HubSpot');
    },
    onError: (error: Error) => {
      toast.error('Failed to create deal', { description: error.message });
    },
  });

  const updateDeal = useMutation({
    mutationFn: async ({ dealId, properties }: { dealId: string; properties: Record<string, string> }) => {
      return hubspotMutate<HubSpotDeal>(`deals/${dealId}`, 'PATCH', { properties });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubspot', 'deals'] });
      toast.success('Deal updated in HubSpot');
    },
    onError: (error: Error) => {
      toast.error('Failed to update deal', { description: error.message });
    },
  });

  const searchDeals = useCallback(async (query: string) => {
    const { data, error } = await supabase.functions.invoke(`hubspot-sync/deals/search?query=${encodeURIComponent(query)}`);
    if (error) throw new Error(error.message);
    return data as PaginatedResponse<HubSpotDeal>;
  }, []);

  // ===== COMPANIES =====

  const useCompanies = (limit = 100) => {
    return useQuery({
      queryKey: ['hubspot', 'companies', limit],
      queryFn: async () => {
        const { data, error } = await supabase.functions.invoke(`hubspot-sync/companies?limit=${limit}`);
        if (error) throw new Error(error.message);
        return data as PaginatedResponse<HubSpotCompany>;
      },
      staleTime: 1000 * 60 * 5,
    });
  };

  const useCompany = (companyId: string) => {
    return useQuery({
      queryKey: ['hubspot', 'companies', companyId],
      queryFn: async () => {
        const { data, error } = await supabase.functions.invoke(`hubspot-sync/companies/${companyId}`);
        if (error) throw new Error(error.message);
        return data as HubSpotCompany;
      },
      enabled: !!companyId,
    });
  };

  const createCompany = useMutation({
    mutationFn: async (company: { properties: Record<string, string> }) => {
      return hubspotMutate<HubSpotCompany>('companies', 'POST', company);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubspot', 'companies'] });
      toast.success('Company created in HubSpot');
    },
    onError: (error: Error) => {
      toast.error('Failed to create company', { description: error.message });
    },
  });

  const updateCompany = useMutation({
    mutationFn: async ({ companyId, properties }: { companyId: string; properties: Record<string, string> }) => {
      return hubspotMutate<HubSpotCompany>(`companies/${companyId}`, 'PATCH', { properties });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubspot', 'companies'] });
      toast.success('Company updated in HubSpot');
    },
    onError: (error: Error) => {
      toast.error('Failed to update company', { description: error.message });
    },
  });

  const searchCompanies = useCallback(async (query: string) => {
    const { data, error } = await supabase.functions.invoke(`hubspot-sync/companies/search?query=${encodeURIComponent(query)}`);
    if (error) throw new Error(error.message);
    return data as PaginatedResponse<HubSpotCompany>;
  }, []);

  // ===== ACTIVITIES / NOTES =====

  const useNotes = (limit = 100) => {
    return useQuery({
      queryKey: ['hubspot', 'notes', limit],
      queryFn: async () => {
        const { data, error } = await supabase.functions.invoke(`hubspot-sync/notes?limit=${limit}`);
        if (error) throw new Error(error.message);
        return data as PaginatedResponse<HubSpotNote>;
      },
      staleTime: 1000 * 60 * 5,
    });
  };

  const logActivity = useMutation({
    mutationFn: async ({ 
      objectType, 
      objectId, 
      noteBody 
    }: { 
      objectType: 'contacts' | 'deals' | 'companies'; 
      objectId: string; 
      noteBody: string;
    }) => {
      return hubspotMutate<HubSpotNote>('activities', 'POST', { objectType, objectId, noteBody });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubspot', 'notes'] });
      toast.success('Activity logged to HubSpot');
    },
    onError: (error: Error) => {
      toast.error('Failed to log activity', { description: error.message });
    },
  });

  return {
    // Connection
    testConnection,

    // Contacts
    useContacts,
    useContact,
    createContact,
    updateContact,
    searchContacts,

    // Deals
    useDeals,
    useDeal,
    usePipelines,
    createDeal,
    updateDeal,
    searchDeals,

    // Companies
    useCompanies,
    useCompany,
    createCompany,
    updateCompany,
    searchCompanies,

    // Activities
    useNotes,
    logActivity,
  };
}
