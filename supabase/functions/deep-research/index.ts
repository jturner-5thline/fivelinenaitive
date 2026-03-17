import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  // Lender matching specific
  companyName?: string;
  industry?: string;
  dealValue?: number;
  dealType?: string;
  location?: string;
  revenueRange?: string;
  existingLenders?: string[];
  // Task execution specific
  taskTitle?: string;
  taskDescription?: string;
  taskContext?: string;
}

function buildLenderMatchingQuery(req: DeepResearchRequest): { query: string; instructions: string } {
  const dealSizeLabel = req.dealValue
    ? req.dealValue >= 1_000_000
      ? `$${(req.dealValue / 1_000_000).toFixed(1)}M`
      : `$${(req.dealValue / 1_000).toFixed(0)}K`
    : 'undisclosed';

  const query = `Conduct deep research to find the best lender matches for this financing opportunity:

**Company:** ${req.companyName || req.query}
**Industry:** ${req.industry || 'Not specified'}
**Deal Type:** ${req.dealType || 'Debt financing'}
**Deal Size:** ${dealSizeLabel}
${req.location ? `**Location:** ${req.location}` : ''}
${req.revenueRange ? `**Revenue Range:** ${req.revenueRange}` : ''}
${req.existingLenders?.length ? `**Already considering (exclude):** ${req.existingLenders.join(', ')}` : ''}

Research Phase 1 — Market Landscape:
- Current lending appetite in the ${req.industry || 'target'} sector
- Recent comparable deals closed in the last 6 months (sizes, rates, structures)
- Which lender categories are most active (banks, BDCs, private credit, specialty)

Research Phase 2 — Specific Lender Identification:
For each of 8-12 recommended lenders, research and provide:
1. **Lender Name** (actual institution)
2. **Type** (Bank / BDC / Private Credit / Specialty)
3. **Why They Fit** — specific evidence: recent deals, stated sector focus, geographic presence
4. **Typical Terms** — deal size sweet spot, rate range, tenor, structure preferences
5. **Recent Deals** — name 1-2 actual recent transactions if findable
6. **Key Contact / Coverage** — division or team that handles this deal type
7. **Appetite Signal** — any public statements about growing/reducing exposure to this sector
8. **Potential Concerns** — reasons they might pass (size, sector concentration, geography)

Research Phase 3 — Strategic Recommendations:
- Rank lenders by likelihood of engagement (Tier 1 / Tier 2 / Stretch)
- Suggest an outreach sequence (who to approach first, club deal potential)
- Flag any market timing considerations (rate environment, seasonal patterns)
- Note if a competitive process or bilateral approach is better suited`;

  const instructions = `You are a senior debt placement advisor at a top-tier commercial lending advisory firm.
Your role is to identify and evaluate potential lenders for specific financing opportunities.
You have access to web search and URL fetching — use them extensively to find:
- Recent deal announcements and league tables
- Lender websites and their stated sector/size focus  
- Industry publications (LevFin Insights, Debtwire, PitchBook, LCD)
- Regulatory filings showing lender activity
Always cite your sources. Be specific with real institution names, actual deal data, and current market conditions.
Never fabricate lender names or deal details — if you can't verify, say so.
Structure your output with clear markdown headers and tables where appropriate.`;

  return { query, instructions };
}

