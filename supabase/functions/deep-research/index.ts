import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface DeepResearchRequest {
  query: string;
  dealId?: string;
  preset?: 'deep-research' | 'advanced-deep-research' | 'pro-search';
  instructions?: string;
  maxSteps?: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth
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

    const { query, dealId, preset = 'deep-research', instructions, maxSteps }: DeepResearchRequest = await req.json();

    if (!query?.trim()) {
      return new Response(JSON.stringify({ error: 'query is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Optionally enrich with deal context
    let dealContext = '';
    if (dealId) {
      const { data: deal } = await supabase
        .from('deals')
        .select('company, industry, value, deal_type, borrower_state, borrower_city, stage')
        .eq('id', dealId)
        .single();

      if (deal) {
        dealContext = `\n\nDeal Context: Company "${deal.company}", Industry "${deal.industry || 'N/A'}", ` +
          `Deal Size $${deal.value ? (deal.value / 1_000_000).toFixed(1) + 'M' : 'undisclosed'}, ` +
          `Type "${deal.deal_type || 'commercial loan'}", ` +
          `Location "${deal.borrower_state || deal.borrower_city || 'N/A'}", Stage "${deal.stage || 'N/A'}".`;
      }
    }

    const systemInstructions = instructions ||
      'You are a senior financial research analyst for a commercial lending advisory firm. ' +
      'Provide thorough, well-sourced analysis with specific data points, dates, and figures. ' +
      'Structure your response with clear headers and sections. ' +
      'Always cite your sources with URLs when possible.';

    // Build Agent API request body
    const agentBody: Record<string, unknown> = {
      preset,
      input: query + dealContext,
      instructions: systemInstructions,
      tools: [
        { type: 'web_search' },
        { type: 'fetch_url' },
      ],
    };

    if (maxSteps) {
      agentBody.max_steps = Math.min(maxSteps, 10);
    }

    console.log(`Deep research: preset=${preset}, deal=${dealId || 'none'}, query="${query.substring(0, 80)}..."`);

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
      console.error('Perplexity Agent API error:', response.status, errorText);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Perplexity API credits exhausted. Please check your billing.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ error: `Agent API error: ${response.status}` }), {
        status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();

    // Extract content from Agent API response format
    // The response has an `output` array with items; text content is in items with type "message"
    let content = '';
    const citations: string[] = [];

    if (data.output_text) {
      // Convenience property aggregates all text
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

    // Extract citations from the response
    if (data.citations && Array.isArray(data.citations)) {
      citations.push(...data.citations);
    }

    // Extract usage/cost info if available
    const usage = data.usage || null;

    // Cache result if tied to a deal
    if (dealId && content) {
      const { error: cacheError } = await supabase
        .from('deal_research_cache')
        .upsert({
          deal_id: dealId,
          research_type: `deep_research_${preset}`,
          content: content.trim(),
          citations,
          generated_by: user.id,
          expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), // 48h cache
          metadata: {
            preset,
            query,
            model: data.model || preset,
            usage,
          },
        }, { onConflict: 'deal_id,research_type' });

      if (cacheError) {
        console.error('Failed to cache deep research:', cacheError);
      }
    }

    return new Response(JSON.stringify({
      content: content.trim() || 'No results from deep research.',
      citations,
      model: data.model || preset,
      usage,
      timestamp: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in deep-research:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
