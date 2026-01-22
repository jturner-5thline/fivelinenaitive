import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// ===== TYPES =====

export interface HubSpotContact {
  id: string;
  properties: {
    email?: string;
    firstname?: string;
    lastname?: string;
    phone?: string;
    company?: string;
    jobtitle?: string;
    lifecyclestage?: string;
    hs_lead_status?: string;
    hubspot_owner_id?: string;
    associatedcompanyid?: string;
    createdate?: string;
    lastmodifieddate?: string;
    hs_email_domain?: string;
    city?: string;
    state?: string;
    country?: string;
    zip?: string;
    address?: string;
    website?: string;
    industry?: string;
    numemployees?: string;
    annualrevenue?: string;
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
    hubspot_owner_id?: string;
    deal_currency_code?: string;
    hs_priority?: string;
    hs_deal_stage_probability?: string;
    hs_forecast_amount?: string;
    hs_forecast_probability?: string;
    hs_projected_amount?: string;
    notes_last_updated?: string;
    num_associated_contacts?: string;
    num_notes?: string;
    hs_is_closed?: string;
    hs_is_closed_won?: string;
  };
  associations?: {
    contacts?: { results: Array<{ id: string }> };
    companies?: { results: Array<{ id: string }> };
    line_items?: { results: Array<{ id: string }> };
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
    website?: string;
    linkedin_company_page?: string;
    facebook_company_page?: string;
    twitterhandle?: string;
    founded_year?: string;
    total_revenue?: string;
    hs_lead_status?: string;
    lifecyclestage?: string;
    type?: string;
    hubspot_owner_id?: string;
  };
}

export interface HubSpotNote {
  id: string;
  properties: {
    hs_note_body?: string;
    hs_timestamp?: string;
    hs_lastmodifieddate?: string;
    hubspot_owner_id?: string;
  };
}

export interface HubSpotCall {
  id: string;
  properties: {
    hs_call_body?: string;
    hs_call_callee_object_id?: string;
    hs_call_callee_object_type?: string;
    hs_call_direction?: string;
    hs_call_disposition?: string;
    hs_call_duration?: string;
    hs_call_from_number?: string;
    hs_call_recording_url?: string;
    hs_call_status?: string;
    hs_call_title?: string;
    hs_call_to_number?: string;
    hs_timestamp?: string;
    hubspot_owner_id?: string;
    hs_createdate?: string;
  };
  associations?: {
    contacts?: { results: Array<{ id: string }> };
    companies?: { results: Array<{ id: string }> };
    deals?: { results: Array<{ id: string }> };
  };
}

export interface HubSpotEmail {
  id: string;
  properties: {
    hs_email_direction?: string;
    hs_email_sender_email?: string;
    hs_email_sender_firstname?: string;
    hs_email_sender_lastname?: string;
    hs_email_subject?: string;
    hs_email_text?: string;
    hs_email_html?: string;
    hs_email_status?: string;
    hs_timestamp?: string;
    hubspot_owner_id?: string;
    hs_email_to_email?: string;
    hs_email_cc_email?: string;
    hs_email_bcc_email?: string;
  };
  associations?: {
    contacts?: { results: Array<{ id: string }> };
    companies?: { results: Array<{ id: string }> };
    deals?: { results: Array<{ id: string }> };
  };
}

export interface HubSpotMeeting {
  id: string;
  properties: {
    hs_meeting_title?: string;
    hs_meeting_body?: string;
    hs_meeting_start_time?: string;
    hs_meeting_end_time?: string;
    hs_meeting_location?: string;
    hs_meeting_outcome?: string;
    hs_internal_meeting_notes?: string;
    hubspot_owner_id?: string;
    hs_timestamp?: string;
    hs_createdate?: string;
  };
  associations?: {
    contacts?: { results: Array<{ id: string }> };
    companies?: { results: Array<{ id: string }> };
    deals?: { results: Array<{ id: string }> };
  };
}

export interface HubSpotTask {
  id: string;
  properties: {
    hs_task_body?: string;
    hs_task_subject?: string;
    hs_task_status?: string;
    hs_task_priority?: string;
    hs_task_type?: string;
    hs_timestamp?: string;
    hubspot_owner_id?: string;
    hs_task_completion_date?: string;
    hs_task_reminders?: string;
    hs_queue_membership_ids?: string;
  };
  associations?: {
    contacts?: { results: Array<{ id: string }> };
    companies?: { results: Array<{ id: string }> };
    deals?: { results: Array<{ id: string }> };
  };
}

