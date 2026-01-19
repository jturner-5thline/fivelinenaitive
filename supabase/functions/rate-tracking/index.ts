const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RateTrackingRequest {
  loanType?: string;
  dealSize?: string;
  creditQuality?: string;
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

    const { loanType, dealSize, creditQuality }: RateTrackingRequest = await req.json();

    const prompt = `Provide current lending rate intelligence for the commercial lending market.

${loanType ? `Focus on: ${loanType}` : 'Cover major loan types.'}
${dealSize ? `Deal size range: ${dealSize}` : ''}
${creditQuality ? `Credit quality: ${creditQuality}` : ''}

Include:
1. **Base Rate Environment**
   - Current SOFR rate
   - Prime rate
   - Federal Funds rate
   - Recent Fed commentary and rate outlook

2. **Credit Spreads by Loan Type**
   - Senior secured term loans
   - Revolving credit facilities
   - Asset-based loans
   - Revenue-based financing
   - Venture debt

3. **Spreads by Credit Quality**
   - Investment grade spreads
   - Sub-investment grade / leveraged loan spreads
   - Middle market spreads
   - Small business lending rates

4. **Market Trends**
   - Are spreads widening or tightening?
   - Lender appetite observations
   - Notable deals setting benchmarks
   - Regional variations if any

5. **Rate Forecast**
   - Market expectations for next 6-12 months
   - Key economic indicators to watch
   - Potential catalysts for rate changes

6. **Actionable Insights**
   - Is now a good time to lock in rates?
   - Structures that are getting done
   - Advice for borrowers in current environment

Provide specific current numbers with dates.`;

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
            content: 'You are a fixed income and credit markets analyst providing current rate intelligence for commercial lending professionals. Be specific with current rates, dates, and market observations.' 
          },
          { role: 'user', content: prompt }
        ],
        search_recency_filter: 'week',
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
    const content = data.choices?.[0]?.message?.content || 'No rate data available.';
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
    console.error('Error in rate-tracking:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
