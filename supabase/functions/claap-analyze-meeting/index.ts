import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

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

    const systemPrompt = `You are an expert meeting analyst for a commercial lending / deal management platform called 5th Line Financing. Analyze the meeting transcript and extract structured insights including deal-relevant data. Be concise and actionable.`;

    const userPrompt = `Analyze this meeting transcript titled "${meeting.title || "Untitled Meeting"}":

---
${truncatedTranscript}
---

Extract meeting insights AND any deal-relevant information (financing amounts, deal status, referral sources, contact roles) using the provided tool. For the deal_narrative field, summarize the business, business model, what they are looking for, and any key financial information discussed.`;

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
              description: "Extract structured insights and deal data from a meeting transcript",
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
                  // Deal-relevant extraction fields
                  suggested_deal_amount: {
                    type: "string",
                    description: "If a financing amount, deal size, or loan amount is mentioned, extract the numeric value as a string (e.g. '2000000'). Return empty string if not mentioned.",
                  },
                  suggested_deal_status: {
                    type: "string",
                    description: "A brief 1-sentence status note for the deal based on the meeting discussion (e.g. 'Initial discovery call, client exploring $2M ABL facility'). Return empty string if not applicable.",
                  },
                  referral_source_name: {
                    type: "string",
                    description: "If someone referred this client or a referral source is mentioned, extract their name. Return empty string if not mentioned.",
                  },
                  referral_source_email: {
                    type: "string",
                    description: "If a referral source email is mentioned, extract it. Return empty string if not mentioned.",
                  },
                  deal_narrative: {
                    type: "string",
                    description: "Based on the call transcript, summarize the business, business model, what they are looking for, and any key financial information. Write 2-4 paragraphs in a professional tone suitable for a deal memo. Return empty string if not enough context.",
                  },
                  participant_roles: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        role: { type: "string", description: "Their role/title if mentioned (e.g. 'CFO', 'CEO', 'VP Finance')" },
                        email: { type: "string" },
                      },
                    },
                    description: "Participant roles/titles extracted from the conversation context (max 10)",
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
      suggested_deal_amount?: string;
      suggested_deal_status?: string;
      referral_source_name?: string;
      referral_source_email?: string;
      deal_narrative?: string;
      participant_roles?: Array<{ name: string; role: string; email?: string }>;
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

    // Enrich any pending create_deal task for this meeting with extracted deal data
    const hasDealData =
      insights.suggested_deal_amount ||
      insights.suggested_deal_status ||
      insights.referral_source_name ||
      insights.referral_source_email ||
      insights.deal_narrative;

    if (hasDealData) {
      const { data: dealTasks } = await supabaseAdmin
        .from("claap_routing_tasks")
        .select("id, prefilled_data")
        .eq("meeting_id", meeting_id)
        .eq("task_type", "create_deal")
        .eq("status", "pending");

      if (dealTasks && dealTasks.length > 0) {
        for (const task of dealTasks) {
          const existingData = (task.prefilled_data || {}) as Record<string, unknown>;
          const enriched = {
            ...existingData,
            suggested_amount: insights.suggested_deal_amount || existingData.suggested_amount || "",
            suggested_status: insights.suggested_deal_status || existingData.suggested_status || "",
            deal_narrative: insights.deal_narrative || existingData.deal_narrative || "",
            referral_name: insights.referral_source_name || existingData.referral_name || "",
            referral_email: insights.referral_source_email || existingData.referral_email || "",
          };

          await supabaseAdmin
            .from("claap_routing_tasks")
            .update({ prefilled_data: enriched })
            .eq("id", task.id);
        }
        console.info(`Enriched ${dealTasks.length} create_deal task(s) with AI-extracted data`);
      }
    }

    // Enrich contact confirmation tasks with participant roles
    if (insights.participant_roles && insights.participant_roles.length > 0) {
      const { data: contactTasks } = await supabaseAdmin
        .from("claap_routing_tasks")
        .select("id, prefilled_data")
        .eq("meeting_id", meeting_id)
        .eq("task_type", "confirm_contact")
        .eq("status", "pending");

      if (contactTasks && contactTasks.length > 0) {
        for (const task of contactTasks) {
          const existingData = (task.prefilled_data || {}) as Record<string, unknown>;
          const participants = (existingData.participants || []) as Array<Record<string, unknown>>;

          // Enrich participants with roles from AI
          const enrichedParticipants = participants.map((p) => {
            const roleMatch = insights.participant_roles?.find(
              (r) =>
                r.email?.toLowerCase() === (p.email as string)?.toLowerCase() ||
                r.name?.toLowerCase() === (p.name as string)?.toLowerCase()
            );
            return roleMatch ? { ...p, role: roleMatch.role } : p;
          });

          await supabaseAdmin
            .from("claap_routing_tasks")
            .update({ prefilled_data: { ...existingData, participants: enrichedParticipants } })
            .eq("id", task.id);
        }
      }
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
