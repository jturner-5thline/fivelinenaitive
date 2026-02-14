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

    const { events, action, current_date } = await req.json();

    let systemPrompt = "";
    let userPrompt = "";

    if (action === "daily_summary") {
      systemPrompt = `You are a concise executive calendar assistant. Analyze the user's calendar events and provide a brief, actionable daily summary. Format:
- Start with a one-line overview (e.g., "5 meetings today, 2 deal-related, 1.5h free for deep work")
- List key meetings with brief context
- Flag any gaps or focus time available
- Keep it under 150 words. Use bullet points.`;
      userPrompt = `Here are today's calendar events for ${current_date}:\n${JSON.stringify(events, null, 2)}`;
    } else if (action === "meeting_prep") {
      systemPrompt = `You are an executive meeting prep assistant for a deal/finance team. For each upcoming meeting, generate a brief prep card with:
- **Purpose**: What this meeting is likely about
- **Key people**: Who's attending and their likely role
- **Prep items**: 2-3 things to review or prepare
- **Talking points**: 2-3 suggested discussion topics
Be concise. Use markdown formatting. Max 100 words per meeting.`;
      userPrompt = `Prepare briefings for these upcoming meetings:\n${JSON.stringify(events, null, 2)}`;
    } else if (action === "smart_schedule") {
      systemPrompt = `You are a calendar optimization assistant. Analyze the user's schedule and suggest:
- **Focus blocks**: Best times for uninterrupted deep work
- **Meeting clusters**: Suggest grouping meetings together
- **Break recommendations**: Flag back-to-back meetings needing breaks
- **Optimal meeting times**: Best slots for new meetings
Keep suggestions actionable and brief. Use bullet points. Max 150 words.`;
      userPrompt = `Analyze this schedule for ${current_date} and suggest optimizations:\n${JSON.stringify(events, null, 2)}`;
    } else if (action === "conflict_check") {
      systemPrompt = `You are a calendar conflict detection assistant. Analyze events and identify:
- **Overlapping events**: Any double-bookings
- **Back-to-back issues**: Meetings with no buffer time
- **Travel conflicts**: Meetings at different locations without travel time
- **Energy concerns**: Too many high-stakes meetings in a row
Be specific about times and event names. Use ⚠️ for warnings and 🔴 for critical conflicts. Max 120 words.`;
      userPrompt = `Check for conflicts and issues in this schedule:\n${JSON.stringify(events, null, 2)}`;
    } else {
      throw new Error(`Unknown action: ${action}`);
    }

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
    const content = data.choices?.[0]?.message?.content || "No insights available.";

    return new Response(JSON.stringify({ result: content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("calendar-ai error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
