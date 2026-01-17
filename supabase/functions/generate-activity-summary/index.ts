// deno-lint-ignore-file
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ActivityData {
  activities: Array<{ type: string; description: string; timestamp: string }>;
  lenders: Array<{ name: string; stage: string; updatedAt?: string }>;
  milestones: Array<{ title: string; completed: boolean; dueDate?: string }>;
  dealInfo: {
    company: string;
    value: number;
    stage: string;
    status: string;
  };
  period: 'day' | 'week';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data: ActivityData = await req.json();
    const { activities, lenders, milestones, dealInfo, period } = data;

    // Build context for the AI
    let contextString = `Generate a ${period === 'day' ? 'daily' : 'weekly'} activity summary for this deal.\n\n`;
    
    contextString += `**Deal: ${dealInfo.company}**\n`;
    contextString += `- Value: $${(dealInfo.value / 1000000).toFixed(2)}M\n`;
    contextString += `- Stage: ${dealInfo.stage}\n`;
    contextString += `- Status: ${dealInfo.status}\n\n`;

    if (lenders && lenders.length > 0) {
      contextString += `**Lenders (${lenders.length}):**\n`;
      lenders.forEach(l => {
        contextString += `- ${l.name}: ${l.stage}\n`;
      });
      contextString += '\n';
    }

    if (milestones && milestones.length > 0) {
      const completed = milestones.filter(m => m.completed).length;
      contextString += `**Milestones:** ${completed}/${milestones.length} completed\n`;
      milestones.forEach(m => {
        const status = m.completed ? '✓' : '○';
        contextString += `- ${status} ${m.title}${m.dueDate ? ` (Due: ${m.dueDate})` : ''}\n`;
      });
      contextString += '\n';
    }

    if (activities && activities.length > 0) {
      contextString += `**Recent Activity (${activities.length} items):**\n`;
      activities.slice(0, 15).forEach(a => {
        contextString += `- ${a.timestamp}: ${a.description}\n`;
      });
    }

    const systemPrompt = `You are a deal management assistant that creates concise, actionable activity summaries.
    
Generate a summary with:
1. A 2-3 sentence overview of key developments
2. 3-5 bullet-point highlights of important activities
3. 2-3 actionable recommendations for next steps

Format your response as JSON with this structure:
{
  "summary": "Brief 2-3 sentence overview...",
  "highlights": ["Highlight 1", "Highlight 2", "Highlight 3"],
  "recommendations": ["Recommendation 1", "Recommendation 2"]
}

Be specific and actionable. Reference actual lender names, milestone names, and concrete numbers where relevant.`;

    console.log('Generating activity summary:', { 
      company: dealInfo.company, 
      period, 
      activityCount: activities?.length || 0,
      lenderCount: lenders?.length || 0
    });

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: contextString }
        ],
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'API credits exhausted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: `AI API error: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || '';

    // Parse the JSON response
    let parsedResult;
    try {
      // Extract JSON from the response (handle markdown code blocks)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResult = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch {
      // Fallback: return the raw content as summary
      parsedResult = {
        summary: content,
        highlights: [],
        recommendations: [],
      };
    }

    return new Response(
      JSON.stringify(parsedResult),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in generate-activity-summary function:', error);
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
