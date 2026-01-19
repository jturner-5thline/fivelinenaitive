const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

async function hubspotRequest(
  endpoint: string,
  method: string = 'GET',
  body?: any
): Promise<any> {
  const accessToken = Deno.env.get('HUBSPOT_ACCESS_TOKEN');
  
  if (!accessToken) {
    throw new Error('HUBSPOT_ACCESS_TOKEN is not configured');
  }

  const url = `${HUBSPOT_API_BASE}${endpoint}`;
  
  console.log(`HubSpot API request: ${method} ${url}`);
  
  const options: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const responseText = await response.text();
  
  console.log(`HubSpot API response status: ${response.status}`);
  
  if (!response.ok) {
    console.error(`HubSpot API error: ${responseText}`);
    throw new Error(`HubSpot API error: ${response.status} - ${responseText}`);
  }

  return responseText ? JSON.parse(responseText) : null;
}

// ===== CONTACTS =====

async function getContacts(limit: number = 100, after?: string): Promise<any> {
  let endpoint = `/crm/v3/objects/contacts?limit=${limit}&properties=email,firstname,lastname,phone,company,jobtitle,lifecyclestage,hs_lead_status,hubspot_owner_id,associatedcompanyid,createdate,lastmodifieddate,hs_email_domain,city,state,country,zip,address,website,industry,numemployees,annualrevenue`;
  if (after) {
    endpoint += `&after=${after}`;
  }
  return hubspotRequest(endpoint);
}

async function getContact(contactId: string): Promise<any> {
  return hubspotRequest(`/crm/v3/objects/contacts/${contactId}?properties=email,firstname,lastname,phone,company,jobtitle,lifecyclestage,hs_lead_status,hubspot_owner_id,associatedcompanyid,createdate,lastmodifieddate,hs_email_domain,city,state,country,zip,address,website,industry,numemployees,annualrevenue`);
}

async function createContact(properties: Record<string, string>): Promise<any> {
  return hubspotRequest('/crm/v3/objects/contacts', 'POST', { properties });
}

async function updateContact(contactId: string, properties: Record<string, string>): Promise<any> {
  return hubspotRequest(`/crm/v3/objects/contacts/${contactId}`, 'PATCH', { properties });
}

async function searchContacts(query: string): Promise<any> {
  return hubspotRequest('/crm/v3/objects/contacts/search', 'POST', {
    filterGroups: [{
      filters: [{
        propertyName: 'email',
        operator: 'CONTAINS_TOKEN',
        value: query
      }]
    }],
    properties: ['email', 'firstname', 'lastname', 'phone', 'company', 'jobtitle', 'lifecyclestage', 'hubspot_owner_id']
  });
}

// ===== DEALS =====

async function getDeals(limit: number = 100, after?: string): Promise<any> {
  let endpoint = `/crm/v3/objects/deals?limit=${limit}&properties=dealname,amount,dealstage,pipeline,closedate,createdate,hs_lastmodifieddate,hubspot_owner_id,deal_currency_code,hs_priority,hs_deal_stage_probability,hs_forecast_amount,hs_forecast_probability,hs_projected_amount,notes_last_updated,num_associated_contacts,num_notes,hs_is_closed,hs_is_closed_won`;
  if (after) {
    endpoint += `&after=${after}`;
  }
  return hubspotRequest(endpoint);
}

async function getDeal(dealId: string): Promise<any> {
  return hubspotRequest(`/crm/v3/objects/deals/${dealId}?properties=dealname,amount,dealstage,pipeline,closedate,createdate,hs_lastmodifieddate,hubspot_owner_id,deal_currency_code,hs_priority,hs_deal_stage_probability,hs_forecast_amount,hs_forecast_probability,hs_projected_amount,notes_last_updated,num_associated_contacts,num_notes,hs_is_closed,hs_is_closed_won&associations=contacts,companies,line_items`);
}

async function createDeal(properties: Record<string, string>): Promise<any> {
  return hubspotRequest('/crm/v3/objects/deals', 'POST', { properties });
}

async function updateDeal(dealId: string, properties: Record<string, string>): Promise<any> {
  return hubspotRequest(`/crm/v3/objects/deals/${dealId}`, 'PATCH', { properties });
}

async function getDealPipelines(): Promise<any> {
  return hubspotRequest('/crm/v3/pipelines/deals');
}

