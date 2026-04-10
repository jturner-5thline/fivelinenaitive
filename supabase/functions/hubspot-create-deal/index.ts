import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Forward-only cutoff ───────────────────────────────────────────────
// Only deals created on or after this timestamp will be synced to HubSpot.
// This prevents any historical backfill of existing deals.
const HUBSPOT_SYNC_ENABLED_FROM = '2026-04-10T00:00:00Z';

// ─── Pipeline mapping ─────────────────────────────────────────────────
const HUBSPOT_PIPELINE_MAP: Record<string, string> = {
  'Active Pipeline': 'default',
  'In Development': '1768501',
};

// ─── Stage resolver ───────────────────────────────────────────────────
// Fetches stages for a HubSpot pipeline and finds one matching the
// Naitive stage label (case-insensitive).
async function resolveHubSpotStage(
  hubspotPipelineId: string,
  naitiveStageLabel: string,
  accessToken: string,
): Promise<{ stageId: string | null; error: string | null }> {
  try {
    const res = await fetch(
      `https://api.hubapi.com/crm/v3/pipelines/deals/${hubspotPipelineId}/stages`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    const body = await res.text();
    if (!res.ok) {
      return { stageId: null, error: `HubSpot stages API ${res.status}: ${body.slice(0, 500)}` };
    }

    const parsed = JSON.parse(body);
    const stages: { id: string; label: string }[] = parsed.results ?? parsed;
    const match = stages.find(
      (s) => s.label.toLowerCase() === naitiveStageLabel.toLowerCase(),
    );

    if (!match) {
      return {
        stageId: null,
        error: `No HubSpot stage matching "${naitiveStageLabel}" in pipeline ${hubspotPipelineId}. Available: ${stages.map((s) => s.label).join(', ')}`,
      };
    }

    return { stageId: match.id, error: null };
  } catch (err: any) {
    return { stageId: null, error: `Stage lookup failed: ${err.message}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { deal_id } = await req.json();
    if (!deal_id) {
      return new Response(JSON.stringify({ error: 'deal_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Load deal ─────────────────────────────────────────────────────
    const { data: deal, error: dealErr } = await supabase
      .from('deals')
      .select('id, company, value, stage, pipeline_id, created_at, hubspot_deal_id, company_id')
      .eq('id', deal_id)
      .single();

    if (dealErr || !deal) {
      return new Response(JSON.stringify({ error: `Deal not found: ${dealErr?.message}` }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Forward-only guard ────────────────────────────────────────────
    if (deal.created_at < HUBSPOT_SYNC_ENABLED_FROM) {
      await supabase.from('deals').update({
        hubspot_sync_status: 'skipped',
        hubspot_sync_error: 'Skipped historical deal created before HubSpot sync launch',
      }).eq('id', deal_id);

      return new Response(JSON.stringify({ skipped: true, reason: 'historical_deal' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Idempotency guard ─────────────────────────────────────────────
    if (deal.hubspot_deal_id) {
      return new Response(JSON.stringify({ skipped: true, reason: 'already_synced', hubspot_deal_id: deal.hubspot_deal_id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Resolve Naitive pipeline name ─────────────────────────────────
    let pipelineName = 'Active Pipeline'; // default
    if (deal.pipeline_id) {
      const { data: pipeline } = await supabase
        .from('deal_pipelines')
        .select('name, stages')
        .eq('id', deal.pipeline_id)
        .single();

      if (pipeline) {
        pipelineName = pipeline.name;
      }
    }

    // ── Resolve Naitive stage label from pipeline stages JSON ─────────
    let stageLabel = deal.stage; // fallback to raw stage ID
    if (deal.pipeline_id) {
      const { data: pipeline } = await supabase
        .from('deal_pipelines')
        .select('stages')
        .eq('id', deal.pipeline_id)
        .single();

      if (pipeline?.stages) {
        const stages = pipeline.stages as Array<{ id: string; label: string }>;
        const found = stages.find((s) => s.id === deal.stage);
        if (found) stageLabel = found.label;
      }
    }

    // ── Map to HubSpot pipeline ───────────────────────────────────────
    const hubspotPipelineId = HUBSPOT_PIPELINE_MAP[pipelineName];
    if (!hubspotPipelineId) {
      const msg = `No HubSpot pipeline mapping for Naitive pipeline "${pipelineName}"`;
      console.error(`[hubspot-create-deal] ${msg}`);
      await supabase.from('deals').update({
        hubspot_sync_status: 'failed',
        hubspot_sync_error: msg,
      }).eq('id', deal_id);

      return new Response(JSON.stringify({ error: msg }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Resolve HubSpot stage ─────────────────────────────────────────
    const accessToken = Deno.env.get('HUBSPOT_ACCESS_TOKEN');
    if (!accessToken) {
      await supabase.from('deals').update({
        hubspot_sync_status: 'failed',
        hubspot_sync_error: 'HUBSPOT_ACCESS_TOKEN not configured',
      }).eq('id', deal_id);

      return new Response(JSON.stringify({ error: 'HUBSPOT_ACCESS_TOKEN not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { stageId: hubspotStageId, error: stageError } = await resolveHubSpotStage(
      hubspotPipelineId,
      stageLabel,
      accessToken,
    );

    if (stageError || !hubspotStageId) {
      console.error(`[hubspot-create-deal] Stage resolution failed: ${stageError}`);
      await supabase.from('deals').update({
        hubspot_sync_status: 'failed',
        hubspot_sync_error: stageError || 'Unknown stage resolution error',
      }).eq('id', deal_id);

      return new Response(JSON.stringify({ error: stageError }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Create deal in HubSpot ────────────────────────────────────────
    const hubspotPayload = {
      properties: {
        dealname: deal.company || 'Untitled Deal',
        amount: String(deal.value || 0),
        pipeline: hubspotPipelineId,
        dealstage: hubspotStageId,
      },
    };

    const hsResponse = await fetch('https://api.hubapi.com/crm/v3/objects/deals', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(hubspotPayload),
    });

    const hsBody = await hsResponse.text();

    if (!hsResponse.ok) {
      console.error(`[hubspot-create-deal] HubSpot API ${hsResponse.status}: ${hsBody.slice(0, 500)}`);
      await supabase.from('deals').update({
        hubspot_sync_status: 'failed',
        hubspot_sync_error: `HubSpot ${hsResponse.status}: ${hsBody.slice(0, 500)}`,
      }).eq('id', deal_id);

      // Log to hubspot_sync_logs
      await logSync(supabase, {
        company_id: deal.company_id,
        deal_id: deal.id,
        action: 'create_deal',
        status: 'error',
        request_payload: hubspotPayload,
        response_payload: hsBody.slice(0, 2000),
        error_message: `HubSpot ${hsResponse.status}`,
      });

      return new Response(JSON.stringify({ error: `HubSpot API error ${hsResponse.status}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const hsResult = JSON.parse(hsBody);
    const hubspotDealId = hsResult.id;

    // ── Update Naitive deal with HubSpot ID ───────────────────────────
    await supabase.from('deals').update({
      hubspot_deal_id: hubspotDealId,
      hubspot_sync_status: 'success',
      hubspot_sync_error: null,
      hubspot_last_synced_at: new Date().toISOString(),
    }).eq('id', deal_id);

    // Log success
    await logSync(supabase, {
      company_id: deal.company_id,
      deal_id: deal.id,
      hubspot_deal_id: hubspotDealId,
      action: 'create_deal',
      status: 'success',
      request_payload: hubspotPayload,
    });

    console.log(`[hubspot-create-deal] Created HubSpot deal ${hubspotDealId} for Naitive deal ${deal_id}`);

    return new Response(JSON.stringify({ success: true, hubspot_deal_id: hubspotDealId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error(`[hubspot-create-deal] Fatal: ${err.message}`);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
    console.error('[hubspot-create-deal] Log insert failed:', e.message);
  }
}
