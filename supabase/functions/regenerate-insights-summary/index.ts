import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * Re-runs the Insights AI summary against the supplied deltas/alerts payload
 * and stores the resulting narrative on report_ai_summaries.
 *
 * Triggered when a user opens / re-runs a saved report whose
 * `ai_regenerate_on_run` flag is true. Honors human-in-the-loop by
 * returning the narrative for explicit save (the caller decides whether
 * to lock it).
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY missing');

    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const {
      reportId,
      periodKey,
      periodLabel,
      deltas = [],
      alerts = [],
      persist = false,
    } = body || {};

    if (!periodKey || !periodLabel) {
      return new Response(JSON.stringify({ error: 'periodKey and periodLabel are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const fmt = (v: number, f: string) => {
      if (f === 'percent') return `${(v ?? 0).toFixed(1)}%`;
      if (f === 'number') return (v ?? 0).toLocaleString();
      const abs = Math.abs(v ?? 0);
      const sign = (v ?? 0) < 0 ? '-' : '';
      if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
      if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
      return `${sign}$${abs.toFixed(0)}`;
    };

    const lines = (deltas as any[]).map((d) => {
      const cur = fmt(d.current, d.format);
      const prev = fmt(d.prevPeriod, d.format);
      const yoy = fmt(d.prevYear, d.format);
      const mom = d.pctMoM == null ? 'n/a' : `${Number(d.pctMoM).toFixed(1)}%`;
      const yoyPct = d.pctYoY == null ? 'n/a' : `${Number(d.pctYoY).toFixed(1)}%`;
      return `- ${d.label}: current ${cur}, prior period ${prev} (MoM ${mom}), prior year ${yoy} (YoY ${yoyPct}). Higher is ${d.goodWhen === 'up' ? 'better' : 'worse'}.`;
    });
    const alertLines = (alerts as any[]).length
      ? (alerts as any[]).map((a) => `- [${String(a.level).toUpperCase()}] ${a.message}`).join('\n')
      : '- No automated trend alerts.';

    const prompt = `You are writing the executive narrative for the naitive Insights dashboard.\n\nReporting period: ${periodLabel}\n\nMetrics (current vs. prior period vs. prior year):\n${lines.join('\n')}\n\nAuto-detected trend alerts:\n${alertLines}\n\nWrite a 2-3 paragraph executive summary, in plain English, for senior leadership. Lead with the headline change, quantify with specific deltas, and call out the most important risk. Do not invent data or deal names not present above. Keep under 220 words. No headings, no bullet lists.`;

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limited, try again shortly' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const t = await aiResp.text();
      return new Response(JSON.stringify({ error: `AI gateway: ${t}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const aiJson = await aiResp.json();
    const narrative: string =
      aiJson?.choices?.[0]?.message?.content?.trim?.() ?? '';
    const model: string = aiJson?.model ?? 'google/gemini-3-flash-preview';

    let saved: any = null;
    if (persist) {
      const { data: companyRow } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', userData.user.id)
        .limit(1)
        .maybeSingle();
      const insertPayload = {
        report_id: reportId ?? null,
        owner_user_id: userData.user.id,
        company_id: companyRow?.company_id ?? null,
        period_key: periodKey,
        period_label: periodLabel,
        narrative,
        deltas,
        alerts,
        model,
        locked_at: null,
      };
      const { data, error } = await supabase
        .from('report_ai_summaries')
        .insert(insertPayload)
        .select()
        .single();
      if (error) {
        return new Response(JSON.stringify({ error: error.message, narrative }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      saved = data;
    }

    return new Response(JSON.stringify({ success: true, narrative, model, saved }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});