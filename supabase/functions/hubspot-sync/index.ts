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
  let endpoint = `/crm/v3/objects/contacts?limit=${limit}&properties=email,firstname,lastname,phone,company,jobtitle,createdate,lastmodifieddate`;
  if (after) {
    endpoint += `&after=${after}`;
  }
  return hubspotRequest(endpoint);
}

async function getContact(contactId: string): Promise<any> {
  return hubspotRequest(`/crm/v3/objects/contacts/${contactId}?properties=email,firstname,lastname,phone,company,jobtitle,createdate,lastmodifieddate`);
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

async function logActivity(
  objectType: 'contacts' | 'deals' | 'companies',
  objectId: string,
  noteBody: string
): Promise<any> {
  // First create the note
  const noteData = {
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
    // Parse the request body to get the action
    const body = await req.json();
    const { action, ...params } = body;

    console.log(`HubSpot sync request: action=${action}`, params);

    let result: any;

    switch (action) {
      // Test connection
      case 'test':
        result = await testConnection();
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

      default:
        return new Response(
          JSON.stringify({ 
            error: 'Unknown action', 
            validActions: [
              'test',
              'getContacts', 'getContact', 'createContact', 'updateContact', 'searchContacts',
              'getDeals', 'getDeal', 'createDeal', 'updateDeal', 'searchDeals', 'getPipelines',
              'getCompanies', 'getCompany', 'createCompany', 'updateCompany', 'searchCompanies',
              'getNotes', 'logActivity'
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
