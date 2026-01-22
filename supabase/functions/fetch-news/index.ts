import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NewsItem {
  id: string;
  title: string;
  source: string;
  category: 'lenders' | 'clients';
  summary: string;
  url: string;
  publishedAt: string;
  imageUrl?: string;
  lenderName?: string;
}

// Placeholder images for each category using Unsplash
const categoryImages: Record<string, string[]> = {
  lenders: [
    'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=400&h=300&fit=crop',
    'https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=400&h=300&fit=crop',
    'https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&h=300&fit=crop',
  ],
  clients: [
    'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=400&h=300&fit=crop',
    'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&h=300&fit=crop',
    'https://images.unsplash.com/photo-1579532537598-459ecdaf39cc?w=400&h=300&fit=crop',
  ],
};

function getRandomImage(category: string): string {
  const images = categoryImages[category] || categoryImages.lenders;
  return images[Math.floor(Math.random() * images.length)];
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authentication check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', news: [] }),
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
        JSON.stringify({ error: 'Unauthorized', news: [] }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY');
    
    if (!perplexityApiKey) {
      console.error('PERPLEXITY_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Perplexity API key not configured', news: [] }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body for lender names
    let lenderNames: string[] = [];
    try {
      const body = await req.json();
      lenderNames = body.lenderNames || [];
    } catch {
      // No body or invalid JSON
    }

    console.log('Fetching news for lenders:', lenderNames.slice(0, 5).join(', '));

    // Build lender-specific search prompt
    const lenderSearchTerms = lenderNames.length > 0 
      ? lenderNames.slice(0, 10).join(', ')
      : 'private credit lenders, direct lenders, alternative lenders';

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
            content: `You are a financial news aggregator specializing in private credit and lending. Return exactly 8 recent news items from the past 30 days.
            
            For "lenders" category news, focus on these specific lenders/firms: ${lenderSearchTerms}
            Look for news about their fund closings, personnel moves, new deals, market positioning, or strategic announcements.
            
            For "clients" category news, focus on companies seeking financing, borrower news, and market demand for private credit.
            
            Format your response as a JSON array with objects containing:
            - title: string (news headline)
            - source: string (publication name like "Bloomberg", "Wall Street Journal", "Reuters", "PitchBook", etc.)
            - category: "lenders" or "clients"
            - summary: string (2-3 sentence summary)
            - url: string (use "#" as placeholder)
            - lenderName: string (optional - the specific lender name if this is about a specific lender from the list)
            
            Return 5 lender-focused articles and 3 client-focused articles.
            Return ONLY the JSON array, no other text.`
          },
          {
            role: 'user',
            content: `Get me the latest news from the past 30 days about these lenders: ${lenderSearchTerms}. Also include news about companies seeking private credit financing.`
          }
        ],
        max_tokens: 2000,
        temperature: 0.3,
        search_recency_filter: 'month',
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
        newsItems = parsed.map((item: any, index: number) => {
          const category = item.category === 'clients' ? 'clients' : 'lenders';
          return {
            id: `news-${Date.now()}-${index}`,
            title: item.title || 'Untitled',
            source: item.source || 'Unknown Source',
            category,
            summary: item.summary || '',
            url: citations[index] || item.url || '#',
            publishedAt: new Date(Date.now() - (index * 3600000)).toISOString(),
            imageUrl: getRandomImage(category),
            lenderName: item.lenderName || undefined,
          };
        });
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
