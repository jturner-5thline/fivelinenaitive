import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

async function hubspotRequest(endpoint: string, accessToken: string): Promise<any> {
  const url = `${HUBSPOT_API_BASE}${endpoint}`;
  console.log(`[sync-hubspot-companies] GET ${url}`);

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  const text = await response.text();
  if (!response.ok) {
    console.error(`[sync-hubspot-companies] API error ${response.status}: ${text}`);
    throw new Error(`HubSpot API error: ${response.status}`);
  }

  return text ? JSON.parse(text) : null;
}

// Only request properties we actually map — keeps URL short and avoids timeouts
const ESSENTIAL_PROPERTIES = [
  'name', 'domain', 'website', 'industry', 'numberofemployees',
  'description', 'phone', 'city', 'state', 'country', 'zip', 'address',
  'annualrevenue', 'lifecyclestage', 'type', 'linkedin_company_page',
  'twitterhandle', 'hs_object_id', 'recent_deal_amount', 'recent_deal_close_date',
  'total_revenue', 'founded_year', 'is_public', 'hs_lead_status',
  'hubspot_owner_id', 'num_associated_contacts', 'num_associated_deals',
  'hs_num_open_deals', 'hs_total_deal_value', 'hs_additional_domains',
].join(',');

async function fetchAllCompanies(accessToken: string): Promise<any[]> {
  const all: any[] = [];
  let after: string | undefined;
  const propsParam = ESSENTIAL_PROPERTIES;

  do {
    let endpoint = `/crm/v3/objects/companies?limit=100&properties=${propsParam}`;
    if (after) endpoint += `&after=${after}`;

    const data = await hubspotRequest(endpoint, accessToken);
    const results = data.results || [];
    all.push(...results);
    after = data.paging?.next?.after;
    console.log(`[sync-hubspot-companies] Fetched ${results.length} companies (total: ${all.length}), next: ${after || 'none'}`);
  } while (after);

  return all;
}

function mapEmployeeRange(count: string | null | undefined): string | null {
  if (!count) return null;
  const n = parseInt(count, 10);
  if (isNaN(n)) return count; // might already be a range string
  if (n <= 10) return '1-10';
  if (n <= 50) return '11-50';
  if (n <= 200) return '51-200';
  if (n <= 500) return '201-500';
  if (n <= 1000) return '501-1000';
  if (n <= 5000) return '1001-5000';
  if (n <= 10000) return '5001-10000';
  return '10000+';
}

function mapCompanyType(hsType: string | null | undefined): string {
  if (!hsType) return 'prospect';
  const lower = hsType.toLowerCase();
  if (lower.includes('customer') || lower === 'customer') return 'customer';
  if (lower.includes('partner')) return 'partner';
  if (lower.includes('vendor') || lower === 'reseller') return 'vendor';
  if (lower.includes('prospect')) return 'prospect';
  return 'prospect';
}

function mapLifecycleStage(hsStage: string | null | undefined): string {
  if (!hsStage) return 'target';
  const lower = hsStage.toLowerCase();
  const mapping: Record<string, string> = {
    subscriber: 'target',
    lead: 'target',
    marketingqualifiedlead: 'engaged',
    salesqualifiedlead: 'engaged',
    opportunity: 'opportunity',
    customer: 'customer',
    evangelist: 'expansion',
    other: 'target',
  };
  return mapping[lower] || 'target';
}

// Known mapped fields - everything else goes to custom_fields
const MAPPED_PROPS = new Set([
  'name', 'domain', 'website', 'industry', 'numberofemployees',
  'description', 'phone', 'city', 'state', 'country', 'zip', 'address',
  'annualrevenue', 'lifecyclestage', 'type', 'linkedin_company_page',
  'twitterhandle', 'hs_object_id',
]);

