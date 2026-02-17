import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { event } = await req.json();

    if (!event || !event.summary) {
      throw new Error("Event data with summary is required");
    }

    // Truncate input for safety
    const eventStr = JSON.stringify(event).slice(0, 5000);

    const systemPrompt = `You are an elite deal intelligence analyst for an investment banking / debt advisory team. When given a calendar event, you produce a comprehensive pre-meeting intelligence briefing. You must be specific, actionable, and authoritative.

Your briefing MUST include these sections using markdown:

## 🏢 Company Overview
- What the company does, industry, stage, key products/services
- Founded year, HQ location, employee count (estimate if needed)
- Recent news, funding rounds, or notable events
- Website and LinkedIn presence

## 👥 Key People on the Call
For each attendee:
- Name, title/role (infer from email domain + context)
- LinkedIn profile summary (role, background, notable experience)
- How they likely connect to the deal or relationship

## 🤝 Connection & Relationship Context
- How the user was likely introduced/connected to this party
- Referral chain if detectable (e.g., "Referred by Josh Rivera at Lango based on your previous SaaS deal work")
- Shared connections, past deal history, or mutual contacts
- Relationship strength assessment (new contact, warm intro, established relationship)

## 💬 Conversation Context & Racing Threads
- What stage this deal/relationship is likely at
- Key topics that are probably being discussed
- Competitive dynamics: other advisors, lenders, or parties that may be pursuing this deal
- Time-sensitive elements or deadlines
- Leverage points and potential objections

## 📋 Suggested Prep & Talking Points
- 3-5 specific talking points tailored to this meeting
- Questions to ask
- Documents or data to have ready
- Follow-up actions to plan

Be detailed but concise. Use bullet points. If you must speculate, label it as "Likely:" or "Estimated:". Total response under 800 words.`;

    const userPrompt = `Research and prepare an intelligence briefing for this calendar event:

${eventStr}

The user is a deal professional at a debt advisory firm (5th Line Capital). Provide context on the companies and people involved, how the connection was likely made, and any racing/competitive dynamics.`;

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
          { role: "user", content: userPrompt },
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in Settings." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI service error");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "No research available.";

    return new Response(JSON.stringify({ result: content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("calendar-event-research error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