async function searchDeals(query: string): Promise<any> {
  return hubspotRequest('/crm/v3/objects/deals/search', 'POST', {
    filterGroups: [{
      filters: [{
        propertyName: 'dealname',
        operator: 'CONTAINS_TOKEN',
        value: query
      }]
    }],
    properties: ['dealname', 'amount', 'dealstage', 'pipeline', 'closedate', 'hubspot_owner_id']
  });
}

// ===== COMPANIES =====

async function getCompanies(limit: number = 100, after?: string): Promise<any> {
  let endpoint = `/crm/v3/objects/companies?limit=${limit}&properties=name,domain,industry,phone,city,state,country,createdate,hs_lastmodifieddate,hubspot_owner_id,numberofemployees,annualrevenue,description,website,linkedin_company_page,facebook_company_page,twitterhandle,founded_year,total_revenue,hs_lead_status,lifecyclestage,type`;
  if (after) {
    endpoint += `&after=${after}`;
  }
  return hubspotRequest(endpoint);
}

async function getCompany(companyId: string): Promise<any> {
  return hubspotRequest(`/crm/v3/objects/companies/${companyId}?properties=name,domain,industry,phone,city,state,country,description,numberofemployees,annualrevenue,website,linkedin_company_page,facebook_company_page,twitterhandle,founded_year,total_revenue,hs_lead_status,lifecyclestage,type,hubspot_owner_id`);
}

async function createCompany(properties: Record<string, string>): Promise<any> {
  return hubspotRequest('/crm/v3/objects/companies', 'POST', { properties });
}

async function updateCompany(companyId: string, properties: Record<string, string>): Promise<any> {
  return hubspotRequest(`/crm/v3/objects/companies/${companyId}`, 'PATCH', { properties });
}

async function searchCompanies(query: string): Promise<any> {
  return hubspotRequest('/crm/v3/objects/companies/search', 'POST', {
    filterGroups: [{
      filters: [{
        propertyName: 'name',
        operator: 'CONTAINS_TOKEN',
        value: query
      }]
    }],
    properties: ['name', 'domain', 'industry', 'phone', 'city', 'state', 'country', 'annualrevenue', 'numberofemployees']
  });
}

// ===== ACTIVITIES / NOTES =====

async function getNotes(limit: number = 100, after?: string): Promise<any> {
  let endpoint = `/crm/v3/objects/notes?limit=${limit}&properties=hs_note_body,hs_timestamp,hs_lastmodifieddate,hubspot_owner_id`;
  if (after) {
    endpoint += `&after=${after}`;
  }
  return hubspotRequest(endpoint);
}

async function logActivity(
  objectType: 'contacts' | 'deals' | 'companies',
  objectId: string,
  noteBody: string
): Promise<any> {
  const noteData = {
    properties: {
      hs_note_body: noteBody,
      hs_timestamp: new Date().toISOString(),
    },
  };

  const createdNote = await hubspotRequest('/crm/v3/objects/notes', 'POST', noteData);

  const associationTypeId = objectType === 'contacts' ? 202 : objectType === 'deals' ? 214 : 190;
  
  await hubspotRequest(
    `/crm/v4/objects/notes/${createdNote.id}/associations/${objectType}/${objectId}`,
    'PUT',
    [{
      associationCategory: 'HUBSPOT_DEFINED',
      associationTypeId: associationTypeId
    }]
  );

  return createdNote;
}

// ===== CALLS =====

async function getCalls(limit: number = 100, after?: string): Promise<any> {
  let endpoint = `/crm/v3/objects/calls?limit=${limit}&properties=hs_call_body,hs_call_callee_object_id,hs_call_callee_object_type,hs_call_direction,hs_call_disposition,hs_call_duration,hs_call_from_number,hs_call_recording_url,hs_call_status,hs_call_title,hs_call_to_number,hs_timestamp,hubspot_owner_id,hs_createdate`;
  if (after) {
    endpoint += `&after=${after}`;
  }
  return hubspotRequest(endpoint);
}

async function getCall(callId: string): Promise<any> {
  return hubspotRequest(`/crm/v3/objects/calls/${callId}?properties=hs_call_body,hs_call_callee_object_id,hs_call_callee_object_type,hs_call_direction,hs_call_disposition,hs_call_duration,hs_call_from_number,hs_call_recording_url,hs_call_status,hs_call_title,hs_call_to_number,hs_timestamp,hubspot_owner_id,hs_createdate&associations=contacts,companies,deals`);
}

