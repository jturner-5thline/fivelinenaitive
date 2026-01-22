import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TermSheetBenchmarkRequest {
  dealType: string;
  dealSize: number;
  industry: string;
  proposedRate?: number;
  proposedTerm?: string;
  covenants?: string[];
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

    const { dealType, dealSize, industry, proposedRate, proposedTerm, covenants }: TermSheetBenchmarkRequest = await req.json();

    const dealSizeLabel = dealSize >= 1000000 
      ? `$${(dealSize / 1000000).toFixed(1)}M` 
      : `$${(dealSize / 1000).toFixed(0)}K`;

    const prompt = `Benchmark the following term sheet against current market standards:

**Deal Parameters:**
- Deal Type: ${dealType}
- Deal Size: ${dealSizeLabel}
- Industry: ${industry}
${proposedRate ? `- Proposed Rate: ${proposedRate}%` : ''}
${proposedTerm ? `- Proposed Term: ${proposedTerm}` : ''}
${covenants?.length ? `- Proposed Covenants: ${covenants.join(', ')}` : ''}

Provide:
1. **Rate Benchmarking**
   - Current market rates for similar deals
   - Spread over SOFR/Prime typical ranges
   - How does the proposed rate compare? (if provided)

2. **Structure Benchmarking**
   - Typical term lengths for this deal type
   - Amortization expectations
   - Prepayment terms commonly seen

3. **Covenant Comparison**
   - Standard covenants for this deal type
   - Leverage covenants (Debt/EBITDA ranges)
   - Fixed charge coverage expectations
   - Any industry-specific covenant considerations

4. **Fee Benchmarking**
   - Typical origination fees
   - Unused line fees
   - Early termination fees

5. **Recent Comparable Deals**
   - 2-3 recent deals in this space with terms if available
   - What's driving pricing up or down?

6. **Negotiation Points**
   - Areas where terms could be pushed
   - What's non-negotiable in current market
   - Red flags to watch for

Be specific with current market data and recent examples.`;

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
            content: 'You are a senior debt capital markets professional with extensive knowledge of current lending terms and market conditions. Provide specific, current benchmarking data for commercial lending terms.' 
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 2000,
        temperature: 0.2,
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
    const content = data.choices?.[0]?.message?.content || 'No benchmark data available.';
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
    console.error('Error in term-sheet-benchmark:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
