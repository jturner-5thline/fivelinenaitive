import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { z } from 'https://esm.sh/zod@3.25.76';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const MessageSchema = z.object({
  from: z.string().min(1).max(500),
  date: z.string().max(1000).optional().default(''),
  subject: z.string().max(1000).optional().default(''),
  body_text: z.string().min(1).max(6000),
  attachments: z.array(z.string().min(1).max(500)).max(20).optional().default([]),
});

const BodySchema = z.object({
  threadId: z.string().min(1).max(500),
  subject: z.string().max(1000).optional().default(''),
  messages: z.array(MessageSchema).min(1).max(50),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const totalChars = parsed.data.messages.reduce((sum, message) => sum + message.body_text.length, 0);
    if (totalChars < 120) {
      return new Response(JSON.stringify({ error: "Couldn't read the selected email thread for summary" }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI service is not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const prompt = [
      'Summarize only the email messages provided below. Do not use deal records, CRM summaries, linked entities, pipeline notes, or any external context.',
      'Return ONLY valid JSON with shape {"bullets":["..."]}.',
      'Write 3 to 8 concise participant-aware bullets in chronological order.',
      'Focus on who said what, concrete updates, diligence questions, revisions, approvals, sent documents, and the latest next step.',
      'Do not sound like an investment memo or deal overview.',
      '',
      `Thread subject: ${parsed.data.subject || ''}`,
      `Thread id: ${parsed.data.threadId}`,
      '',
      JSON.stringify({ messages: parsed.data.messages }, null, 2),
    ].join('\n');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'You are an email thread summarizer. You may only use the provided email messages. Never use outside context. Output strict JSON only.',
          },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('[email-thread-summarizer] gateway error', response.status, text);
      return new Response(JSON.stringify({ error: 'Failed to summarize email thread' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const json = await response.json();
    const content = json?.choices?.[0]?.message?.content;
    const rawText = Array.isArray(content)
      ? content.map((part: any) => part?.text || '').join('')
      : typeof content === 'string'
        ? content
        : '';

    let parsedContent: { bullets?: unknown } | null = null;
    try {
      parsedContent = JSON.parse(rawText);
    } catch {
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        parsedContent = JSON.parse(match[0]);
      }
    }

    const bullets = Array.isArray(parsedContent?.bullets)
      ? parsedContent!.bullets.map((bullet) => String(bullet || '').trim()).filter(Boolean).slice(0, 8)
      : [];

    if (bullets.length === 0) {
      return new Response(JSON.stringify({ error: 'Failed to summarize email thread' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ bullets }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[email-thread-summarizer] error', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});