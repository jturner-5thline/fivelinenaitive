import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

interface HubSpotContact {
  id?: string;
  properties: {
    email?: string;
    firstname?: string;
    lastname?: string;
    phone?: string;
    company?: string;
    jobtitle?: string;
    [key: string]: string | undefined;
  };
}

interface HubSpotDeal {
  id?: string;
  properties: {
    dealname?: string;
    amount?: string;
    dealstage?: string;
    pipeline?: string;
    closedate?: string;
    [key: string]: string | undefined;
  };
  associations?: {
    contacts?: { id: string }[];
    companies?: { id: string }[];
  };
}

interface HubSpotCompany {
  id?: string;
  properties: {
    name?: string;
    domain?: string;
    industry?: string;
    phone?: string;
    city?: string;
    state?: string;
    country?: string;
    [key: string]: string | undefined;
  };
}

interface HubSpotNote {
  properties: {
    hs_note_body: string;
    hs_timestamp: string;
  };
  associations?: Array<{
    to: { id: string };
    types: Array<{ associationCategory: string; associationTypeId: number }>;
  }>;
}

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
  let endpoint = `/crm/v3/objects/contacts?limit=${limit}&properties=email,firstname,lastname,phone,company,jobtitle,createdate,lastmodifieddate`;
  if (after) {
    endpoint += `&after=${after}`;
  }
  return hubspotRequest(endpoint);
}

async function getContact(contactId: string): Promise<any> {
  return hubspotRequest(`/crm/v3/objects/contacts/${contactId}?properties=email,firstname,lastname,phone,company,jobtitle,createdate,lastmodifieddate`);
}

async function createContact(contact: HubSpotContact): Promise<any> {
  return hubspotRequest('/crm/v3/objects/contacts', 'POST', contact);
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
    properties: ['email', 'firstname', 'lastname', 'phone', 'company', 'jobtitle']
  });
}

// ===== DEALS =====

async function getDeals(limit: number = 100, after?: string): Promise<any> {
  let endpoint = `/crm/v3/objects/deals?limit=${limit}&properties=dealname,amount,dealstage,pipeline,closedate,createdate,hs_lastmodifieddate`;
  if (after) {
    endpoint += `&after=${after}`;
  }
  return hubspotRequest(endpoint);
}

async function getDeal(dealId: string): Promise<any> {
  return hubspotRequest(`/crm/v3/objects/deals/${dealId}?properties=dealname,amount,dealstage,pipeline,closedate,createdate,hs_lastmodifieddate&associations=contacts,companies`);
}

async function createDeal(deal: HubSpotDeal): Promise<any> {
  return hubspotRequest('/crm/v3/objects/deals', 'POST', deal);
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
    properties: ['dealname', 'amount', 'dealstage', 'pipeline', 'closedate']
  });
}

// ===== COMPANIES =====

async function getCompanies(limit: number = 100, after?: string): Promise<any> {
  let endpoint = `/crm/v3/objects/companies?limit=${limit}&properties=name,domain,industry,phone,city,state,country,createdate,hs_lastmodifieddate`;
  if (after) {
    endpoint += `&after=${after}`;
  }
  return hubspotRequest(endpoint);
}

async function getCompany(companyId: string): Promise<any> {
  return hubspotRequest(`/crm/v3/objects/companies/${companyId}?properties=name,domain,industry,phone,city,state,country,description,numberofemployees,annualrevenue`);
}

async function createCompany(company: HubSpotCompany): Promise<any> {
  return hubspotRequest('/crm/v3/objects/companies', 'POST', company);
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
    properties: ['name', 'domain', 'industry', 'phone', 'city', 'state', 'country']
  });
}

// ===== ACTIVITIES / NOTES =====

async function getNotes(limit: number = 100, after?: string): Promise<any> {
  let endpoint = `/crm/v3/objects/notes?limit=${limit}&properties=hs_note_body,hs_timestamp,hs_lastmodifieddate`;
  if (after) {
    endpoint += `&after=${after}`;
  }
  return hubspotRequest(endpoint);
}