async function createCall(properties: Record<string, string>): Promise<any> {
  return hubspotRequest('/crm/v3/objects/calls', 'POST', { properties });
}

// ===== EMAILS =====

async function getEmails(limit: number = 100, after?: string): Promise<any> {
  let endpoint = `/crm/v3/objects/emails?limit=${limit}&properties=hs_email_direction,hs_email_sender_email,hs_email_sender_firstname,hs_email_sender_lastname,hs_email_subject,hs_email_text,hs_email_status,hs_timestamp,hubspot_owner_id,hs_email_to_email,hs_email_cc_email,hs_email_bcc_email`;
  if (after) {
    endpoint += `&after=${after}`;
  }
  return hubspotRequest(endpoint);
}

async function getEmail(emailId: string): Promise<any> {
  return hubspotRequest(`/crm/v3/objects/emails/${emailId}?properties=hs_email_direction,hs_email_sender_email,hs_email_sender_firstname,hs_email_sender_lastname,hs_email_subject,hs_email_text,hs_email_html,hs_email_status,hs_timestamp,hubspot_owner_id,hs_email_to_email,hs_email_cc_email,hs_email_bcc_email&associations=contacts,companies,deals`);
}

async function createEmail(properties: Record<string, string>): Promise<any> {
  return hubspotRequest('/crm/v3/objects/emails', 'POST', { properties });
}

// ===== MEETINGS =====

async function getMeetings(limit: number = 100, after?: string): Promise<any> {
  let endpoint = `/crm/v3/objects/meetings?limit=${limit}&properties=hs_meeting_title,hs_meeting_body,hs_meeting_start_time,hs_meeting_end_time,hs_meeting_location,hs_meeting_outcome,hs_internal_meeting_notes,hubspot_owner_id,hs_timestamp,hs_createdate`;
  if (after) {
    endpoint += `&after=${after}`;
  }
  return hubspotRequest(endpoint);
}

async function getMeeting(meetingId: string): Promise<any> {
  return hubspotRequest(`/crm/v3/objects/meetings/${meetingId}?properties=hs_meeting_title,hs_meeting_body,hs_meeting_start_time,hs_meeting_end_time,hs_meeting_location,hs_meeting_outcome,hs_internal_meeting_notes,hubspot_owner_id,hs_timestamp,hs_createdate&associations=contacts,companies,deals`);
}

async function createMeeting(properties: Record<string, string>): Promise<any> {
  return hubspotRequest('/crm/v3/objects/meetings', 'POST', { properties });
}

// ===== TASKS =====

async function getTasks(limit: number = 100, after?: string): Promise<any> {
  let endpoint = `/crm/v3/objects/tasks?limit=${limit}&properties=hs_task_body,hs_task_subject,hs_task_status,hs_task_priority,hs_task_type,hs_timestamp,hubspot_owner_id,hs_task_completion_date,hs_task_reminders,hs_queue_membership_ids`;
  if (after) {
    endpoint += `&after=${after}`;
  }
  return hubspotRequest(endpoint);
}

async function getTask(taskId: string): Promise<any> {
  return hubspotRequest(`/crm/v3/objects/tasks/${taskId}?properties=hs_task_body,hs_task_subject,hs_task_status,hs_task_priority,hs_task_type,hs_timestamp,hubspot_owner_id,hs_task_completion_date,hs_task_reminders,hs_queue_membership_ids&associations=contacts,companies,deals`);
}

async function createTask(properties: Record<string, string>): Promise<any> {
  return hubspotRequest('/crm/v3/objects/tasks', 'POST', { properties });
}

async function updateTask(taskId: string, properties: Record<string, string>): Promise<any> {
  return hubspotRequest(`/crm/v3/objects/tasks/${taskId}`, 'PATCH', { properties });
}

// ===== TICKETS =====

async function getTickets(limit: number = 100, after?: string): Promise<any> {
  let endpoint = `/crm/v3/objects/tickets?limit=${limit}&properties=subject,content,hs_ticket_priority,hs_pipeline,hs_pipeline_stage,hs_ticket_category,hubspot_owner_id,createdate,hs_lastmodifieddate,closed_date,time_to_close,time_to_first_agent_reply`;
  if (after) {
    endpoint += `&after=${after}`;
  }
  return hubspotRequest(endpoint);
}

