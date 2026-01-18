import { useCallback } from 'react';
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

// Helper function to call the edge function with action-based routing
async function hubspotRequest<T>(action: string, params?: Record<string, any>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('hubspot-sync', {
    body: { action, ...params },
  });

  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data as T;
}

// Separate hooks for data fetching - these should be called directly in components
export function useHubSpotContacts(limit = 100) {
  return useQuery({
    queryKey: ['hubspot', 'contacts', limit],
    queryFn: () => hubspotRequest<PaginatedResponse<HubSpotContact>>('getContacts', { limit }),
    staleTime: 1000 * 60 * 5,
  });
}

export function useHubSpotContact(contactId: string) {
  return useQuery({
    queryKey: ['hubspot', 'contacts', contactId],
    queryFn: () => hubspotRequest<HubSpotContact>('getContact', { contactId }),
    enabled: !!contactId,
  });
}

export function useHubSpotDeals(limit = 100) {
  return useQuery({
    queryKey: ['hubspot', 'deals', limit],
    queryFn: () => hubspotRequest<PaginatedResponse<HubSpotDeal>>('getDeals', { limit }),
    staleTime: 1000 * 60 * 5,
  });
}

export function useHubSpotDeal(dealId: string) {
  return useQuery({
    queryKey: ['hubspot', 'deals', dealId],
    queryFn: () => hubspotRequest<HubSpotDeal>('getDeal', { dealId }),
    enabled: !!dealId,
  });
}

export function useHubSpotPipelines() {
  return useQuery({
    queryKey: ['hubspot', 'pipelines'],
    queryFn: () => hubspotRequest<{ results: HubSpotPipeline[] }>('getPipelines'),
    staleTime: 1000 * 60 * 30,
  });
}

export function useHubSpotCompanies(limit = 100) {
  return useQuery({
    queryKey: ['hubspot', 'companies', limit],
    queryFn: () => hubspotRequest<PaginatedResponse<HubSpotCompany>>('getCompanies', { limit }),
    staleTime: 1000 * 60 * 5,
  });
}

export function useHubSpotCompany(companyId: string) {
  return useQuery({
    queryKey: ['hubspot', 'companies', companyId],
    queryFn: () => hubspotRequest<HubSpotCompany>('getCompany', { companyId }),
    enabled: !!companyId,
  });
}

export function useHubSpotNotes(limit = 100) {
  return useQuery({
    queryKey: ['hubspot', 'notes', limit],
    queryFn: () => hubspotRequest<PaginatedResponse<HubSpotNote>>('getNotes', { limit }),
    staleTime: 1000 * 60 * 5,
  });
}

// Main hook for mutations and utility functions
export function useHubSpot() {
  const queryClient = useQueryClient();

  // Test connection
  const testConnection = useCallback(async () => {
    return hubspotRequest<{ success: boolean }>('test');
  }, []);

  // Search functions
  const searchContacts = useCallback((query: string) => 
    hubspotRequest<PaginatedResponse<HubSpotContact>>('searchContacts', { query }),
  []);

  const searchDeals = useCallback((query: string) =>
    hubspotRequest<PaginatedResponse<HubSpotDeal>>('searchDeals', { query }),
  []);

  const searchCompanies = useCallback((query: string) =>
    hubspotRequest<PaginatedResponse<HubSpotCompany>>('searchCompanies', { query }),
  []);

  // Mutations
  const createContact = useMutation({
    mutationFn: (properties: Record<string, string>) => 
      hubspotRequest<HubSpotContact>('createContact', { properties }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubspot', 'contacts'] });
      toast.success('Contact created in HubSpot');
    },
    onError: (error: Error) => {
      toast.error('Failed to create contact', { description: error.message });
    },
  });

  const updateContact = useMutation({
    mutationFn: ({ contactId, properties }: { contactId: string; properties: Record<string, string> }) =>
      hubspotRequest<HubSpotContact>('updateContact', { contactId, properties }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubspot', 'contacts'] });
      toast.success('Contact updated in HubSpot');
    },
    onError: (error: Error) => {
      toast.error('Failed to update contact', { description: error.message });
    },
  });

  const createDeal = useMutation({
    mutationFn: (properties: Record<string, string>) =>
      hubspotRequest<HubSpotDeal>('createDeal', { properties }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubspot', 'deals'] });
      toast.success('Deal created in HubSpot');
    },
    onError: (error: Error) => {
      toast.error('Failed to create deal', { description: error.message });
    },
  });

  const updateDeal = useMutation({
    mutationFn: ({ dealId, properties }: { dealId: string; properties: Record<string, string> }) =>
      hubspotRequest<HubSpotDeal>('updateDeal', { dealId, properties }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubspot', 'deals'] });
      toast.success('Deal updated in HubSpot');
    },
    onError: (error: Error) => {
      toast.error('Failed to update deal', { description: error.message });
    },
  });

  const createCompany = useMutation({
    mutationFn: (properties: Record<string, string>) =>
      hubspotRequest<HubSpotCompany>('createCompany', { properties }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubspot', 'companies'] });
      toast.success('Company created in HubSpot');
    },
    onError: (error: Error) => {
      toast.error('Failed to create company', { description: error.message });
    },
  });

  const updateCompany = useMutation({
    mutationFn: ({ companyId, properties }: { companyId: string; properties: Record<string, string> }) =>
      hubspotRequest<HubSpotCompany>('updateCompany', { companyId, properties }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubspot', 'companies'] });
      toast.success('Company updated in HubSpot');
    },
    onError: (error: Error) => {
      toast.error('Failed to update company', { description: error.message });
    },
  });

  const logActivity = useMutation({
    mutationFn: ({ objectType, objectId, noteBody }: { 
      objectType: 'contacts' | 'deals' | 'companies'; 
      objectId: string; 
      noteBody: string;
    }) => hubspotRequest<HubSpotNote>('logActivity', { objectType, objectId, noteBody }),
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

    // Search
    searchContacts,
    searchDeals,
    searchCompanies,

    // Mutations
    createContact,
    updateContact,
    createDeal,
    updateDeal,
    createCompany,
    updateCompany,
    logActivity,
  };
}
