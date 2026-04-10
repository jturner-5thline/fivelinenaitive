import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { deal_id, pipeline_id, stage, hubspot_deal_id, company_id, amount } = await req.json();

    // Skip if no HubSpot link
    if (!hubspot_deal_id) {
      return new Response(JSON.stringify({ skipped: true, reason: 'no_hubspot_deal_id' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Look up mapping
    const { data: mapping, error: mapError } = await supabase
      .from('hubspot_pipeline_stage_map')
      .select('hubspot_pipeline_id, hubspot_dealstage_id')
      .eq('naitive_pipeline_id', pipeline_id)
      .eq('naitive_stage_name', stage)
      .limit(1)
      .maybeSingle();

    if (mapError) {
      console.error('[hubspot-deal-stage-push] Map lookup error:', mapError.message);
      await logSync(supabase, { company_id, deal_id, hubspot_deal_id, action: 'stage_push', status: 'error', error_message: `Map lookup: ${mapError.message}` });
      return new Response(JSON.stringify({ error: mapError.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!mapping) {
      const msg = `No mapping for pipeline=${pipeline_id}, stage=${stage}`;
      console.warn('[hubspot-deal-stage-push]', msg);
      await logSync(supabase, { company_id, deal_id, hubspot_deal_id, action: 'stage_push', status: 'skipped', error_message: msg });
      return new Response(JSON.stringify({ skipped: true, reason: 'no_mapping', pipeline_id, stage }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get HubSpot token
    const accessToken = Deno.env.get('HUBSPOT_ACCESS_TOKEN');
    if (!accessToken) {
      await logSync(supabase, { company_id, deal_id, hubspot_deal_id, action: 'stage_push', status: 'error', error_message: 'HUBSPOT_ACCESS_TOKEN not configured' });
      return new Response(JSON.stringify({ error: 'HUBSPOT_ACCESS_TOKEN not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Push to HubSpot
    const properties: Record<string, string> = {
      pipeline: mapping.hubspot_pipeline_id,
      dealstage: mapping.hubspot_dealstage_id,
    };
    if (amount !== undefined && amount !== null) {
      properties.amount = String(amount);
    }
    const hubspotPayload = { properties };

    const hsResponse = await fetch(
      `https://api.hubapi.com/crm/v3/objects/deals/${hubspot_deal_id}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(hubspotPayload),
      }
    );

    const hsBody = await hsResponse.text();

    if (!hsResponse.ok) {
      console.error(`[hubspot-deal-stage-push] HubSpot API ${hsResponse.status}: ${hsBody.slice(0, 500)}`);
      await logSync(supabase, {
        company_id, deal_id, hubspot_deal_id,
        action: 'stage_push', status: 'error',
        request_payload: hubspotPayload,
        response_payload: hsBody.slice(0, 2000),
        error_message: `HubSpot ${hsResponse.status}`,
      });
      return new Response(JSON.stringify({ error: `HubSpot API error ${hsResponse.status}` }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[hubspot-deal-stage-push] Pushed deal ${hubspot_deal_id}: pipeline=${mapping.hubspot_pipeline_id}, stage=${mapping.hubspot_dealstage_id}`);
    await logSync(supabase, {
      company_id, deal_id, hubspot_deal_id,
      action: 'stage_push', status: 'success',
      request_payload: hubspotPayload,
    });

    // Update hubspot_last_synced_at on the deal
    await supabase
      .from('deals')
      .update({ hubspot_last_synced_at: new Date().toISOString() })
      .eq('id', deal_id);

    return new Response(JSON.stringify({ success: true, hubspot_deal_id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error(`[hubspot-deal-stage-push] Fatal: ${err.message}`);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function logSync(supabase: any, params: {
  company_id?: string; deal_id?: string; hubspot_deal_id?: string;
  action: string; status: string; request_payload?: any;
  response_payload?: any; error_message?: string;
}) {
  try {
    await supabase.from('hubspot_sync_logs').insert({
      company_id: params.company_id || null,
      deal_id: params.deal_id || null,
      hubspot_deal_id: params.hubspot_deal_id || null,
      direction: 'naitive_to_hubspot',
      action: params.action,
      status: params.status,
      request_payload: params.request_payload || null,
      response_payload: typeof params.response_payload === 'string'
        ? { raw: params.response_payload } : params.response_payload || null,
      error_message: params.error_message || null,
    });
  } catch (e: any) {
    console.error('[hubspot-deal-stage-push] Log insert failed:', e.message);
  }
}