export interface HubSpotTicket {
  id: string;
  properties: {
    subject?: string;
    content?: string;
    hs_ticket_priority?: string;
    hs_pipeline?: string;
    hs_pipeline_stage?: string;
    hs_ticket_category?: string;
    hubspot_owner_id?: string;
    createdate?: string;
    hs_lastmodifieddate?: string;
    closed_date?: string;
    time_to_close?: string;
    time_to_first_agent_reply?: string;
  };
  associations?: {
    contacts?: { results: Array<{ id: string }> };
    companies?: { results: Array<{ id: string }> };
    deals?: { results: Array<{ id: string }> };
  };
}

export interface HubSpotOwner {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  userId: number;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  teams?: Array<{ id: string; name: string }>;
}

export interface HubSpotProduct {
  id: string;
  properties: {
    name?: string;
    description?: string;
    price?: string;
    hs_cost_of_goods_sold?: string;
    hs_recurring_billing_period?: string;
    hs_sku?: string;
    createdate?: string;
    hs_lastmodifieddate?: string;
  };
}

export interface HubSpotLineItem {
  id: string;
  properties: {
    name?: string;
    description?: string;
    price?: string;
    quantity?: string;
    amount?: string;
    discount?: string;
    hs_product_id?: string;
    hs_sku?: string;
    createdate?: string;
  };
  associations?: {
    deals?: { results: Array<{ id: string }> };
  };
}

export interface HubSpotQuote {
  id: string;
  properties: {
    hs_title?: string;
    hs_expiration_date?: string;
    hs_status?: string;
    hs_quote_amount?: string;
    hs_sender_firstname?: string;
    hs_sender_lastname?: string;
    hs_sender_email?: string;
    hs_terms?: string;
    hs_public_url_key?: string;
    createdate?: string;
    hs_lastmodifieddate?: string;
  };
  associations?: {
    deals?: { results: Array<{ id: string }> };
    line_items?: { results: Array<{ id: string }> };
    contacts?: { results: Array<{ id: string }> };
    companies?: { results: Array<{ id: string }> };
  };
}

export interface HubSpotForm {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  fieldGroups: any[];
  configuration: any;
}

export interface HubSpotFormSubmission {
  submittedAt: string;
  values: Array<{ name: string; value: string }>;
  pageUrl?: string;
}

export interface HubSpotMarketingEmail {
  id: number;
  name: string;
  subject: string;
  state: string;
  publishDate: number;
  created: number;
  updated: number;
}

export interface HubSpotCampaign {
  id: string;
  appId: number;
  appName: string;
  contentId: number;
}

export interface HubSpotList {
  listId: number;
  name: string;
  listType: string;
  createdAt: number;
  updatedAt: number;
  metaData: {
    size: number;
    processing: string;
  };
}