async function getTicket(ticketId: string): Promise<any> {
  return hubspotRequest(`/crm/v3/objects/tickets/${ticketId}?properties=subject,content,hs_ticket_priority,hs_pipeline,hs_pipeline_stage,hs_ticket_category,hubspot_owner_id,createdate,hs_lastmodifieddate,closed_date,time_to_close,time_to_first_agent_reply&associations=contacts,companies,deals`);
}

async function createTicket(properties: Record<string, string>): Promise<any> {
  return hubspotRequest('/crm/v3/objects/tickets', 'POST', { properties });
}

async function updateTicket(ticketId: string, properties: Record<string, string>): Promise<any> {
  return hubspotRequest(`/crm/v3/objects/tickets/${ticketId}`, 'PATCH', { properties });
}

async function getTicketPipelines(): Promise<any> {
  return hubspotRequest('/crm/v3/pipelines/tickets');
}

// ===== OWNERS =====

async function getOwners(limit: number = 100, after?: string): Promise<any> {
  let endpoint = `/crm/v3/owners?limit=${limit}`;
  if (after) {
    endpoint += `&after=${after}`;
  }
  return hubspotRequest(endpoint);
}

async function getOwner(ownerId: string): Promise<any> {
  return hubspotRequest(`/crm/v3/owners/${ownerId}`);
}

// ===== PRODUCTS =====

async function getProducts(limit: number = 100, after?: string): Promise<any> {
  let endpoint = `/crm/v3/objects/products?limit=${limit}&properties=name,description,price,hs_cost_of_goods_sold,hs_recurring_billing_period,hs_sku,createdate,hs_lastmodifieddate`;
  if (after) {
    endpoint += `&after=${after}`;
  }
  return hubspotRequest(endpoint);
}

async function getProduct(productId: string): Promise<any> {
  return hubspotRequest(`/crm/v3/objects/products/${productId}?properties=name,description,price,hs_cost_of_goods_sold,hs_recurring_billing_period,hs_sku,createdate,hs_lastmodifieddate`);
}

async function createProduct(properties: Record<string, string>): Promise<any> {
  return hubspotRequest('/crm/v3/objects/products', 'POST', { properties });
}

async function updateProduct(productId: string, properties: Record<string, string>): Promise<any> {
  return hubspotRequest(`/crm/v3/objects/products/${productId}`, 'PATCH', { properties });
}

// ===== LINE ITEMS =====

async function getLineItems(limit: number = 100, after?: string): Promise<any> {
  let endpoint = `/crm/v3/objects/line_items?limit=${limit}&properties=name,description,price,quantity,amount,discount,hs_product_id,hs_sku,createdate`;
  if (after) {
    endpoint += `&after=${after}`;
  }
  return hubspotRequest(endpoint);
}

async function getLineItem(lineItemId: string): Promise<any> {
  return hubspotRequest(`/crm/v3/objects/line_items/${lineItemId}?properties=name,description,price,quantity,amount,discount,hs_product_id,hs_sku,createdate&associations=deals`);
}

async function getDealLineItems(dealId: string): Promise<any> {
  return hubspotRequest(`/crm/v3/objects/deals/${dealId}/associations/line_items`);
}

// ===== QUOTES =====

async function getQuotes(limit: number = 100, after?: string): Promise<any> {
  let endpoint = `/crm/v3/objects/quotes?limit=${limit}&properties=hs_title,hs_expiration_date,hs_status,hs_quote_amount,hs_sender_firstname,hs_sender_lastname,hs_sender_email,createdate,hs_lastmodifieddate`;
  if (after) {
    endpoint += `&after=${after}`;
  }
  return hubspotRequest(endpoint);
}

async function getQuote(quoteId: string): Promise<any> {
  return hubspotRequest(`/crm/v3/objects/quotes/${quoteId}?properties=hs_title,hs_expiration_date,hs_status,hs_quote_amount,hs_sender_firstname,hs_sender_lastname,hs_sender_email,hs_terms,hs_public_url_key,createdate,hs_lastmodifieddate&associations=deals,line_items,contacts,companies`);
}

// ===== FORMS =====

async function getForms(): Promise<any> {
  return hubspotRequest('/marketing/v3/forms');
}

async function getForm(formId: string): Promise<any> {
  return hubspotRequest(`/marketing/v3/forms/${formId}`);
}

async function getFormSubmissions(formId: string, limit: number = 50, after?: string): Promise<any> {
  let endpoint = `/form-integrations/v1/submissions/forms/${formId}?limit=${limit}`;
  if (after) {
    endpoint += `&after=${after}`;
  }
  return hubspotRequest(endpoint);
}

