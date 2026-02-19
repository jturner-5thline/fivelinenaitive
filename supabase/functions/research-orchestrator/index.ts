import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OrchestratorRequest {
  dealId: string;
  researchTypes?: string[]; // which research to run; defaults to all
  forceRefresh?: boolean;   // ignore cache and re-run
}

const ALL_RESEARCH_TYPES = [
  'company',
  'industry',
  'lender_matching',
  'competitive_intel',
  'market_sizing',
  'rate_environment',
] as const;

function buildPrompt(type: string, deal: any): { system: string; user: string } {
  const base = {
    company: deal.company || 'Unknown',
    industry: deal.industry || 'General',
    value: deal.value ? `$${(deal.value / 1_000_000).toFixed(1)}M` : 'undisclosed',
    dealType: deal.deal_type || 'commercial loan',
    location: deal.borrower_state || deal.borrower_city || '',
  };

  switch (type) {
    case 'company':
      return {
        system: 'You are a financial research analyst providing concise, actionable intelligence for commercial lending professionals.',
        user: `Research "${base.company}" in the ${base.industry} industry. Provide: 1) Company Overview 2) Recent News (6 months) 3) Financial Health Indicators 4) Market Position 5) Key Risks 6) Lending Considerations for a ${base.value} ${base.dealType}. Be concise and specific.`,
      };
    case 'industry':
      return {
        system: 'You are a sector analyst covering commercial lending markets.',
        user: `Provide an industry analysis for "${base.industry}" relevant to a ${base.value} ${base.dealType}: 1) Market Overview & size 2) Key Trends 3) Lending Climate 4) Notable Recent Deals 5) Risk Factors 6) 12-month Outlook. Be concise.`,
      };
    case 'lender_matching':
      return {
        system: 'You are a senior debt placement advisor with deep knowledge of the lending market.',
        user: `Identify the best lender matches for: Company "${base.company}", Industry "${base.industry}", Deal Size ${base.value}, Type "${base.dealType}"${base.location ? `, Location: ${base.location}` : ''}. For each recommended lender provide: name, why they fit, typical terms, appetite level. Suggest 5-8 lenders.`,
      };
    case 'competitive_intel':
      return {
        system: 'You are a competitive intelligence analyst for the financial services sector.',
        user: `Provide competitive intelligence on "${base.company}" in ${base.industry}: 1) Main Competitors 2) Competitive Advantages/Disadvantages 3) Market Share Dynamics 4) Recent Competitive Moves 5) Implications for Credit Risk. Be specific with recent data.`,
      };
    case 'market_sizing':
      return {
        system: 'You are a market research analyst specializing in total addressable market analysis.',
        user: `Size the market for "${base.industry}"${base.location ? ` in ${base.location}` : ''}: 1) Total Addressable Market (TAM) 2) Serviceable Market 3) Growth Rate 4) Market Segmentation 5) Key Players & Share 6) Relevance to a ${base.value} lending opportunity. Use current data.`,
      };
    case 'rate_environment':
      return {
        system: 'You are a fixed income strategist tracking lending rates and credit spreads.',
        user: `Current rate environment for a ${base.value} ${base.dealType} in ${base.industry}: 1) Base Rate (SOFR/Prime) Trends 2) Typical Spreads for this deal profile 3) Recent Rate Movement 4) Covenant Trends 5) Fee Benchmarks 6) 3-month Outlook. Be specific with current numbers.`,
      };
    default:
      return {
        system: 'You are a financial research analyst.',
        user: `Research "${base.company}" for a ${base.value} ${base.dealType} deal.`,
      };
  }
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

    const { dealId, researchTypes, forceRefresh }: OrchestratorRequest = await req.json();

    if (!dealId) {
      return new Response(JSON.stringify({ error: 'dealId is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch deal details
    const { data: deal, error: dealError } = await supabase
      .from('deals')
      .select('*')
      .eq('id', dealId)
      .single();

    if (dealError || !deal) {
      return new Response(JSON.stringify({ error: 'Deal not found or access denied' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const typesToRun = researchTypes?.length ? researchTypes : [...ALL_RESEARCH_TYPES];

    // Check existing cache (skip if forceRefresh)
    let cachedTypes: string[] = [];
    if (!forceRefresh) {
      const { data: cached } = await supabase
        .from('deal_research_cache')
        .select('research_type')
        .eq('deal_id', dealId)
        .gt('expires_at', new Date().toISOString())
        .in('research_type', typesToRun);

      cachedTypes = (cached || []).map((c: any) => c.research_type);
    }

    const typesNeeded = typesToRun.filter(t => !cachedTypes.includes(t));

    console.log(`Research orchestrator: deal=${dealId}, requested=${typesToRun.length}, cached=${cachedTypes.length}, needed=${typesNeeded.length}`);

    // Run all needed research in parallel
    const results = await Promise.allSettled(
      typesNeeded.map(async (type) => {
        const { system, user: userPrompt } = buildPrompt(type, deal);

        const response = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: type === 'company' || type === 'competitive_intel' ? 'sonar-pro' : 'sonar',
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: userPrompt },
            ],
            max_tokens: type === 'company' ? 2000 : 1500,
            temperature: 0.2,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Perplexity API error ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || 'No results available.';
        const citations = data.citations || [];

        // Upsert into cache
        const { error: upsertError } = await supabase
          .from('deal_research_cache')
          .upsert({
            deal_id: dealId,
            research_type: type,
            content,
            citations,
            generated_by: user.id,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            metadata: {
              model: type === 'company' || type === 'competitive_intel' ? 'sonar-pro' : 'sonar',
              deal_company: deal.company,
              deal_industry: deal.industry,
            },
          }, { onConflict: 'deal_id,research_type' });

        if (upsertError) {
          console.error(`Failed to cache ${type}:`, upsertError);
        }

        return { type, content, citations, status: 'completed' as const };
      })
    );

    // Build response summary
    const completed: any[] = [];
    const failed: any[] = [];

    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        completed.push(result.value);
      } else {
        failed.push({ type: typesNeeded[i], error: result.reason?.message || 'Unknown error' });
      }
    });

    // Also return cached results
    const { data: allCached } = await supabase
      .from('deal_research_cache')
      .select('*')
      .eq('deal_id', dealId)
      .gt('expires_at', new Date().toISOString())
      .in('research_type', typesToRun)
      .order('research_type');

    return new Response(JSON.stringify({
      dealId,
      dealName: deal.company,
      totalRequested: typesToRun.length,
      newlyGenerated: completed.length,
      fromCache: cachedTypes.length,
      failed: failed.length,
      failedDetails: failed.length > 0 ? failed : undefined,
      research: allCached || [],
      timestamp: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in research-orchestrator:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
