const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SecFilingsRequest {
  companyName: string;
  ticker?: string;
  filingTypes?: string[];
  query?: string;
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

    const { companyName, ticker, filingTypes, query }: SecFilingsRequest = await req.json();

    const filingTypesStr = filingTypes?.length 
      ? filingTypes.join(', ') 
      : '10-K, 10-Q, 8-K';

    const prompt = `Search and analyze SEC filings for ${companyName}${ticker ? ` (${ticker})` : ''}.

${query ? `Specific question: ${query}` : 'Provide a comprehensive analysis of recent filings.'}

Focus on these filing types: ${filingTypesStr}

Analyze:
1. **Recent Filings Summary**
   - List the most recent relevant filings with dates
   - Key disclosures from each

2. **Financial Highlights**
   - Revenue and earnings trends
   - Balance sheet highlights
   - Cash flow observations

3. **Debt & Credit Information**
   - Existing debt facilities
   - Credit agreement terms disclosed
   - Maturity schedules
   - Covenant compliance mentioned

4. **Risk Factors**
   - Key risk factors disclosed
   - Any changes in risk factors recently
   - Litigation or contingencies

5. **Management Discussion**
   - Key points from MD&A
   - Forward-looking statements
   - Capital allocation plans

6. **Material Events (8-K)**
   - Recent material events
   - Management changes
   - Significant contracts or agreements

Provide specific quotes and references to filing dates where relevant.`;

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
            content: 'You are a securities analyst expert at reading and interpreting SEC filings. Focus on information relevant to credit analysis and lending decisions. Be specific with dates, figures, and direct references to filings.' 
          },
          { role: 'user', content: prompt }
        ],
        search_domain_filter: ['sec.gov', 'edgar-online.com'],
        max_tokens: 2500,
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
    const content = data.choices?.[0]?.message?.content || 'No SEC filings found.';
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
    console.error('Error in sec-filings-search:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