function buildTaskExecutionQuery(req: DeepResearchRequest): { query: string; instructions: string } {
  const query = `Execute the following research task thoroughly:

**Task:** ${req.taskTitle || req.query}
${req.taskDescription ? `**Description:** ${req.taskDescription}` : ''}
${req.taskContext ? `**Context:** ${req.taskContext}` : ''}

Conduct multi-step research to complete this task:

Step 1 — Understand Requirements:
- Parse the task to identify all research questions and deliverables
- Identify the key data points, comparisons, or analyses needed

Step 2 — Gather Intelligence:
- Search for the most current, authoritative sources
- Cross-reference multiple sources for accuracy
- Fetch full content from the most relevant pages
- Look for data tables, statistics, and quantitative evidence

Step 3 — Synthesize & Deliver:
- Organize findings into a clear, actionable format
- Include specific numbers, dates, and named entities
- Highlight key takeaways and recommended actions
- Flag any information gaps or areas of uncertainty

Step 4 — Quality Check:
- Verify claims against multiple sources where possible
- Note confidence levels for key assertions
- Provide source URLs for all major claims`;

  const instructions = `You are a senior research analyst at a financial advisory firm executing deal-related research tasks.
Your output should be immediately actionable — imagine the banker reading this needs to brief a client or prepare for a call within the hour.
Use web search and URL fetching extensively. Prioritize:
- Accuracy over speed — verify key claims
- Recency — flag when data might be stale
- Specificity — use real names, numbers, dates
- Structure — use headers, tables, and bullet points
Format output as professional markdown. Include a brief executive summary at the top.
Always cite sources with URLs.`;

  return { query, instructions };
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

    // Build mode-specific query and instructions
    let finalQuery: string;
    let finalInstructions: string;

    if (mode === 'lender-matching') {
      const built = buildLenderMatchingQuery(body);
      finalQuery = built.query;
      finalInstructions = built.instructions;
    } else if (mode === 'task-execution') {
      const built = buildTaskExecutionQuery(body);
      finalQuery = built.query;
      finalInstructions = built.instructions;
    } else {
      // General mode — enrich with deal context if available
      finalQuery = body.query;
      finalInstructions = body.instructions ||
        'You are a senior financial research analyst for a commercial lending advisory firm. ' +
        'Provide thorough, well-sourced analysis with specific data points, dates, and figures. ' +
        'Structure your response with clear headers and sections. ' +
        'Always cite your sources with URLs when possible.';

      if (dealId) {
        const { data: deal } = await supabase
          .from('deals')
          .select('company, industry, value, deal_type, borrower_state, borrower_city, stage')
          .eq('id', dealId)
          .single();

        if (deal) {
          finalQuery += `\n\nDeal Context: Company "${deal.company}", Industry "${deal.industry || 'N/A'}", ` +
            `Deal Size $${deal.value ? (deal.value / 1_000_000).toFixed(1) + 'M' : 'undisclosed'}, ` +
            `Type "${deal.deal_type || 'commercial loan'}", ` +
            `Location "${deal.borrower_state || deal.borrower_city || 'N/A'}", Stage "${deal.stage || 'N/A'}".`;
        }
      }
    }

    // For lender matching with a dealId, also pull deal context
    if (mode === 'lender-matching' && dealId && !body.companyName) {
      const { data: deal } = await supabase
        .from('deals')
        .select('company, industry, value, deal_type, borrower_state, borrower_city')
        .eq('id', dealId)
        .single();

      if (deal) {
        const enriched = buildLenderMatchingQuery({
          ...body,
          companyName: body.companyName || deal.company,
          industry: body.industry || deal.industry || undefined,
          dealValue: body.dealValue || deal.value || undefined,
          dealType: body.dealType || deal.deal_type || undefined,
          location: body.location || deal.borrower_state || deal.borrower_city || undefined,
        });
        finalQuery = enriched.query;
        finalInstructions = enriched.instructions;
      }
    }

    // Select optimal preset per mode if not explicitly overridden
    const effectivePreset = preset || (mode === 'lender-matching' ? 'deep-research' : mode === 'task-execution' ? 'pro-search' : 'deep-research');

    const agentBody: Record<string, unknown> = {
      preset: effectivePreset,
      input: finalQuery,
      instructions: finalInstructions,
      tools: [
        { type: 'web_search' },
        { type: 'fetch_url' },
      ],
    };

    if (maxSteps) {
      agentBody.max_steps = Math.min(maxSteps, 10);
    }

    console.log(`Deep research: mode=${mode}, preset=${effectivePreset}, deal=${dealId || 'none'}`);

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

    // Extract content from Agent API response
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

    const usage = data.usage || null;

    // Cache result if tied to a deal
    if (dealId && content) {
      const cacheType = mode === 'lender-matching'
        ? 'deep_lender_matching'
        : mode === 'task-execution'
          ? 'deep_task_execution'
          : `deep_research_${effectivePreset}`;

      const { error: cacheError } = await supabase
        .from('deal_research_cache')
        .upsert({
          deal_id: dealId,
          research_type: cacheType,
          content: content.trim(),
          citations,
          generated_by: user.id,
          expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
          metadata: {
            preset: effectivePreset,
            mode,
            query: (body.query || body.taskTitle || '').substring(0, 200),
            model: data.model || effectivePreset,
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
      model: data.model || effectivePreset,
      mode,
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
