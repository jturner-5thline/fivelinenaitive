import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * Generate two post-management-call follow-up email drafts (one to the
 * client, one to the lender) from a meeting transcript.
 *
 * Auth: requires a signed-in user.
 * No DB writes — purely a draft generator. The client renders the drafts
 * for review and copy/send.
 *
 * Request body:
 *   {
 *     transcript: string,
 *     company_name: string,
 *     lender_name: string,
 *     client_first_name: string,
 *     lender_first_name: string,
 *     deal_manager_name: string,
 *   }
 *
 * Response:
 *   {
 *     client_email: { subject: string, body: string },
 *     lender_email: { subject: string, body: string },
 *     next_steps: string[],
 *   }
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
    const transcript = String(body.transcript || '').trim();
    const companyName = String(body.company_name || '').trim();
    const lenderName = String(body.lender_name || '').trim();
    const clientFirstName = String(body.client_first_name || '').trim();
    const lenderFirstName = String(body.lender_first_name || '').trim();
    const dealManagerName = String(body.deal_manager_name || '').trim();

    if (!transcript) {
      return new Response(JSON.stringify({ error: 'transcript required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI gateway not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Cap transcript size to keep token usage bounded. Keep the head and tail
    // since intros and next-steps tend to live at both ends of a call.
    const MAX_CHARS = 60_000;
    let trimmed = transcript;
    if (transcript.length > MAX_CHARS) {
      const half = Math.floor(MAX_CHARS / 2);
      trimmed =
        transcript.slice(0, half) +
        '\n\n…[transcript truncated for length]…\n\n' +
        transcript.slice(-half);
    }

    const system = [
      "You are 5th Line's writing engine for institutional debt deals.",
      'Read the management-call transcript and produce TWO short follow-up emails:',
      '  1) client_email — to the client (the borrower).',
      '  2) lender_email — to the lender.',
      'Tone: professional, concise, neutral-warm, no fluff, no marketing language.',
      'Hard rules:',
      '- Plain prose. No markdown, no bullets, no headings inside the email body.',
      '- 3 to 6 short sentences per body.',
      '- Never invent numbers, dates, terms, or commitments not in the transcript.',
      '- Use the provided names exactly. If a name is missing, omit the placeholder rather than inventing one.',
      '',
      'CLIENT EMAIL requirements:',
      `- Salutation: "Hi ${clientFirstName || '[Client First Name]'},"`,
      '- Open by saying the meeting went well.',
      '- Then communicate the next steps as the LENDER described them on the call.',
      `- Sign-off on its own line: "Best,\\n${dealManagerName || '[Deal Manager Name]'}"`,
      '',
      'LENDER EMAIL requirements:',
      `- Salutation: "Hi ${lenderFirstName || '[Lender First Name]'},"`,
      '- Open by saying the meeting went well.',
      '- Reiterate the next steps you understood from the call and ask the lender to confirm that sounds right.',
      '- If next steps are unclear from the transcript, instead ask when you can expect feedback.',
      `- Sign-off on its own line: "Best,\\n${dealManagerName || '[Deal Manager Name]'}"`,
      '',
      'Subjects: short and specific, e.g. "[Company] x [Lender] — Next steps from today\'s call".',
      '',
      'Return STRICT JSON ONLY in this shape (no prose outside the JSON):',
      '{"next_steps":[string,...],"client_email":{"subject":string,"body":string},"lender_email":{"subject":string,"body":string}}',
    ].join('\n');

    const userMsg = [
      `Company: ${companyName || '(unspecified)'}`,
      `Lender: ${lenderName || '(unspecified)'}`,
      `Client first name: ${clientFirstName || '(unspecified)'}`,
      `Lender first name: ${lenderFirstName || '(unspecified)'}`,
      `Deal manager name: ${dealManagerName || '(unspecified)'}`,
      '',
      'Transcript follows between the markers. Extract next steps and key discussion points, then draft both emails.',
      '<<<TRANSCRIPT_START>>>',
      trimmed,
      '<<<TRANSCRIPT_END>>>',
    ].join('\n');

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userMsg },
        ],
        temperature: 0.4,
        response_format: { type: 'json_object' },
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error('[post-call-followup-drafts] AI gateway error', aiResp.status, t);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded — please try again in a moment.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted — add funds in Settings → Workspace → Usage.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'AI gateway error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiJson = await aiResp.json();
    const raw = aiJson?.choices?.[0]?.message?.content || '';

    let parsed: any = null;
    try {
      const cleaned = String(raw).replace(/^```json\s*/i, '').replace(/```$/, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error('[post-call-followup-drafts] failed to parse AI JSON', e, raw?.slice?.(0, 400));
      return new Response(JSON.stringify({ error: 'AI returned malformed JSON' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const out = {
      next_steps: Array.isArray(parsed?.next_steps) ? parsed.next_steps.map((s: unknown) => String(s)).slice(0, 12) : [],
      client_email: {
        subject: String(parsed?.client_email?.subject || '').trim(),
        body: String(parsed?.client_email?.body || '').trim(),
      },
      lender_email: {
        subject: String(parsed?.lender_email?.subject || '').trim(),
        body: String(parsed?.lender_email?.body || '').trim(),
      },
    };

    return new Response(JSON.stringify(out), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[post-call-followup-drafts] error', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});