// ===== MARKETING EMAILS =====

async function getMarketingEmails(limit: number = 100, offset: number = 0): Promise<any> {
  return hubspotRequest(`/marketing-emails/v1/emails?limit=${limit}&offset=${offset}`);
}

async function getMarketingEmail(emailId: string): Promise<any> {
  return hubspotRequest(`/marketing-emails/v1/emails/${emailId}`);
}

async function getMarketingEmailStats(emailId: string): Promise<any> {
  return hubspotRequest(`/marketing-emails/v1/emails/${emailId}/statistics`);
}

// ===== CAMPAIGNS =====

async function getCampaigns(): Promise<any> {
  return hubspotRequest('/email/public/v1/campaigns');
}

async function getCampaign(campaignId: string): Promise<any> {
  return hubspotRequest(`/email/public/v1/campaigns/${campaignId}`);
}

// ===== LISTS =====

async function getLists(limit: number = 100, offset: number = 0): Promise<any> {
  return hubspotRequest(`/contacts/v1/lists?count=${limit}&offset=${offset}`);
}

async function getList(listId: string): Promise<any> {
  return hubspotRequest(`/contacts/v1/lists/${listId}`);
}

async function getListContacts(listId: string, limit: number = 100): Promise<any> {
  return hubspotRequest(`/contacts/v1/lists/${listId}/contacts/all?count=${limit}`);
}

// ===== WORKFLOWS =====

async function getWorkflows(): Promise<any> {
  return hubspotRequest('/automation/v3/workflows');
}

async function getWorkflow(workflowId: string): Promise<any> {
  return hubspotRequest(`/automation/v3/workflows/${workflowId}`);
}

// ===== PROPERTIES =====

async function getProperties(objectType: string): Promise<any> {
  return hubspotRequest(`/crm/v3/properties/${objectType}`);
}

async function getProperty(objectType: string, propertyName: string): Promise<any> {
  return hubspotRequest(`/crm/v3/properties/${objectType}/${propertyName}`);
}

// ===== ASSOCIATIONS =====

async function getAssociations(fromObjectType: string, fromObjectId: string, toObjectType: string): Promise<any> {
  return hubspotRequest(`/crm/v4/objects/${fromObjectType}/${fromObjectId}/associations/${toObjectType}`);
}

async function createAssociation(
  fromObjectType: string, 
  fromObjectId: string, 
  toObjectType: string, 
  toObjectId: string,
  associationTypeId: number
): Promise<any> {
  return hubspotRequest(
    `/crm/v4/objects/${fromObjectType}/${fromObjectId}/associations/${toObjectType}/${toObjectId}`,
    'PUT',
    [{
      associationCategory: 'HUBSPOT_DEFINED',
      associationTypeId: associationTypeId
    }]
  );
}

// ===== ANALYTICS =====

async function getAnalyticsSources(startDate: string, endDate: string): Promise<any> {
  return hubspotRequest(`/analytics/v2/reports/sources/summary/total?start=${startDate}&end=${endDate}`);
}

async function getAnalyticsPages(startDate: string, endDate: string): Promise<any> {
  return hubspotRequest(`/analytics/v2/reports/pages/summary/total?start=${startDate}&end=${endDate}`);
}

// ===== CONNECTION TEST =====

async function testConnection(): Promise<any> {
  const accountInfo = await hubspotRequest('/account-info/v3/api-usage/daily/private-apps');
  return { success: true, accountInfo };
}

// ===== ANALYTICS SUMMARY =====

