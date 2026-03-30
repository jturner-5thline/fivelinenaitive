import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

async function hubspotRequest(endpoint: string, accessToken: string): Promise<any> {
  const url = `${HUBSPOT_API_BASE}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  const text = await response.text();
  if (!response.ok) {
    console.error(`[sync-hubspot-companies] API error ${response.status}: ${text.slice(0, 200)}`);
    throw new Error(`HubSpot API error: ${response.status}`);
  }
  return text ? JSON.parse(text) : null;
}

const ESSENTIAL_PROPERTIES = [
  'name', 'domain', 'website', 'industry', 'numberofemployees',
  'description', 'phone', 'city', 'state', 'country', 'zip', 'address',
  'annualrevenue', 'lifecyclestage', 'type', 'linkedin_company_page',
  'twitterhandle', 'recent_deal_amount', 'recent_deal_close_date',
  'total_revenue', 'founded_year', 'is_public', 'hs_lead_status',
  'num_associated_contacts', 'num_associated_deals',
].join(',');

function mapEmployeeRange(count: string | null | undefined): string | null {
  if (!count) return null;
  const n = parseInt(count, 10);
  if (isNaN(n)) return count;
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
  if (lower.includes('customer')) return 'customer';
  if (lower.includes('partner')) return 'partner';
  if (lower.includes('vendor') || lower === 'reseller') return 'vendor';
  return 'prospect';
}

function mapLifecycleStage(hsStage: string | null | undefined): string {
  if (!hsStage) return 'target';
  const mapping: Record<string, string> = {
    subscriber: 'target', lead: 'target',
    marketingqualifiedlead: 'engaged', salesqualifiedlead: 'engaged',
    opportunity: 'opportunity', customer: 'customer',
    evangelist: 'expansion', other: 'target',
  };
  return mapping[hsStage.toLowerCase()] || 'target';
}

function mapHubSpotCompany(hs: any, orgCompanyId: string, createdBy: string | null): Record<string, any> {
  const props = hs.properties || {};
  const domain = props.domain || null;
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
    custom_fields: {
      recent_deal_amount: props.recent_deal_amount,
      recent_deal_close_date: props.recent_deal_close_date,
      total_revenue: props.total_revenue,
      founded_year: props.founded_year,
      is_public: props.is_public,
      hs_lead_status: props.hs_lead_status,
      num_associated_contacts: props.num_associated_contacts,
      num_associated_deals: props.num_associated_deals,
    },
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

    // Parse optional cursor from request body for resumable sync
    let resumeAfter: string | undefined;
    let skipDelete = false;
    try {
      const body = await req.json();
      resumeAfter = body?.after;
      skipDelete = !!body?.after; // Don't delete if resuming
    } catch { /* no body */ }

    // Get caller info
    let callerUserId: string | null = null;
    const authHeader = req.headers.get('authorization');
    if (authHeader) {
      const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      callerUserId = user?.id || null;
    }

    // Find org company
    let orgCompanyId: string | null = null;
    if (callerUserId) {
      const { data: membership } = await supabase
        .from('company_members').select('company_id')
        .eq('user_id', callerUserId).limit(1).single();
      if (membership) orgCompanyId = membership.company_id;
    }
    if (!orgCompanyId) {
      const { data: integration } = await supabase
        .from('integrations').select('company_id')
        .eq('provider', 'hubspot').limit(1).single();
      if (integration) orgCompanyId = integration.company_id;
    }
    if (!orgCompanyId) {
      const { data: co } = await supabase
        .from('companies').select('id')
        .or('primary_domain.eq.5thline.co,name.ilike.%5th Line%')
        .limit(1).single();
      if (co) orgCompanyId = co.id;
    }
    if (!orgCompanyId) {
      return new Response(JSON.stringify({ error: 'Could not determine org company' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[sync-hubspot-companies] Org: ${orgCompanyId}, caller: ${callerUserId}, resume: ${resumeAfter || 'none'}`);

    // Delete existing if this is a fresh sync (not a resume)
    if (!skipDelete) {
      const { error: deleteError } = await supabase
        .from('crm_companies').delete().eq('org_company_id', orgCompanyId);
      if (deleteError) console.error(`[sync-hubspot-companies] Delete error: ${deleteError.message}`);
      else console.log(`[sync-hubspot-companies] Cleared existing companies`);
    }

    // Stream: fetch a page, insert immediately, move to next
    const startTime = Date.now();
    const MAX_RUNTIME_MS = 120_000; // 120s safety margin (wall time is 150s)
    let after = resumeAfter;
    let totalFetched = 0;
    let totalInserted = 0;
    let lastAfter: string | undefined;
    let timedOut = false;

    do {
      // Check time budget
      if (Date.now() - startTime > MAX_RUNTIME_MS) {
        console.log(`[sync-hubspot-companies] Time budget exceeded at ${totalFetched} companies`);
        timedOut = true;
        break;
      }

      let endpoint = `/crm/v3/objects/companies?limit=100&properties=${ESSENTIAL_PROPERTIES}`;
      if (after) endpoint += `&after=${after}`;

      const data = await hubspotRequest(endpoint, accessToken);
      const results = data.results || [];
      totalFetched += results.length;
      lastAfter = data.paging?.next?.after;

      if (results.length > 0) {
        const mapped = results.map((hs: any) => mapHubSpotCompany(hs, orgCompanyId!, callerUserId));
        const { data: insertData, error: insertError } = await supabase
          .from('crm_companies').insert(mapped).select('id');
        
        if (insertError) {
          console.error(`[sync-hubspot-companies] Insert error: ${insertError.message}`);
        } else {
          totalInserted += (insertData || []).length;
        }
      }

      after = lastAfter;
      if (totalFetched % 1000 === 0) {
        console.log(`[sync-hubspot-companies] Progress: ${totalFetched} fetched, ${totalInserted} inserted`);
      }
    } while (after);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[sync-hubspot-companies] Done: ${totalInserted}/${totalFetched} in ${duration}s, timedOut=${timedOut}`);

    return new Response(JSON.stringify({
      success: true,
      count: totalInserted,
      total_fetched: totalFetched,
      duration_seconds: parseFloat(duration),
      timed_out: timedOut,
      resume_after: timedOut ? lastAfter : undefined,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(`[sync-hubspot-companies] Fatal: ${err.message}`);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