function mapHubSpotCompany(hs: any, orgCompanyId: string, createdBy: string | null): Record<string, any> {
  const props = hs.properties || {};
  const domain = props.domain || null;

  // Collect unmapped properties into custom_fields
  const customFields: Record<string, any> = {};
  const rawProps: Record<string, any> = {};
  for (const [key, val] of Object.entries(props)) {
    rawProps[key] = val;
    if (!MAPPED_PROPS.has(key) && val !== null && val !== '') {
      customFields[key] = val;
    }
  }
  customFields['hubspot_raw_properties'] = rawProps;

  const empCount = props.numberofemployees ? parseInt(props.numberofemployees, 10) : null;

  return {
    name: props.name || `HubSpot Company ${hs.id}`,
    domain,
    website_url: props.website || null,
    industry: props.industry || null,
    employee_count: isNaN(empCount as number) ? null : empCount,
    employee_range: mapEmployeeRange(props.numberofemployees),
    description: props.description || null,
    phone: props.phone || null,
    hq_city: props.city || null,
    hq_state: props.state || null,
    hq_country: props.country || null,
    hq_postal_code: props.zip || null,
    annual_revenue: props.annualrevenue ? parseFloat(props.annualrevenue) || null : null,
    lifecycle_stage: mapLifecycleStage(props.lifecyclestage),
    hubspot_company_id: String(hs.id),
    source_system: 'hubspot',
    synced_with_hubspot: true,
    migrated_from_hubspot: true,
    logo_url: domain ? `https://logo.clearbit.com/${domain}` : null,
    status: 'active',
    company_type: mapCompanyType(props.type),
    linkedin_url: props.linkedin_company_page || null,
    twitter_url: props.twitterhandle ? `https://twitter.com/${props.twitterhandle}` : null,
    custom_fields: customFields,
    org_company_id: orgCompanyId,
    created_by: createdBy,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const accessToken = Deno.env.get('HUBSPOT_ACCESS_TOKEN');
    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'HUBSPOT_ACCESS_TOKEN not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get caller info from JWT if available
    let callerUserId: string | null = null;
    const authHeader = req.headers.get('authorization');
    if (authHeader) {
      const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      callerUserId = user?.id || null;
    }

    // Find the org company that owns the HubSpot integration
    // Look for 5th Line or any company with a HubSpot integration
    let orgCompanyId: string | null = null;

    // Try to get from caller's company membership
    if (callerUserId) {
      const { data: membership } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', callerUserId)
        .limit(1)
        .single();
      if (membership) orgCompanyId = membership.company_id;
    }

    // Fallback: find company with integrations
    if (!orgCompanyId) {
      const { data: integration } = await supabase
        .from('integrations')
        .select('company_id')
        .eq('provider', 'hubspot')
        .limit(1)
        .single();
      if (integration) orgCompanyId = integration.company_id;
    }

    // Last fallback: 5th Line company
    if (!orgCompanyId) {
      const { data: co } = await supabase
        .from('companies')
        .select('id')
        .or('primary_domain.eq.5thline.co,name.ilike.%5th Line%')
        .limit(1)
        .single();
      if (co) orgCompanyId = co.id;
    }

    if (!orgCompanyId) {
      return new Response(JSON.stringify({ error: 'Could not determine org company' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[sync-hubspot-companies] Org company: ${orgCompanyId}, caller: ${callerUserId}`);

    // 1. Fetch all property names
    const propertyNames = await fetchAllPropertyNames(accessToken);

    // 2. Fetch all companies from HubSpot
    const hsCompanies = await fetchAllCompanies(accessToken, propertyNames);
    console.log(`[sync-hubspot-companies] Total HubSpot companies: ${hsCompanies.length}`);

    if (hsCompanies.length === 0) {
      return new Response(JSON.stringify({ success: true, count: 0, message: 'No companies found in HubSpot' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Map all companies
    const mapped = hsCompanies.map(hs => mapHubSpotCompany(hs, orgCompanyId!, callerUserId));

    // 4. Delete existing crm_companies for this org (replace fake/seed data)
    const { error: deleteError } = await supabase
      .from('crm_companies')
      .delete()
      .eq('org_company_id', orgCompanyId);
    
    if (deleteError) {
      console.error(`[sync-hubspot-companies] Delete error: ${deleteError.message}`);
      // Continue anyway - might be no rows
    }

    // 5. Insert in batches of 50
    let inserted = 0;
    const batchSize = 50;
    const errors: string[] = [];

    for (let i = 0; i < mapped.length; i += batchSize) {
      const batch = mapped.slice(i, i + batchSize);
      const { error: insertError, data: insertData } = await supabase
        .from('crm_companies')
        .insert(batch)
        .select('id');

      if (insertError) {
        console.error(`[sync-hubspot-companies] Insert batch error: ${insertError.message}`);
        errors.push(insertError.message);
      } else {
        inserted += (insertData || []).length;
      }
    }

    console.log(`[sync-hubspot-companies] Synced ${inserted}/${mapped.length} companies`);

    return new Response(JSON.stringify({
      success: true,
      count: inserted,
      total_in_hubspot: hsCompanies.length,
      errors: errors.length > 0 ? errors : undefined,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(`[sync-hubspot-companies] Fatal error: ${err.message}`);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