export interface HubSpotWorkflow {
  id: number;
  name: string;
  type: string;
  enabled: boolean;
  insertedAt: number;
  updatedAt: number;
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

export interface HubSpotAnalyticsSummary {
  summary: {
    totalContacts: number;
    totalDeals: number;
    totalCompanies: number;
    totalOwners: number;
    totalDealsValue: number;
    openDeals: number;
    closedWonDeals: number;
    openTasks: number;
    openTickets: number;
    dateRange: { startDate: string; endDate: string };
  };
  contacts: HubSpotContact[];
  deals: HubSpotDeal[];
  companies: HubSpotCompany[];
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
async function hubspotRequest<T>(action: string, params?: Record<string, any>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('hubspot-sync', {
    body: { action, ...params },
  });

  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data as T;
}

// ===== CONTACT HOOKS =====

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

// ===== DEAL HOOKS =====

// Fetches ALL deals with pagination (up to 1000)
export function useHubSpotDeals() {
  return useQuery({
    queryKey: ['hubspot', 'deals', 'all'],
    queryFn: () => hubspotRequest<PaginatedResponse<HubSpotDeal>>('getAllDeals'),
    staleTime: 1000 * 60 * 5,
  });
}

// Fetches a limited number of deals (for backward compatibility)
export function useHubSpotDealsLimited(limit = 100) {
  return useQuery({
    queryKey: ['hubspot', 'deals', limit],
    queryFn: () => hubspotRequest<PaginatedResponse<HubSpotDeal>>('getDeals', { limit }),
    staleTime: 1000 * 60 * 5,
  });
}

// Search deals via HubSpot API (for finding deals beyond the 1000 limit)
export function useHubSpotSearchDeals(query: string) {
  return useQuery({
    queryKey: ['hubspot', 'deals', 'search', query],
    queryFn: () => hubspotRequest<PaginatedResponse<HubSpotDeal>>('searchDeals', { query }),
    enabled: query.length >= 2,
    staleTime: 1000 * 60 * 2,
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

// ===== COMPANY HOOKS =====

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

// ===== ENGAGEMENT HOOKS =====

export function useHubSpotNotes(limit = 100) {
  return useQuery({
    queryKey: ['hubspot', 'notes', limit],
    queryFn: () => hubspotRequest<PaginatedResponse<HubSpotNote>>('getNotes', { limit }),
    staleTime: 1000 * 60 * 5,
  });
}

export function useHubSpotCalls(limit = 100) {
  return useQuery({
    queryKey: ['hubspot', 'calls', limit],
    queryFn: () => hubspotRequest<PaginatedResponse<HubSpotCall>>('getCalls', { limit }),
    staleTime: 1000 * 60 * 5,
  });
}

export function useHubSpotCall(callId: string) {
  return useQuery({
    queryKey: ['hubspot', 'calls', callId],
    queryFn: () => hubspotRequest<HubSpotCall>('getCall', { callId }),
    enabled: !!callId,
  });
}

export function useHubSpotEmails(limit = 100) {
  return useQuery({
    queryKey: ['hubspot', 'emails', limit],
    queryFn: () => hubspotRequest<PaginatedResponse<HubSpotEmail>>('getEmails', { limit }),
    staleTime: 1000 * 60 * 5,
  });
}

export function useHubSpotEmail(emailId: string) {
  return useQuery({
    queryKey: ['hubspot', 'emails', emailId],
    queryFn: () => hubspotRequest<HubSpotEmail>('getEmail', { emailId }),
    enabled: !!emailId,
  });
}

export function useHubSpotMeetings(limit = 100) {
  return useQuery({
    queryKey: ['hubspot', 'meetings', limit],
    queryFn: () => hubspotRequest<PaginatedResponse<HubSpotMeeting>>('getMeetings', { limit }),
    staleTime: 1000 * 60 * 5,
  });
}

export function useHubSpotMeeting(meetingId: string) {
  return useQuery({
    queryKey: ['hubspot', 'meetings', meetingId],
    queryFn: () => hubspotRequest<HubSpotMeeting>('getMeeting', { meetingId }),
    enabled: !!meetingId,
  });
}

export function useHubSpotTasks(limit = 100) {
  return useQuery({
    queryKey: ['hubspot', 'tasks', limit],
    queryFn: () => hubspotRequest<PaginatedResponse<HubSpotTask>>('getTasks', { limit }),
    staleTime: 1000 * 60 * 5,
  });
}

export function useHubSpotTask(taskId: string) {
  return useQuery({
    queryKey: ['hubspot', 'tasks', taskId],
    queryFn: () => hubspotRequest<HubSpotTask>('getTask', { taskId }),
    enabled: !!taskId,
  });
}

// ===== TICKET HOOKS =====

export function useHubSpotTickets(limit = 100) {
  return useQuery({
    queryKey: ['hubspot', 'tickets', limit],
    queryFn: () => hubspotRequest<PaginatedResponse<HubSpotTicket>>('getTickets', { limit }),
    staleTime: 1000 * 60 * 5,
  });
}

export function useHubSpotTicket(ticketId: string) {
  return useQuery({
    queryKey: ['hubspot', 'tickets', ticketId],
    queryFn: () => hubspotRequest<HubSpotTicket>('getTicket', { ticketId }),
    enabled: !!ticketId,
  });
}

export function useHubSpotTicketPipelines() {
  return useQuery({
    queryKey: ['hubspot', 'ticketPipelines'],
    queryFn: () => hubspotRequest<{ results: HubSpotPipeline[] }>('getTicketPipelines'),
    staleTime: 1000 * 60 * 30,
  });
}

// ===== OWNER HOOKS =====

export function useHubSpotOwners(limit = 100) {
  return useQuery({
    queryKey: ['hubspot', 'owners', limit],
    queryFn: () => hubspotRequest<{ results: HubSpotOwner[] }>('getOwners', { limit }),
    staleTime: 1000 * 60 * 30,
  });
}

export function useHubSpotOwner(ownerId: string) {
  return useQuery({
    queryKey: ['hubspot', 'owners', ownerId],
    queryFn: () => hubspotRequest<HubSpotOwner>('getOwner', { ownerId }),
    enabled: !!ownerId,
  });
}

// ===== PRODUCT HOOKS =====

export function useHubSpotProducts(limit = 100) {
  return useQuery({
    queryKey: ['hubspot', 'products', limit],
    queryFn: () => hubspotRequest<PaginatedResponse<HubSpotProduct>>('getProducts', { limit }),
    staleTime: 1000 * 60 * 5,
  });
}

export function useHubSpotProduct(productId: string) {
  return useQuery({
    queryKey: ['hubspot', 'products', productId],
    queryFn: () => hubspotRequest<HubSpotProduct>('getProduct', { productId }),
    enabled: !!productId,
  });
}

// ===== LINE ITEM HOOKS =====

export function useHubSpotLineItems(limit = 100) {
  return useQuery({
    queryKey: ['hubspot', 'lineItems', limit],
    queryFn: () => hubspotRequest<PaginatedResponse<HubSpotLineItem>>('getLineItems', { limit }),
    staleTime: 1000 * 60 * 5,
  });
}

export function useHubSpotLineItem(lineItemId: string) {
  return useQuery({
    queryKey: ['hubspot', 'lineItems', lineItemId],
    queryFn: () => hubspotRequest<HubSpotLineItem>('getLineItem', { lineItemId }),
    enabled: !!lineItemId,
  });
}

export function useHubSpotDealLineItems(dealId: string) {
  return useQuery({
    queryKey: ['hubspot', 'dealLineItems', dealId],
    queryFn: () => hubspotRequest<{ results: Array<{ id: string }> }>('getDealLineItems', { dealId }),
    enabled: !!dealId,
  });
}

// ===== QUOTE HOOKS =====

export function useHubSpotQuotes(limit = 100) {
  return useQuery({
    queryKey: ['hubspot', 'quotes', limit],
    queryFn: () => hubspotRequest<PaginatedResponse<HubSpotQuote>>('getQuotes', { limit }),
    staleTime: 1000 * 60 * 5,
  });
}

export function useHubSpotQuote(quoteId: string) {
  return useQuery({
    queryKey: ['hubspot', 'quotes', quoteId],
    queryFn: () => hubspotRequest<HubSpotQuote>('getQuote', { quoteId }),
    enabled: !!quoteId,
  });
}

// ===== FORM HOOKS =====

export function useHubSpotForms() {
  return useQuery({
    queryKey: ['hubspot', 'forms'],
    queryFn: () => hubspotRequest<{ results: HubSpotForm[] }>('getForms'),
    staleTime: 1000 * 60 * 10,
  });
}

export function useHubSpotForm(formId: string) {
  return useQuery({
    queryKey: ['hubspot', 'forms', formId],
    queryFn: () => hubspotRequest<HubSpotForm>('getForm', { formId }),
    enabled: !!formId,
  });
}

export function useHubSpotFormSubmissions(formId: string, limit = 50) {
  return useQuery({
    queryKey: ['hubspot', 'formSubmissions', formId, limit],
    queryFn: () => hubspotRequest<{ results: HubSpotFormSubmission[] }>('getFormSubmissions', { formId, limit }),
    enabled: !!formId,
    staleTime: 1000 * 60 * 5,
  });
}

// ===== MARKETING EMAIL HOOKS =====

export function useHubSpotMarketingEmails(limit = 100) {
  return useQuery({
    queryKey: ['hubspot', 'marketingEmails', limit],
    queryFn: () => hubspotRequest<{ objects: HubSpotMarketingEmail[] }>('getMarketingEmails', { limit }),
    staleTime: 1000 * 60 * 10,
  });
}

export function useHubSpotMarketingEmail(emailId: string) {
  return useQuery({
    queryKey: ['hubspot', 'marketingEmails', emailId],
    queryFn: () => hubspotRequest<HubSpotMarketingEmail>('getMarketingEmail', { emailId }),
    enabled: !!emailId,
  });
}

export function useHubSpotMarketingEmailStats(emailId: string) {
  return useQuery({
    queryKey: ['hubspot', 'marketingEmailStats', emailId],
    queryFn: () => hubspotRequest<any>('getMarketingEmailStats', { emailId }),
    enabled: !!emailId,
  });
}

// ===== CAMPAIGN HOOKS =====

export function useHubSpotCampaigns() {
  return useQuery({
    queryKey: ['hubspot', 'campaigns'],
    queryFn: () => hubspotRequest<{ campaigns: HubSpotCampaign[] }>('getCampaigns'),
    staleTime: 1000 * 60 * 10,
  });
}

export function useHubSpotCampaign(campaignId: string) {
  return useQuery({
    queryKey: ['hubspot', 'campaigns', campaignId],
    queryFn: () => hubspotRequest<HubSpotCampaign>('getCampaign', { campaignId }),
    enabled: !!campaignId,
  });
}

// ===== LIST HOOKS =====

export function useHubSpotLists(limit = 100) {
  return useQuery({
    queryKey: ['hubspot', 'lists', limit],
    queryFn: () => hubspotRequest<{ lists: HubSpotList[] }>('getLists', { limit }),
    staleTime: 1000 * 60 * 10,
  });
}

export function useHubSpotList(listId: string) {
  return useQuery({
    queryKey: ['hubspot', 'lists', listId],
    queryFn: () => hubspotRequest<HubSpotList>('getList', { listId }),
    enabled: !!listId,
  });
}

export function useHubSpotListContacts(listId: string, limit = 100) {
  return useQuery({
    queryKey: ['hubspot', 'listContacts', listId, limit],
    queryFn: () => hubspotRequest<{ contacts: any[] }>('getListContacts', { listId, limit }),
    enabled: !!listId,
    staleTime: 1000 * 60 * 5,
  });
}

// ===== WORKFLOW HOOKS =====

export function useHubSpotWorkflows() {
  return useQuery({
    queryKey: ['hubspot', 'workflows'],
    queryFn: () => hubspotRequest<{ workflows: HubSpotWorkflow[] }>('getWorkflows'),
    staleTime: 1000 * 60 * 10,
  });
}

export function useHubSpotWorkflow(workflowId: string) {
  return useQuery({
    queryKey: ['hubspot', 'workflows', workflowId],
    queryFn: () => hubspotRequest<HubSpotWorkflow>('getWorkflow', { workflowId }),
    enabled: !!workflowId,
  });
}

// ===== PROPERTY HOOKS =====

export function useHubSpotProperties(objectType: string) {
  return useQuery({
    queryKey: ['hubspot', 'properties', objectType],
    queryFn: () => hubspotRequest<{ results: any[] }>('getProperties', { objectType }),
    enabled: !!objectType,
    staleTime: 1000 * 60 * 30,
  });
}

// ===== ANALYTICS HOOKS =====

export function useHubSpotAnalyticsSummary() {
  return useQuery({
    queryKey: ['hubspot', 'analyticsSummary'],
    queryFn: () => hubspotRequest<HubSpotAnalyticsSummary>('getAnalyticsSummary'),
    staleTime: 1000 * 60 * 5,
  });
}

// ===== MAIN HOOK FOR MUTATIONS AND UTILITIES =====

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

  // Get associations
  const getAssociations = useCallback((fromObjectType: string, fromObjectId: string, toObjectType: string) =>
    hubspotRequest<{ results: Array<{ toObjectId: string }> }>('getAssociations', { fromObjectType, fromObjectId, toObjectType }),
  []);

  // Contact mutations
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

  // Deal mutations
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

  // Company mutations
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

  // Task mutations
  const createTask = useMutation({
    mutationFn: (properties: Record<string, string>) =>
      hubspotRequest<HubSpotTask>('createTask', { properties }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubspot', 'tasks'] });
      toast.success('Task created in HubSpot');
    },
    onError: (error: Error) => {
      toast.error('Failed to create task', { description: error.message });
    },
  });

  const updateTask = useMutation({
    mutationFn: ({ taskId, properties }: { taskId: string; properties: Record<string, string> }) =>
      hubspotRequest<HubSpotTask>('updateTask', { taskId, properties }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubspot', 'tasks'] });
      toast.success('Task updated in HubSpot');
    },
    onError: (error: Error) => {
      toast.error('Failed to update task', { description: error.message });
    },
  });

  // Ticket mutations
  const createTicket = useMutation({
    mutationFn: (properties: Record<string, string>) =>
      hubspotRequest<HubSpotTicket>('createTicket', { properties }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubspot', 'tickets'] });
      toast.success('Ticket created in HubSpot');
    },
    onError: (error: Error) => {
      toast.error('Failed to create ticket', { description: error.message });
    },
  });

  const updateTicket = useMutation({
    mutationFn: ({ ticketId, properties }: { ticketId: string; properties: Record<string, string> }) =>
      hubspotRequest<HubSpotTicket>('updateTicket', { ticketId, properties }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubspot', 'tickets'] });
      toast.success('Ticket updated in HubSpot');
    },
    onError: (error: Error) => {
      toast.error('Failed to update ticket', { description: error.message });
    },
  });

  // Product mutations
  const createProduct = useMutation({
    mutationFn: (properties: Record<string, string>) =>
      hubspotRequest<HubSpotProduct>('createProduct', { properties }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubspot', 'products'] });
      toast.success('Product created in HubSpot');
    },
    onError: (error: Error) => {
      toast.error('Failed to create product', { description: error.message });
    },
  });

  const updateProduct = useMutation({
    mutationFn: ({ productId, properties }: { productId: string; properties: Record<string, string> }) =>
      hubspotRequest<HubSpotProduct>('updateProduct', { productId, properties }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubspot', 'products'] });
      toast.success('Product updated in HubSpot');
    },
    onError: (error: Error) => {
      toast.error('Failed to update product', { description: error.message });
    },
  });

  // Engagement mutations
  const createCall = useMutation({
    mutationFn: (properties: Record<string, string>) =>
      hubspotRequest<HubSpotCall>('createCall', { properties }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubspot', 'calls'] });
      toast.success('Call logged in HubSpot');
    },
    onError: (error: Error) => {
      toast.error('Failed to log call', { description: error.message });
    },
  });

  const createEmail = useMutation({
    mutationFn: (properties: Record<string, string>) =>
      hubspotRequest<HubSpotEmail>('createEmail', { properties }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubspot', 'emails'] });
      toast.success('Email logged in HubSpot');
    },
    onError: (error: Error) => {
      toast.error('Failed to log email', { description: error.message });
    },
  });

  const createMeeting = useMutation({
    mutationFn: (properties: Record<string, string>) =>
      hubspotRequest<HubSpotMeeting>('createMeeting', { properties }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubspot', 'meetings'] });
      toast.success('Meeting created in HubSpot');
    },
    onError: (error: Error) => {
      toast.error('Failed to create meeting', { description: error.message });
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

  // Association mutation
  const createAssociation = useMutation({
    mutationFn: ({ fromObjectType, fromObjectId, toObjectType, toObjectId, associationTypeId }: {
      fromObjectType: string;
      fromObjectId: string;
      toObjectType: string;
      toObjectId: string;
      associationTypeId: number;
    }) => hubspotRequest<any>('createAssociation', { fromObjectType, fromObjectId, toObjectType, toObjectId, associationTypeId }),
    onSuccess: () => {
      toast.success('Association created in HubSpot');
    },
    onError: (error: Error) => {
      toast.error('Failed to create association', { description: error.message });
    },
  });

  return {
    // Connection
    testConnection,

    // Search
    searchContacts,
    searchDeals,
    searchCompanies,
    getAssociations,

    // Contact mutations
    createContact,
    updateContact,

    // Deal mutations
    createDeal,
    updateDeal,

    // Company mutations
    createCompany,
    updateCompany,

    // Task mutations
    createTask,
    updateTask,

    // Ticket mutations
    createTicket,
    updateTicket,

    // Product mutations
    createProduct,
    updateProduct,

    // Engagement mutations
    createCall,
    createEmail,
    createMeeting,
    logActivity,

    // Association mutations
    createAssociation,
  };
}