async function createNote(note: HubSpotNote): Promise<any> {
  return hubspotRequest('/crm/v3/objects/notes', 'POST', note);
}

async function logActivity(
  objectType: 'contacts' | 'deals' | 'companies',
  objectId: string,
  noteBody: string
): Promise<any> {
  // First create the note
  const noteData: HubSpotNote = {
    properties: {
      hs_note_body: noteBody,
      hs_timestamp: new Date().toISOString(),
    },
  };

  const createdNote = await hubspotRequest('/crm/v3/objects/notes', 'POST', noteData);

  // Then associate it with the object
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

async function getEngagements(objectType: 'contacts' | 'deals' | 'companies', objectId: string): Promise<any> {
  return hubspotRequest(`/crm/v4/objects/${objectType}/${objectId}/associations/notes`);
}

// ===== CONNECTION TEST =====

async function testConnection(): Promise<any> {
  // Try to get account info to verify the token works
  const accountInfo = await hubspotRequest('/account-info/v3/api-usage/daily/private-apps');
  return { success: true, accountInfo };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    
    // Remove 'hubspot-sync' from path if present
    if (pathParts[0] === 'hubspot-sync') {
      pathParts.shift();
    }

    const action = pathParts[0];
    const subAction = pathParts[1];
    const id = pathParts[2];

    console.log(`HubSpot sync request: ${req.method} action=${action} subAction=${subAction} id=${id}`);

    let result: any;

    // For POST/PATCH requests, parse body
    let body: any = null;
    if (req.method === 'POST' || req.method === 'PATCH') {
      body = await req.json();
    }

    // Query params
    const limit = parseInt(url.searchParams.get('limit') || '100');
    const after = url.searchParams.get('after') || undefined;
    const query = url.searchParams.get('query') || '';

    switch (action) {
      // Test connection
      case 'test':
        result = await testConnection();
        break;

      // Contacts
      case 'contacts':
        if (req.method === 'GET') {
          if (subAction === 'search') {
            result = await searchContacts(query);
          } else if (subAction) {
            result = await getContact(subAction);
          } else {
            result = await getContacts(limit, after);
          }
        } else if (req.method === 'POST') {
          result = await createContact(body);
        } else if (req.method === 'PATCH' && subAction) {
          result = await updateContact(subAction, body.properties);
        }
        break;

      // Deals
      case 'deals':
        if (req.method === 'GET') {
          if (subAction === 'search') {
            result = await searchDeals(query);
          } else if (subAction === 'pipelines') {
            result = await getDealPipelines();
          } else if (subAction) {
            result = await getDeal(subAction);
          } else {
            result = await getDeals(limit, after);
          }
        } else if (req.method === 'POST') {
          result = await createDeal(body);
        } else if (req.method === 'PATCH' && subAction) {
          result = await updateDeal(subAction, body.properties);
        }
        break;

      // Companies
      case 'companies':
        if (req.method === 'GET') {
          if (subAction === 'search') {
            result = await searchCompanies(query);
          } else if (subAction) {
            result = await getCompany(subAction);
          } else {
            result = await getCompanies(limit, after);
          }
        } else if (req.method === 'POST') {
          result = await createCompany(body);
        } else if (req.method === 'PATCH' && subAction) {
          result = await updateCompany(subAction, body.properties);
        }
        break;

      // Activities / Notes
      case 'activities':
      case 'notes':
        if (req.method === 'GET') {
          if (subAction && id) {
            // Get engagements for an object
            result = await getEngagements(subAction as 'contacts' | 'deals' | 'companies', id);
          } else {
            result = await getNotes(limit, after);
          }
        } else if (req.method === 'POST') {
          if (body.objectType && body.objectId && body.noteBody) {
            result = await logActivity(body.objectType, body.objectId, body.noteBody);
          } else {
            result = await createNote(body);
          }
        }
        break;

      default:
        return new Response(
          JSON.stringify({ error: 'Unknown action', validActions: ['test', 'contacts', 'deals', 'companies', 'activities', 'notes'] }),
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
