import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

type ResearchMode = 'general' | 'lender-matching' | 'task-execution';

interface DeepResearchRequest {
  query: string;
  dealId?: string;
  preset?: 'deep-research' | 'advanced-deep-research' | 'pro-search';
  mode?: ResearchMode;
  instructions?: string;
  maxSteps?: number;
  companyName?: string;
  industry?: string;
  dealValue?: number;
  dealType?: string;
  location?: string;
  revenueRange?: string;
  existingLenders?: string[];
  taskTitle?: string;
  taskDescription?: string;
  taskContext?: string;
}

function formatDealSize(value?: number): string {
  if (!value) return 'undisclosed';
  return value >= 1_000_000
    ? `$${(value / 1_000_000).toFixed(1)}M`
    : `$${(value / 1_000).toFixed(0)}K`;
}

function buildLenderMatchingMessages(req: DeepResearchRequest): { system: string; user: string } {
  const system = `You are a senior debt placement advisor. Identify and rank the best lender matches for the financing opportunity described. Be specific with real institution names and current market data. Structure output with markdown headers and tables. Cite sources.`;

  const excludeNote = req.existingLenders?.length
    ? `\nExclude these lenders already under consideration: ${req.existingLenders.join(', ')}`
    : '';

  const user = `Find the best lender matches for:
- Company: ${req.companyName || req.query}
- Industry: ${req.industry || 'Not specified'}
- Deal Type: ${req.dealType || 'Debt financing'}
- Deal Size: ${formatDealSize(req.dealValue)}
${req.location ? `- Location: ${req.location}` : ''}
${req.revenueRange ? `- Revenue: ${req.revenueRange}` : ''}${excludeNote}

Provide:
1. **Market Context** — current lending appetite in this sector, recent comparable deals
2. **8-12 Recommended Lenders** — for each: Name, Type (Bank/BDC/Private Credit/Specialty), Why They Fit (specific evidence), Typical Terms, Recent Comparable Deal, Appetite Signal
3. **Ranked Tiers** — Tier 1 (best fit), Tier 2 (good fit), Stretch (possible)
4. **Outreach Strategy** — suggested sequence and approach`;

  return { system, user };
}

function buildTaskExecutionMessages(req: DeepResearchRequest): { system: string; user: string } {
  const system = `You are a senior financial research analyst. Execute the research task thoroughly with specific data, dates, and figures. Use structured markdown. Cite all sources. Start with a brief executive summary.`;

  const user = `Research task: ${req.taskTitle || req.query}
${req.taskDescription ? `\nDescription: ${req.taskDescription}` : ''}
${req.taskContext ? `\nContext: ${req.taskContext}` : ''}

Deliver:
1. Executive summary (2-3 sentences)
2. Detailed findings with specific data points
3. Key takeaways and recommended actions
4. Sources and confidence levels`;

  return { system, user };
}

async function callChatCompletions(apiKey: string, system: string, userMsg: string, searchMode?: string): Promise<{ content: string; citations: string[]; model: string; usage: Record<string, unknown> | null }> {
  const body: Record<string, unknown> = {
    model: 'sonar-pro',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userMsg },
    ],
    max_tokens: 4000,
    temperature: 0.2,
  };

  if (searchMode) {
    body.search_mode = searchMode;
  }

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw { status: response.status, message: errorText };
  }

  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content || '',
    citations: data.citations || [],
    model: data.model || 'sonar-pro',
    usage: data.usage || null,
  };
}

