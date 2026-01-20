import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SearchRequest {
  query: string;
  userId: string;
  companyId?: string;
}

// Platform knowledge base for FAQs and how-to questions
const platformKnowledge = `
## Platform Overview
nAItive is a commercial lending deal management platform by 5th Line Capital. It helps teams manage deals, lenders, analytics, and reporting.

## Navigation & Pages
- **Dashboard**: Overview of your pipeline, flagged deals, notifications, and key metrics. Access via sidebar or /dashboard.
- **Deals**: List of all deals with filters by stage, status, deal type. Click any deal to view details.
- **Deal Detail**: View/edit deal info, manage lenders, track milestones, upload documents to data room, see activity history.
- **Lenders**: Master database of all lenders with contact info, deal preferences, and loan types.
- **Analytics**: Pipeline analytics, performance trends, stage progression charts.
- **Metrics**: Custom KPI dashboards with configurable widgets.
- **Insights**: AI-generated recommendations and risk alerts based on your data.
- **Reports**: Generate and export custom reports on deals, pipeline, performance.
- **Research**: AI-powered market research, lender matching, rate tracking, SEC filings.
- **Settings**: Manage deal stages, lender stages, milestones, notification preferences.
- **Company**: Manage your company profile, team members, and invitations.

## Common Tasks
- **Create a Deal**: Go to Deals page → Click "New Deal" → Fill in company name, value, deal type → Save
- **Add a Lender to a Deal**: Open deal → Go to Lenders tab → Click "Add Lender" → Search and select → Set stage
- **Upload Documents**: Open deal → Go to Data Room tab → Drag & drop files or click Upload
- **Track Milestones**: Open deal → View milestones panel → Check off completed items or add new ones
- **Invite Team Member**: Go to Company → Members → Click "Invite" → Enter email and role
- **Export Data**: Go to Reports → Select report type → Configure filters → Click Export

## Deal Stages (Default)
1. Initial Review - First look at opportunity
2. Due Diligence - Deep dive into company details
3. Term Sheet - Negotiating terms
4. Closing - Final documentation
5. Funded - Deal completed

## Lender Stages (Default)
1. Researching - Evaluating lender fit
2. Contacted - Initial outreach made
3. In Discussion - Active conversations
4. Term Sheet Received - Offer received
5. Selected - Chosen lender
6. Passed - Did not proceed

## Privacy Policy Summary
- We collect user account info (name, email), company data, and deal information
- Data is stored securely with encryption at rest and in transit
- We use data to provide the platform services and improve user experience
- We do not sell user data to third parties
- Users can request data export or deletion by contacting support
- Full policy available at /privacy

## Terms of Service Summary
- Users must be authorized by their company to access the platform
- Users are responsible for maintaining account security
- Content uploaded remains the property of the user's company
- Platform provided "as is" with standard liability limitations
- Full terms available at /terms

## Support & Help
- In-app help: Click Help in sidebar for feature guides and walkthroughs
- Feedback: Use the feedback widget (bottom right) to report issues or suggestions
- Contact: Email support@5thline.co for technical support
`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'AI not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authHeader = req.headers.get('Authorization');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { query, userId }: SearchRequest = await req.json();

    if (!query) {
      return new Response(
        JSON.stringify({ error: 'Query is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch user's accessible data for context
    let userContext = '';
    
    if (userId) {
      // Get user's company
      const { data: membership } = await supabase
        .from('company_members')
        .select('company_id, role, companies(name)')
        .eq('user_id', userId)
        .maybeSingle();

      const companyId = membership?.company_id;
      const companyName = (membership as any)?.companies?.name || 'Unknown Company';

      // Get recent deals (summary for context)
      const { data: deals } = await supabase
        .from('deals')
        .select('id, company, value, stage, status, deal_type, created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(20);

      // Get recent activities
      const { data: activities } = await supabase
        .from('activity_logs')
        .select('activity_type, description, created_at, deals(company)')
        .in('deal_id', deals?.map(d => d.id) || [])
        .order('created_at', { ascending: false })
        .limit(10);

      // Get deal lenders summary
      const { data: dealLenders } = await supabase
        .from('deal_lenders')
        .select('name, stage, deal_id')
        .in('deal_id', deals?.map(d => d.id) || [])
        .limit(50);

      // Get milestones summary
      const { data: milestones } = await supabase
        .from('milestones')
        .select('title, completed, due_date, deal_id')
        .in('deal_id', deals?.map(d => d.id) || [])
        .order('due_date', { ascending: true })
        .limit(20);

      // Build context
      userContext = `
## User Context
Company: ${companyName}
Role: ${membership?.role || 'member'}

## Current Deals (${deals?.length || 0} total)
${deals?.slice(0, 10).map(d => 
  `- ${d.company}: $${(d.value / 1000000).toFixed(1)}M | ${d.stage} | ${d.status} | ${d.deal_type || 'N/A'}`
).join('\n') || 'No deals found'}

## Recent Activity
${activities?.slice(0, 5).map(a => 
  `- ${a.activity_type}: ${a.description} (${(a as any).deals?.company || 'Unknown'})`
).join('\n') || 'No recent activity'}

## Active Lenders on Deals
${dealLenders?.slice(0, 10).map(l => 
  `- ${l.name}: ${l.stage}`
).join('\n') || 'No lenders tracked'}

## Upcoming Milestones
${milestones?.filter(m => !m.completed).slice(0, 5).map(m => 
  `- ${m.title}${m.due_date ? ` (due ${m.due_date})` : ''}`
).join('\n') || 'No pending milestones'}
`;
    }

    const systemPrompt = `You are an intelligent assistant for nAItive, a commercial lending deal management platform. Help users find information, understand how to use the platform, and navigate their data.

You have access to:
1. Platform knowledge (features, navigation, FAQs, policies)
2. The user's team data (deals, lenders, activities, milestones)

${platformKnowledge}

${userContext}

## Instructions
- Answer the user's question directly and helpfully
- If asking about platform features, explain clearly with steps
- If asking about their data, reference specific deals/lenders/activities when relevant
- If asking about policies, summarize the key points
- Provide navigation guidance (which page to visit)
- Be concise but complete

Respond with a JSON object:
{
  "type": "answer" | "navigation" | "data_query" | "help",
  "answer": "Direct answer to the user's question",
  "dataTypes": ["deals", "lenders", etc.] (if relevant data query),
  "filters": { "stage": null, "status": null, "dateRange": null, "keyword": null },
  "navigation": { "page": "/path", "description": "Where to go" } (if navigation needed),
  "suggestedActions": ["Next steps or related actions"],
  "sources": ["Where this info comes from: platform docs, user data, policies, etc."]
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
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please contact your administrator." }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
      // Fallback for non-JSON response
      parsed = {
        type: 'answer',
        answer: content,
        dataTypes: [],
        filters: {},
        navigation: null,
        suggestedActions: [],
        sources: ['AI response'],
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
