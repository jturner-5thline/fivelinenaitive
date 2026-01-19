const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MarketSizingRequest {
  industry: string;
  subSegment?: string;
  geography?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('PERPLEXITY_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Perplexity API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { industry, subSegment, geography }: MarketSizingRequest = await req.json();

    const prompt = `Provide a market sizing analysis for the ${industry} industry${subSegment ? `, specifically the ${subSegment} segment` : ''}${geography ? ` in ${geography}` : ' globally'}.

Include:
1. **Total Addressable Market (TAM)**
   - Current market size (with year and source)
   - Growth rate (CAGR)
   - Projected size in 3-5 years

2. **Market Segments**
   - Key segments and their relative sizes
   - Fastest growing segments
   - Segments with most lending activity

3. **Key Market Drivers**
   - What's driving growth?
   - Regulatory tailwinds/headwinds
   - Technology disruption factors

4. **Lending Market Dynamics**
   - How much debt capital flows into this sector?
   - Major lenders active in the space
   - Typical deal structures and terms

5. **Market Risks**
   - Cyclical factors
   - Concentration risks
   - Emerging threats

6. **Key Statistics**
   - Provide specific numbers with sources
   - Include recent data points (within last 12 months)

Format with clear headers and bullet points. Cite specific research reports or data sources.`;

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
            content: 'You are a market research analyst specializing in market sizing and industry analysis for lending and investment professionals. Provide specific, data-driven market intelligence with cited sources.' 
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
    const content = data.choices?.[0]?.message?.content || 'No market data available.';
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
    console.error('Error in market-sizing:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