async function callAgentAPI(apiKey: string, query: string, instructions: string, preset: string, maxSteps?: number): Promise<{ content: string; citations: string[]; model: string; usage: Record<string, unknown> | null }> {
  const agentBody: Record<string, unknown> = {
    preset,
    input: query,
    instructions,
    tools: [{ type: 'web_search' }, { type: 'fetch_url' }],
  };
  if (maxSteps) agentBody.max_steps = Math.min(maxSteps, 10);

  const response = await fetch('https://api.perplexity.ai/v1/agent', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(agentBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw { status: response.status, message: errorText };
  }

  const data = await response.json();
  let content = '';
  const citations: string[] = [];

  if (data.output_text) {
    content = data.output_text;
  } else if (data.output && Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item.type === 'message' && item.content) {
        if (Array.isArray(item.content)) {
          for (const part of item.content) {
            if (part.type === 'output_text' || part.type === 'text') {
              content += (part.text || '') + '\n';
            }
          }
        } else if (typeof item.content === 'string') {
          content += item.content + '\n';
        }
      }
    }
  }

  if (data.citations && Array.isArray(data.citations)) {
    citations.push(...data.citations);
  }

  return { content, citations, model: data.model || preset, usage: data.usage || null };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('PERPLEXITY_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Perplexity API key not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: DeepResearchRequest = await req.json();
    const { dealId, preset = 'deep-research', mode = 'general', maxSteps } = body;

    if (!body.query?.trim() && mode === 'general') {
      return new Response(JSON.stringify({ error: 'query is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Deep research: mode=${mode}, preset=${preset}, deal=${dealId || 'none'}`);

    let result: { content: string; citations: string[]; model: string; usage: Record<string, unknown> | null };

    if (mode === 'lender-matching') {
      // Enrich from deal if needed
      if (dealId && !body.companyName) {
        const { data: deal } = await supabase
          .from('deals')
          .select('company, industry, value, deal_type, borrower_state, borrower_city')
          .eq('id', dealId)
          .single();
        if (deal) {
          body.companyName = body.companyName || deal.company;
          body.industry = body.industry || deal.industry || undefined;
          body.dealValue = body.dealValue || deal.value || undefined;
          body.dealType = body.dealType || deal.deal_type || undefined;
          body.location = body.location || deal.borrower_state || deal.borrower_city || undefined;
        }
      }
      const { system, user: userMsg } = buildLenderMatchingMessages(body);
      result = await callChatCompletions(apiKey, system, userMsg);

    } else if (mode === 'task-execution') {
      const { system, user: userMsg } = buildTaskExecutionMessages(body);
      result = await callChatCompletions(apiKey, system, userMsg);

    } else {
      // General mode — use Agent API for true deep research
      let finalQuery = body.query;
      const finalInstructions = body.instructions ||
        'You are a senior financial research analyst. Provide thorough, well-sourced analysis with specific data. Structure with clear headers. Cite sources with URLs.';

      if (dealId) {
        const { data: deal } = await supabase
          .from('deals')
          .select('company, industry, value, deal_type, borrower_state, borrower_city, stage')
          .eq('id', dealId)
          .single();
        if (deal) {
          finalQuery += `\n\nDeal Context: "${deal.company}", ${deal.industry || 'N/A'} industry, ${formatDealSize(deal.value)}, ${deal.deal_type || 'commercial loan'}, ${deal.borrower_state || 'N/A'}.`;
        }
      }

      result = await callAgentAPI(apiKey, finalQuery, finalInstructions, preset, maxSteps);
    }

    // Cache if tied to a deal
    if (dealId && result.content) {
      const cacheType = mode === 'lender-matching'
        ? 'deep_lender_matching'
        : mode === 'task-execution'
          ? 'deep_task_execution'
          : `deep_research_${preset}`;

      const { error: cacheError } = await supabase
        .from('deal_research_cache')
        .upsert({
          deal_id: dealId,
          research_type: cacheType,
          content: result.content.trim(),
          citations: result.citations,
          generated_by: user.id,
          expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
          metadata: {
            preset, mode,
            query: (body.query || body.taskTitle || '').substring(0, 200),
            model: result.model,
            usage: result.usage,
          },
        }, { onConflict: 'deal_id,research_type' });

      if (cacheError) console.error('Cache error:', cacheError);
    }

    return new Response(JSON.stringify({
      content: result.content.trim() || 'No results from deep research.',
      citations: result.citations,
      model: result.model,
      mode,
      usage: result.usage,
      timestamp: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const status = (error as any)?.status || 500;
    const message = (error as any)?.message || (error instanceof Error ? error.message : 'Unknown error');
    console.error('Error in deep-research:', message);

    if (status === 429) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: typeof message === 'string' ? message : `API error: ${status}` }), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
