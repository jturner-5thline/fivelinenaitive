import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NewsItem {
  id: string;
  title: string;
  source: string;
  category: 'market' | 'deals' | 'regulation' | 'company';
  summary: string;
  url: string;
  publishedAt: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY');
    
    if (!perplexityApiKey) {
      console.error('PERPLEXITY_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Perplexity API key not configured', news: [] }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching finance/lending news from Perplexity...');

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content: `You are a financial news aggregator. Return exactly 8 recent news items about lending, private credit, debt financing, and financial markets. 
            
            Format your response as a JSON array with objects containing:
            - title: string (news headline)
            - source: string (publication name like "Bloomberg", "Wall Street Journal", "Reuters", etc.)
            - category: one of "market", "deals", "regulation", "company"
            - summary: string (2-3 sentence summary)
            - url: string (use "#" as placeholder)
            
            Focus on:
            - Private credit market developments
            - Interest rate news from Fed/central banks
            - Major lending deals and fund closings
            - Regulatory changes affecting lending
            - Notable company financing news
            
            Return ONLY the JSON array, no other text.`
          },
          {
            role: 'user',
            content: 'Get me the latest news about lending, private credit, debt financing, and financial markets from the past week.'
          }
        ],
        max_tokens: 2000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Perplexity API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch news from Perplexity', news: [] }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('Perplexity response received');

    const content = data.choices?.[0]?.message?.content || '[]';
    const citations = data.citations || [];
    
    // Parse the JSON response
    let newsItems: NewsItem[] = [];
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        newsItems = parsed.map((item: any, index: number) => ({
          id: `news-${Date.now()}-${index}`,
          title: item.title || 'Untitled',
          source: item.source || 'Unknown Source',
          category: ['market', 'deals', 'regulation', 'company'].includes(item.category) 
            ? item.category 
            : 'market',
          summary: item.summary || '',
          url: citations[index] || item.url || '#',
          publishedAt: new Date(Date.now() - (index * 3600000)).toISOString(), // Stagger times
        }));
      }
    } catch (parseError) {
      console.error('Error parsing Perplexity response:', parseError);
      console.log('Raw content:', content);
    }

    console.log(`Returning ${newsItems.length} news items`);

    return new Response(
      JSON.stringify({ news: newsItems, citations }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in fetch-news function:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage, news: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});