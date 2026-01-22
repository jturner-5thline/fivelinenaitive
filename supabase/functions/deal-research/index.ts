// deno-lint-ignore-file
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ResearchRequest {
  companyName: string;
  companyUrl?: string;
  industry?: string;
  dealValue?: number;
  researchType: 'company' | 'lender' | 'industry';
  lenderName?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
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
      console.error('PERPLEXITY_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Perplexity API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { companyName, companyUrl, industry, dealValue, researchType, lenderName }: ResearchRequest = await req.json();

    if (!companyName && researchType !== 'lender') {
      return new Response(
        JSON.stringify({ error: 'Company name is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let prompt = '';
    
    if (researchType === 'company') {
      prompt = `Research the company "${companyName}"${companyUrl ? ` (website: ${companyUrl})` : ''}${industry ? ` in the ${industry} industry` : ''}.

Provide a concise business intelligence summary including:
1. **Company Overview**: What does the company do? Key products/services.
2. **Recent News**: Any recent funding, acquisitions, partnerships, or major announcements (last 6 months).
3. **Financial Health Indicators**: Revenue estimates, funding history, profitability signals if available.
4. **Market Position**: Competitors, market share insights, industry trends affecting them.
5. **Key Risks**: Any red flags, legal issues, layoffs, or negative press.
6. **Lending Considerations**: Factors relevant for debt financing (cash flow patterns, asset base, growth trajectory).

Keep the response focused and actionable for a commercial lending context.${dealValue ? ` The potential deal size is approximately $${(dealValue / 1000000).toFixed(1)}M.` : ''}`;
    } else if (researchType === 'lender') {
      prompt = `Research the lender/financial institution "${lenderName}".

Provide intelligence useful for a borrower or advisor:
1. **Lender Profile**: Type of lender, typical deal sizes, industries they prefer.
2. **Recent Activity**: Any recent deals they've closed, funds raised, or market moves.
3. **Reputation**: Known for speed, flexibility, or specific expertise?
4. **Terms & Structure**: Typical rates, terms, or unique structures they offer.
5. **Decision Makers**: Key contacts or notable team members if available.
6. **Working with Them**: Tips or insights on their process.

Focus on actionable intelligence for someone seeking financing.`;
    } else if (researchType === 'industry') {
      prompt = `Provide a brief industry analysis for the "${industry}" sector relevant to commercial lending:

1. **Market Overview**: Current state, size, and growth trajectory.
2. **Key Trends**: Major trends affecting companies in this space.
3. **Lending Climate**: How are lenders viewing this sector? Any tightening or appetite?
4. **Notable Deals**: Recent notable financing deals in this sector.
5. **Risk Factors**: Industry-specific risks lenders should consider.
6. **Outlook**: 12-month outlook for the sector.

Keep it concise and relevant to lending decisions.`;
    }

    console.log(`Making Perplexity request for ${researchType} research:`, { userId: user.id, companyName, lenderName, industry });

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          { 
            role: 'system', 
            content: 'You are a financial research analyst providing concise, actionable intelligence for commercial lending professionals. Be specific, cite recent information when available, and focus on factors relevant to credit decisions.' 
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 1500,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Perplexity API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: `Perplexity API error: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || 'No research results available.';
    const citations = data.citations || [];

    console.log('Research completed successfully');

    return new Response(
      JSON.stringify({ 
        content, 
        citations,
        researchType,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in deal-research function:', error);
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
