import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // Determine company_id from caller or request body
    let companyId: string | null = null;
    try {
      const body = await req.json();
      companyId = body?.company_id || null;
    } catch { /* no body */ }

    if (!companyId) {
      const authHeader = req.headers.get('authorization');
      if (authHeader) {
        const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: { user } } = await userClient.auth.getUser();
        if (user) {
          const { data: mem } = await supabase
            .from('company_members').select('company_id')
            .eq('user_id', user.id).limit(1).single();
          if (mem) companyId = mem.company_id;
        }
      }
    }

    if (!companyId) {
      return new Response(JSON.stringify({ error: 'Could not determine company_id' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Fetch HubSpot deal pipelines
    const hsRes = await fetch('https://api.hubapi.com/crm/v3/pipelines/deals', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!hsRes.ok) {
      const errText = await hsRes.text();
      return new Response(JSON.stringify({ error: `HubSpot API ${hsRes.status}`, details: errText.slice(0, 500) }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const hsData = await hsRes.json();
    const hsPipelines: any[] = hsData.results || [];

    // 2. Fetch naitive pipelines for this company
    const { data: naitivePipelines, error: npErr } = await supabase
      .from('deal_pipelines')
      .select('id, name, stages')
      .eq('company_id', companyId);

    if (npErr) {
      return new Response(JSON.stringify({ error: npErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Match pipelines by name (case-insensitive) and map stages
    const mappings: any[] = [];
    const unmapped: any[] = [];

    for (const np of (naitivePipelines || [])) {
      const npName = (np.name || '').toLowerCase().trim();
      const matchedHs = hsPipelines.find(
        (hp: any) => (hp.label || '').toLowerCase().trim() === npName
      );

      if (!matchedHs) {
        unmapped.push({ naitive_pipeline: np.name, reason: 'no_matching_hubspot_pipeline' });
        continue;
      }

      const hsStages: any[] = matchedHs.stages || [];
      const naStages: any[] = Array.isArray(np.stages) ? np.stages : [];

      for (const naStage of naStages) {
        const naLabel = (naStage.label || naStage.name || '').toLowerCase().trim();
        const matchedStage = hsStages.find(
          (hs: any) => (hs.label || '').toLowerCase().trim() === naLabel
        );

        if (matchedStage) {
          mappings.push({
            company_id: companyId,
            naitive_pipeline_id: np.id,
            naitive_stage_name: naStage.label || naStage.name || naStage.id,
            hubspot_pipeline_id: matchedHs.id,
            hubspot_dealstage_id: matchedStage.id,
          });
        } else {
          unmapped.push({
            naitive_pipeline: np.name,
            naitive_stage: naStage.label || naStage.name || naStage.id,
            reason: 'no_matching_hubspot_stage',
          });
        }
      }
    }

    // 4. Upsert mappings
    let inserted = 0;
    if (mappings.length > 0) {
      const { error: upsertErr, data: upsertData } = await supabase
        .from('hubspot_pipeline_stage_map')
        .upsert(mappings, {
          onConflict: 'company_id,naitive_pipeline_id,naitive_stage_name',
        })
        .select('id');

      if (upsertErr) {
        console.error('[hubspot-seed-pipeline-map] Upsert error:', upsertErr.message);
      } else {
        inserted = (upsertData || []).length;
      }
    }

    console.log(`[hubspot-seed-pipeline-map] Mapped ${inserted} stages, ${unmapped.length} unmapped`);

    return new Response(JSON.stringify({
      success: true,
      mapped: inserted,
      unmapped_count: unmapped.length,
      unmapped,
      hubspot_pipelines: hsPipelines.map((p: any) => ({
        id: p.id, label: p.label,
        stages: (p.stages || []).map((s: any) => ({ id: s.id, label: s.label })),
      })),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error(`[hubspot-seed-pipeline-map] Fatal: ${err.message}`);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
