import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { meeting_id } = await req.json();
    if (!meeting_id) {
      return new Response(JSON.stringify({ error: "meeting_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch meeting with transcript
    const { data: meeting, error: meetingError } = await supabaseAdmin
      .from("claap_meetings")
      .select("id, title, transcript, transcript_missing")
      .eq("id", meeting_id)
      .single();

    if (meetingError || !meeting) {
      return new Response(JSON.stringify({ error: "Meeting not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!meeting.transcript || meeting.transcript_missing) {
      return new Response(JSON.stringify({ ok: true, note: "No transcript available for analysis" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Truncate transcript to avoid token limits (keep first ~15k chars)
    const truncatedTranscript = meeting.transcript.slice(0, 15000);

    const systemPrompt = `You are an expert meeting analyst for a commercial lending / deal management platform. Analyze the meeting transcript and extract structured insights. Be concise and actionable.`;

    const userPrompt = `Analyze this meeting transcript titled "${meeting.title || "Untitled Meeting"}":

---
${truncatedTranscript}
---

Extract the following using the provided tool.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_meeting_insights",
              description: "Extract structured insights from a meeting transcript",
              parameters: {
                type: "object",
                properties: {
                  ai_summary: {
                    type: "string",
                    description: "A 2-4 sentence executive summary of the meeting focusing on business outcomes and decisions",
                  },
                  key_decisions: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of key decisions made during the meeting (max 10)",
                  },
                  next_steps: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of actionable next steps or follow-ups (max 10)",
                  },
                  topics: {
                    type: "array",
                    items: { type: "string" },
                    description: "Main topics or themes discussed (max 8 keywords/phrases)",
                  },
                  sentiment: {
                    type: "string",
                    enum: ["positive", "neutral", "negative"],
                    description: "Overall meeting sentiment based on tone and outcomes",
                  },
                },
                required: ["ai_summary", "key_decisions", "next_steps", "topics", "sentiment"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_meeting_insights" } },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, will retry" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required for AI analysis" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const toolCall = aiResponse.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      console.error("No tool call in AI response:", JSON.stringify(aiResponse));
      return new Response(JSON.stringify({ error: "AI did not return structured data" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let insights: {
      ai_summary: string;
      key_decisions: string[];
      next_steps: string[];
      topics: string[];
      sentiment: string;
    };

    try {
      insights = JSON.parse(toolCall.function.arguments);
    } catch {
      console.error("Failed to parse AI tool call arguments:", toolCall.function.arguments);
      return new Response(JSON.stringify({ error: "Failed to parse AI response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update meeting with AI insights
    const { error: updateError } = await supabaseAdmin
      .from("claap_meetings")
      .update({
        ai_summary: insights.ai_summary,
        key_decisions: insights.key_decisions || [],
        next_steps: insights.next_steps || [],
        topics: insights.topics || [],
        sentiment: insights.sentiment || "neutral",
      })
      .eq("id", meeting_id);

    if (updateError) {
      console.error("Failed to update meeting with insights:", updateError);
      throw updateError;
    }

    return new Response(
      JSON.stringify({ ok: true, meeting_id, insights }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("Meeting analysis error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
