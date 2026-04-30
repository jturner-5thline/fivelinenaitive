import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * Polish a user-authored email draft into 5th Line's house style:
 *   concise, institutional-finance tone, neutral-warm, no fluff.
 *
 * Hard rules enforced via the system prompt:
 *   - Preserve every factual statement and commitment exactly.
 *   - Never invent numbers, names, dates, or commitments.
 *   - Keep the user's intent and the rough length.
 *   - Output plain prose only (no markdown, no headings, no bullets unless
 *     the original used them).
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // Auth gate — every Naitive AI surface requires a signed-in user.
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
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const draft = typeof body.draft === 'string' ? body.draft.trim() : '';
    const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
    const recipientName = typeof body.recipientName === 'string' ? body.recipientName.trim() : '';
    const threadContext = typeof body.threadContext === 'string' ? body.threadContext.slice(0, 4000) : '';

    if (draft.length < 8) {
      return new Response(JSON.stringify({ error: 'Draft too short to polish' }), {
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

    const systemPrompt = [
      "You are an editor for 5th Line, a boutique institutional debt-advisory firm.",
      "Polish the user's rough email draft into 5th Line's house voice:",
      "  • Concise, direct, professionally warm — never stiff or corporate.",
      "  • Institutional finance register (think senior debt capital markets).",
      "  • No filler, no 'I hope this finds you well', no marketing language.",
      "  • Short paragraphs. Use a contraction or two; sound like a person.",
      "  • Match the original length within ±25%. Never expand into multi-page prose.",
      "Hard constraints — violations are unacceptable:",
      "  1. Preserve every factual claim, number, date, name, and commitment exactly as written.",
      "  2. Never add new commitments, deadlines, or numbers the user did not write.",
      "  3. Keep the user's intent and overall message structure.",
      "  4. Do NOT add a greeting line if the user did not write one.",
      "  5. Do NOT add a sign-off / signature line. The user's signature is appended separately.",
      "Output: ONLY the polished email body as plain text (preserve line breaks). No markdown, no commentary, no preamble.",
    ].join('\n');

    const userMsg = [
      subject ? `Subject: ${subject}` : null,
      recipientName ? `Writing to: ${recipientName}` : null,
      threadContext ? `Recent thread context (for tone & topic only — do not repeat its content):\n"""\n${threadContext}\n"""` : null,
      `User's rough draft:\n"""\n${draft}\n"""`,
      'Return only the polished body.',
    ].filter(Boolean).join('\n\n');

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMsg },
        ],
        temperature: 0.4,
      }),
    });

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      console.error('AI gateway error', aiResp.status, txt);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limited — please try again in a moment.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted. Add funds in Settings → Workspace → Usage.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'AI gateway error' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const json = await aiResp.json();
    const polished = (json?.choices?.[0]?.message?.content ?? '').trim();
    if (!polished) {
      return new Response(JSON.stringify({ error: 'Empty AI response' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ polished }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('polish-email-draft error', e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});