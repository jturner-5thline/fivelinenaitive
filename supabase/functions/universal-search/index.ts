const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SearchRequest {
  query: string;
  userId: string;
  companyId?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'AI not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { query, userId, companyId }: SearchRequest = await req.json();

    if (!query) {
      return new Response(
        JSON.stringify({ error: 'Query is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const systemPrompt = `You are an intelligent search assistant for a commercial lending deal management platform. Your job is to understand what the user is looking for and return structured search results.

The platform contains:
- **Deals**: Company financing deals with stages (Initial Review, Due Diligence, Term Sheet, etc.), values, lenders, milestones
- **Lenders**: Financial institutions with contact info, deal preferences, loan types
- **Activities**: Deal activity logs, notes, status changes
- **Analytics**: Pipeline metrics, performance data, trends
- **Insights**: AI-generated recommendations, risk alerts
- **Documents**: Attachments, writeups, data room files
- **Milestones**: Deal progress tracking items with due dates
- **Notifications**: Alerts, updates, reminders

When the user asks a question, determine:
1. What type(s) of data they're looking for
2. Any filters or criteria mentioned
3. The intent (find specific item, get summary, run analysis, take action)

Respond with a JSON object:
{
  "intent": "search" | "summary" | "action" | "analysis",
  "dataTypes": ["deals", "lenders", "activities", etc.],
  "filters": {
    "stage": "string or null",
    "status": "string or null",
    "dateRange": "string or null",
    "valueRange": "string or null",
    "keyword": "string or null"
  },
  "suggestedQuery": "A refined search query",
  "explanation": "Brief explanation of what you understood",
  "suggestedActions": ["List of actions the user might want to take"]
}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: query }
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded" }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI processing failed" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Parse the JSON response
    let parsed;
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
      parsed = JSON.parse(jsonStr.trim());
    } catch {
      parsed = {
        intent: 'search',
        dataTypes: ['deals'],
        filters: { keyword: query },
        suggestedQuery: query,
        explanation: content,
        suggestedActions: [],
      };
    }

    return new Response(
      JSON.stringify({ 
        ...parsed,
        originalQuery: query,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in universal-search:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
