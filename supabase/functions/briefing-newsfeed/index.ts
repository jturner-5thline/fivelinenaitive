import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TOPICS = [
  'venture debt',
  'interest rates and Fed policy',
  'venture capital fundraising',
  'AI and technology',
  'AI in finance and fintech',
  'agentic AI and autonomous agents',
];

const TOPIC_LABELS: Record<string, string> = {
  'venture debt': 'Venture Debt',
  'interest rates and fed policy': 'Interest Rates',
  'venture capital fundraising': 'Venture Capital',
  'ai and technology': 'AI & Technology',
  'ai in finance and fintech': 'AI in Finance',
  'agentic ai and autonomous agents': 'Agentic AI',
};

// Fetch OG image from a URL with a short timeout
async function fetchOgImage(url: string): Promise<string | null> {
  if (!url || url === '#') return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Naitive/1.0)' },
      redirect: 'follow',
    });
    clearTimeout(timeout);
    if (!resp.ok) return null;
    const html = await resp.text();
    // Extract og:image
    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (ogMatch?.[1]) return ogMatch[1];
    // Try twitter:image as fallback
    const twMatch = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
    return twMatch?.[1] || null;
  } catch {
    return null;
  }
}

serve(async (req) => {
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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY');
    if (!perplexityApiKey) {
      return new Response(JSON.stringify({ error: 'Perplexity API key not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Fetching briefing newsfeed for user:', user.id);

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
            content: `You are a financial news aggregator for an investment banking / private credit professional. Return exactly 18 recent news items (3 per topic) from the past 24 hours.

Topics: ${TOPICS.join(', ')}

For EACH news item return a JSON object with:
- headline: string (concise news headline)
- source: string (publication name like Bloomberg, WSJ, TechCrunch, PitchBook, etc.)
- published_at: string (ISO 8601 date/time, approximate if needed)
- summary: string (exactly 2 sentences summarizing the article)
- url: string (the actual article URL, use "#" only if truly unknown)
- image_url: string or null (if you know the article's thumbnail or hero image URL, include it; otherwise null)
- topic: string (one of: "venture debt", "interest rates and fed policy", "venture capital fundraising", "ai and technology", "ai in finance and fintech", "agentic ai and autonomous agents")

Return ONLY a JSON array of these objects, no other text. Order by most recent first.`,
          },
          {
            role: 'user',
            content: `Get me the latest news from the past 24 hours across these topics: ${TOPICS.join(', ')}. Return 3 items per topic, 18 total. Include image URLs when available.`,
          },
        ],
        max_tokens: 5000,
        temperature: 0.2,
        search_recency_filter: 'day',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Perplexity API error:', response.status, errorText);
      return new Response(JSON.stringify({ error: 'Failed to fetch news' }), {
        status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '[]';
    const citations = data.citations || [];

    let newsItems: any[] = [];
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        newsItems = parsed.map((item: any, index: number) => {
          const topicKey = (item.topic || '').toLowerCase();
          return {
            id: `bf-${Date.now()}-${index}`,
            headline: item.headline || 'Untitled',
            source: item.source || 'Unknown',
            published_at: item.published_at || new Date().toISOString(),
            summary: item.summary || '',
            url: citations[index] || item.url || '#',
            image_url: item.image_url || null,
            topic: TOPIC_LABELS[topicKey] || item.topic || 'General',
          };
        });
      }
    } catch (parseError) {
      console.error('Error parsing Perplexity response:', parseError);
    }

    // For items without images, try to fetch OG images from article URLs
    // Process in parallel, limit to first 8 for performance (featured + top grid items)
    const ogFetchPromises = newsItems.map(async (item, index) => {
      if (item.image_url) return; // Already has image
      if (index >= 8) return; // Only fetch OG for top items
      const ogImage = await fetchOgImage(item.url);
      if (ogImage) {
        item.image_url = ogImage;
      }
    });

    await Promise.allSettled(ogFetchPromises);

    console.log(`Returning ${newsItems.length} briefing news items, ${newsItems.filter((i: any) => i.image_url).length} with images`);

    return new Response(JSON.stringify({ items: newsItems }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('briefing-newsfeed error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
