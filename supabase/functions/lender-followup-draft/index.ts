import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * Generate a short, on-brand follow-up email draft for a single lender on a
 * specific deal. Returns { subject, body, category }.
 *
 * Auth: requires a signed-in user (mirrors polish-email-draft).
 * No DB writes — purely a draft generator. The client is responsible for
 * sending via gmail-messages and logging activity.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const lenderName = String(body.lender_name || '').trim();
    const dealName = String(body.deal_name || '').trim();
    const company = String(body.company || '').trim();
    const stage = String(body.stage || '').trim();
    const lastContactDays = Number.isFinite(body.days_since_last_contact)
      ? Number(body.days_since_last_contact)
      : null;
    const contactName = String(body.contact_name || '').trim();
    const senderName = String(body.sender_name || 'James').trim();
    const notes = String(body.notes || '').trim();

    if (!lenderName) {
      return new Response(JSON.stringify({ error: 'lender_name required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Pick a category from the stage / staleness.
    let category = 'Touch Base';
    const lc = stage.toLowerCase();
    if (lc.includes('term') || lc.includes('offer')) category = 'Check on Terms ETA';
    else if (lc.includes('diligence') || lc.includes('review')) category = 'Confirm Receipt';
    else if (lc.includes('intro') || lc.includes('teaser') || lc.includes('initial')) category = 'Re-introduce Deal';
    else if (lastContactDays !== null && lastContactDays >= 7) category = 'Follow Up — Stale';

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI gateway not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const system = [
      "You are 5th Line's writing engine for institutional debt deals.",
      'Draft a short follow-up email from the deal team to a lender contact.',
      'Tone: professional, concise, neutral-warm, no fluff, no marketing language.',
      'Hard rules:',
      '- Plain prose, no markdown, no bullets, no headings.',
      '- 3 to 5 short sentences in the body.',
      '- Never invent numbers, dates, terms, or commitments.',
      '- Sign off as "' + senderName + '" on its own line.',
      'Return STRICT JSON: {"subject": string, "body": string}. No prose outside the JSON.',
    ].join('\n');

    const userMsg = [
      `Deal: ${dealName || '(unnamed)'} for ${company || '(client)'}`,
      `Lender: ${lenderName}`,
      `Lender stage: ${stage || '(unknown)'}`,
      lastContactDays !== null ? `Days since last contact: ${lastContactDays}` : 'No prior contact recorded.',
      contactName ? `Recipient first name: ${contactName.split(' ')[0]}` : 'Recipient first name: there',
      notes ? `Internal notes (do not quote verbatim): ${notes.slice(0, 400)}` : '',
      `Category: ${category}`,
      'Write the follow-up now.',
    ].filter(Boolean).join('\n');

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userMsg },
        ],
        temperature: 0.4,
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text().catch(() => '');
      return new Response(JSON.stringify({ error: `AI gateway error: ${aiResp.status} ${errText.slice(0, 200)}` }), {
        status: aiResp.status === 429 || aiResp.status === 402 ? aiResp.status : 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const aiJson = await aiResp.json();
    const raw = aiJson?.choices?.[0]?.message?.content || '';

    let subject = `Quick follow-up: ${dealName || company || lenderName}`;
    let bodyOut = '';
    try {
      const cleaned = raw.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
      const parsed = JSON.parse(cleaned);
      if (parsed?.subject) subject = String(parsed.subject).trim();
      if (parsed?.body) bodyOut = String(parsed.body).trim();
    } catch {
      // Fallback: treat whole content as body.
      bodyOut = raw.trim();
    }

    if (!bodyOut) {
      bodyOut = [
        `Hi ${contactName ? contactName.split(' ')[0] : 'there'},`,
        '',
        `Just circling back on ${dealName || company}. Wanted to check where things stand on your side.`,
        'Happy to jump on a quick call or send anything else that would help.',
        '',
        senderName,
      ].join('\n');
    }

    return new Response(JSON.stringify({ subject, body: bodyOut, category }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
