import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CompetitiveIntelRequest {
  companyName: string;
  industry: string;
  competitors?: string[];
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

    const { companyName, industry, competitors }: CompetitiveIntelRequest = await req.json();

    const prompt = `Provide competitive intelligence analysis for "${companyName}" in the ${industry || 'technology'} industry.

${competitors?.length ? `Known competitors: ${competitors.join(', ')}` : 'Identify their main competitors.'}

Analyze:
1. **Competitive Landscape**
   - Key competitors and their positioning
   - Market share estimates if available
   - Recent competitive moves (product launches, partnerships, M&A)

2. **Competitor Financing Activity**
   - Recent funding rounds or debt facilities by competitors
   - Who's financing the competition
   - Terms observed in the market

3. **Competitive Advantages/Disadvantages**
   - Where does ${companyName} have an edge?
   - Where are they behind?
   - Technology or product differentiation

4. **Market Positioning**
   - Price positioning vs competitors
   - Customer segment focus
   - Geographic presence

5. **Strategic Implications for Financing**
   - How does competitive position affect creditworthiness?
   - Any competitive threats to consider?
   - Growth opportunities relative to competitors

Be specific with names, dates, and figures where available.`;

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
            content: 'You are a competitive intelligence analyst focused on commercial lending and credit analysis. Provide specific, current intelligence on competitive dynamics.' 
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
    const content = data.choices?.[0]?.message?.content || 'No intelligence available.';
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
    console.error('Error in competitive-intel:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
