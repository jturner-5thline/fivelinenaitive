import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LenderMatchingRequest {
  companyName: string;
  industry: string;
  dealValue: number;
  dealType: string;
  location?: string;
  revenueRange?: string;
  existingLenders?: string[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authentication check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('PERPLEXITY_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Perplexity API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { companyName, industry, dealValue, dealType, location, revenueRange, existingLenders }: LenderMatchingRequest = await req.json();

    const dealSizeLabel = dealValue >= 1000000 
      ? `$${(dealValue / 1000000).toFixed(1)}M` 
      : `$${(dealValue / 1000).toFixed(0)}K`;

    const prompt = `Find and recommend lenders for this financing opportunity:

**Company:** ${companyName}
**Industry:** ${industry || 'Not specified'}
**Deal Type:** ${dealType || 'Debt financing'}
**Deal Size:** ${dealSizeLabel}
${location ? `**Location:** ${location}` : ''}
${revenueRange ? `**Revenue Range:** ${revenueRange}` : ''}
${existingLenders?.length ? `**Already considering:** ${existingLenders.join(', ')} (exclude these from recommendations)` : ''}

Provide 5-8 specific lender recommendations with:
1. **Lender Name**: The actual name of the bank/fund/lender
2. **Why They Fit**: 1-2 sentences on why they'd be interested
3. **Typical Terms**: Deal size range, rough rate expectations if known
4. **Recent Activity**: Any recent deals in this space
5. **Contact Approach**: Best way to approach them

Focus on lenders actively doing deals in this space. Include a mix of:
- Banks (regional and national)
- Non-bank lenders (BDCs, specialty finance)
- Private credit funds
- Relevant specialty lenders

Be specific with actual lender names, not generic categories.`;

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [
          { 
            role: 'system', 
            content: 'You are an expert commercial lending advisor with deep knowledge of the lending market. Provide specific, actionable lender recommendations with real lender names and current market intelligence.' 
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 2000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Perplexity API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: `API error: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || 'No recommendations available.';
    const citations = data.citations || [];

    return new Response(
      JSON.stringify({ 
        content, 
        citations,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in lender-matching-ai:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
