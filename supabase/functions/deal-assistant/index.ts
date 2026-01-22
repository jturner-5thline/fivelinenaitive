// deno-lint-ignore-file
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface DealContext {
  company: string;
  value: number;
  stage: string;
  status: string;
  manager?: string;
  lenders?: Array<{ name: string; stage: string; notes?: string }>;
  milestones?: Array<{ title: string; completed: boolean; dueDate?: string }>;
  activities?: Array<{ type: string; description: string; timestamp: string }>;
  notes?: string;
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

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { messages, dealContext }: { messages: Message[]; dealContext: DealContext } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: 'Messages array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build context string from deal data
    let contextString = `You are an AI assistant for deal management. You have access to the following deal information:\n\n`;
    
    if (dealContext) {
      contextString += `**Deal: ${dealContext.company}**\n`;
      contextString += `- Value: $${(dealContext.value / 1000000).toFixed(2)}M\n`;
      contextString += `- Stage: ${dealContext.stage}\n`;
      contextString += `- Status: ${dealContext.status}\n`;
      if (dealContext.manager) contextString += `- Manager: ${dealContext.manager}\n`;
      if (dealContext.notes) contextString += `- Notes: ${dealContext.notes}\n`;
      
      if (dealContext.lenders && dealContext.lenders.length > 0) {
        contextString += `\n**Lenders (${dealContext.lenders.length}):**\n`;
        dealContext.lenders.forEach(l => {
          contextString += `- ${l.name}: ${l.stage}${l.notes ? ` - ${l.notes}` : ''}\n`;
        });
      }
      
      if (dealContext.milestones && dealContext.milestones.length > 0) {
        contextString += `\n**Milestones:**\n`;
        dealContext.milestones.forEach(m => {
          const status = m.completed ? '✓' : '○';
          contextString += `- ${status} ${m.title}${m.dueDate ? ` (Due: ${m.dueDate})` : ''}\n`;
        });
      }
      
      if (dealContext.activities && dealContext.activities.length > 0) {
        contextString += `\n**Recent Activity:**\n`;
        dealContext.activities.slice(0, 10).forEach(a => {
          contextString += `- ${a.timestamp}: ${a.description}\n`;
        });
      }
    }

    contextString += `\n\nHelp the user with questions about this deal. Be concise and actionable. You can:\n`;
    contextString += `- Summarize deal status and progress\n`;
    contextString += `- Suggest next steps or actions\n`;
    contextString += `- Analyze lender engagement\n`;
    contextString += `- Identify potential risks or blockers\n`;
    contextString += `- Draft communications or updates\n`;

    const systemMessage: Message = {
      role: 'system',
      content: contextString,
    };

    console.log('AI Deal Assistant request:', { userId: user.id, messageCount: messages.length, hasContext: !!dealContext });

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [systemMessage, ...messages],
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: `AI API error: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || 'I was unable to generate a response.';

    return new Response(
      JSON.stringify({ content }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in deal-assistant function:', error);
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