async function getAnalyticsSummary(): Promise<any> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  const startDate = thirtyDaysAgo.toISOString().split('T')[0];
  const endDate = now.toISOString().split('T')[0];
  
  // Fetch multiple data points in parallel
  const [contacts, deals, companies, owners, tasks, tickets] = await Promise.all([
    getContacts(100),
    getDeals(100),
    getCompanies(100),
    getOwners(100),
    getTasks(100),
    getTickets(100),
  ]);
  
  // Calculate summary stats
  const totalDealsValue = deals.results?.reduce((sum: number, deal: any) => {
    return sum + (parseFloat(deal.properties?.amount) || 0);
  }, 0) || 0;
  
  const openDeals = deals.results?.filter((d: any) => d.properties?.hs_is_closed !== 'true')?.length || 0;
  const closedWonDeals = deals.results?.filter((d: any) => d.properties?.hs_is_closed_won === 'true')?.length || 0;
  const openTasks = tasks.results?.filter((t: any) => t.properties?.hs_task_status !== 'COMPLETED')?.length || 0;
  const openTickets = tickets.results?.filter((t: any) => t.properties?.hs_pipeline_stage !== 'closed')?.length || 0;
  
  return {
    summary: {
      totalContacts: contacts.results?.length || 0,
      totalDeals: deals.results?.length || 0,
      totalCompanies: companies.results?.length || 0,
      totalOwners: owners.results?.length || 0,
      totalDealsValue,
      openDeals,
      closedWonDeals,
      openTasks,
      openTickets,
      dateRange: { startDate, endDate },
    },
    contacts: contacts.results?.slice(0, 10),
    deals: deals.results?.slice(0, 10),
    companies: companies.results?.slice(0, 10),
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, ...params } = body;

    console.log(`HubSpot sync request: action=${action}`, params);

    let result: any;

    switch (action) {
      // Test connection
      case 'test':
        result = await testConnection();
        break;

      // Analytics Summary
      case 'getAnalyticsSummary':
        result = await getAnalyticsSummary();
        break;

      // Contacts
      case 'getContacts':
        result = await getContacts(params.limit || 100, params.after);
        break;
      case 'getContact':
        result = await getContact(params.contactId);
        break;
      case 'createContact':
        result = await createContact(params.properties);
        break;
      case 'updateContact':
        result = await updateContact(params.contactId, params.properties);
        break;
      case 'searchContacts':
        result = await searchContacts(params.query);
        break;

      // Deals
      case 'getDeals':
        result = await getDeals(params.limit || 100, params.after);
        break;
      case 'getDeal':
        result = await getDeal(params.dealId);
        break;
      case 'createDeal':
        result = await createDeal(params.properties);
        break;
      case 'updateDeal':
        result = await updateDeal(params.dealId, params.properties);
        break;
      case 'searchDeals':
        result = await searchDeals(params.query);
        break;
      case 'getPipelines':
        result = await getDealPipelines();
        break;

      // Companies
      case 'getCompanies':
        result = await getCompanies(params.limit || 100, params.after);
        break;
      case 'getCompany':
        result = await getCompany(params.companyId);
        break;
      case 'createCompany':
        result = await createCompany(params.properties);
        break;
      case 'updateCompany':
        result = await updateCompany(params.companyId, params.properties);
        break;
      case 'searchCompanies':
        result = await searchCompanies(params.query);
        break;

      // Activities / Notes
      case 'getNotes':
        result = await getNotes(params.limit || 100, params.after);
        break;
      case 'logActivity':
        result = await logActivity(params.objectType, params.objectId, params.noteBody);
        break;

      // Calls
      case 'getCalls':
        result = await getCalls(params.limit || 100, params.after);
        break;
      case 'getCall':
        result = await getCall(params.callId);
        break;
      case 'createCall':
        result = await createCall(params.properties);
        break;

      // Emails
      case 'getEmails':
        result = await getEmails(params.limit || 100, params.after);
        break;
      case 'getEmail':
        result = await getEmail(params.emailId);
        break;
      case 'createEmail':
        result = await createEmail(params.properties);
        break;

      // Meetings
      case 'getMeetings':
        result = await getMeetings(params.limit || 100, params.after);
        break;
      case 'getMeeting':
        result = await getMeeting(params.meetingId);
        break;
      case 'createMeeting':
        result = await createMeeting(params.properties);
        break;

      // Tasks
      case 'getTasks':
        result = await getTasks(params.limit || 100, params.after);
        break;
      case 'getTask':
        result = await getTask(params.taskId);
        break;
      case 'createTask':
        result = await createTask(params.properties);
        break;
      case 'updateTask':
        result = await updateTask(params.taskId, params.properties);
        break;

      // Tickets
      case 'getTickets':
        result = await getTickets(params.limit || 100, params.after);
        break;
      case 'getTicket':
        result = await getTicket(params.ticketId);
        break;
      case 'createTicket':
        result = await createTicket(params.properties);
        break;
      case 'updateTicket':
        result = await updateTicket(params.ticketId, params.properties);
        break;
      case 'getTicketPipelines':
        result = await getTicketPipelines();
        break;

      // Owners
      case 'getOwners':
        result = await getOwners(params.limit || 100, params.after);
        break;
      case 'getOwner':
        result = await getOwner(params.ownerId);
        break;

      // Products
      case 'getProducts':
        result = await getProducts(params.limit || 100, params.after);
        break;
      case 'getProduct':
        result = await getProduct(params.productId);
        break;
      case 'createProduct':
        result = await createProduct(params.properties);
        break;
      case 'updateProduct':
        result = await updateProduct(params.productId, params.properties);
        break;

      // Line Items
      case 'getLineItems':
        result = await getLineItems(params.limit || 100, params.after);
        break;
      case 'getLineItem':
        result = await getLineItem(params.lineItemId);
        break;
      case 'getDealLineItems':
        result = await getDealLineItems(params.dealId);
        break;

      // Quotes
      case 'getQuotes':
        result = await getQuotes(params.limit || 100, params.after);
        break;
      case 'getQuote':
        result = await getQuote(params.quoteId);
        break;

      // Forms
      case 'getForms':
        result = await getForms();
        break;
      case 'getForm':
        result = await getForm(params.formId);
        break;
      case 'getFormSubmissions':
        result = await getFormSubmissions(params.formId, params.limit || 50, params.after);
        break;

      // Marketing Emails
      case 'getMarketingEmails':
        result = await getMarketingEmails(params.limit || 100, params.offset || 0);
        break;
      case 'getMarketingEmail':
        result = await getMarketingEmail(params.emailId);
        break;
      case 'getMarketingEmailStats':
        result = await getMarketingEmailStats(params.emailId);
        break;

      // Campaigns
      case 'getCampaigns':
        result = await getCampaigns();
        break;
      case 'getCampaign':
        result = await getCampaign(params.campaignId);
        break;

      // Lists
      case 'getLists':
        result = await getLists(params.limit || 100, params.offset || 0);
        break;
      case 'getList':
        result = await getList(params.listId);
        break;
      case 'getListContacts':
        result = await getListContacts(params.listId, params.limit || 100);
        break;

      // Workflows
      case 'getWorkflows':
        result = await getWorkflows();
        break;
      case 'getWorkflow':
        result = await getWorkflow(params.workflowId);
        break;

      // Properties
      case 'getProperties':
        result = await getProperties(params.objectType);
        break;
      case 'getProperty':
        result = await getProperty(params.objectType, params.propertyName);
        break;

      // Associations
      case 'getAssociations':
        result = await getAssociations(params.fromObjectType, params.fromObjectId, params.toObjectType);
        break;
      case 'createAssociation':
        result = await createAssociation(
          params.fromObjectType,
          params.fromObjectId,
          params.toObjectType,
          params.toObjectId,
          params.associationTypeId
        );
        break;

      // Analytics
      case 'getAnalyticsSources':
        result = await getAnalyticsSources(params.startDate, params.endDate);
        break;
      case 'getAnalyticsPages':
        result = await getAnalyticsPages(params.startDate, params.endDate);
        break;

      default:
        return new Response(
          JSON.stringify({ 
            error: 'Unknown action', 
            validActions: [
              'test', 'getAnalyticsSummary',
              'getContacts', 'getContact', 'createContact', 'updateContact', 'searchContacts',
              'getDeals', 'getDeal', 'createDeal', 'updateDeal', 'searchDeals', 'getPipelines',
              'getCompanies', 'getCompany', 'createCompany', 'updateCompany', 'searchCompanies',
              'getNotes', 'logActivity',
              'getCalls', 'getCall', 'createCall',
              'getEmails', 'getEmail', 'createEmail',
              'getMeetings', 'getMeeting', 'createMeeting',
              'getTasks', 'getTask', 'createTask', 'updateTask',
              'getTickets', 'getTicket', 'createTicket', 'updateTicket', 'getTicketPipelines',
              'getOwners', 'getOwner',
              'getProducts', 'getProduct', 'createProduct', 'updateProduct',
              'getLineItems', 'getLineItem', 'getDealLineItems',
              'getQuotes', 'getQuote',
              'getForms', 'getForm', 'getFormSubmissions',
              'getMarketingEmails', 'getMarketingEmail', 'getMarketingEmailStats',
              'getCampaigns', 'getCampaign',
              'getLists', 'getList', 'getListContacts',
              'getWorkflows', 'getWorkflow',
              'getProperties', 'getProperty',
              'getAssociations', 'createAssociation',
              'getAnalyticsSources', 'getAnalyticsPages'
            ] 
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('HubSpot sync error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});