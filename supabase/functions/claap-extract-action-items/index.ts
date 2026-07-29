import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Pulls a Claap meeting's transcript + summary and extracts a structured set of
 * action items (owner suggestion, due date inference, source quote, dedupe key).
 *
 * Results are written into a new `claap_action_items` row in `ai_action_queue`
 * targeted at the assignee user (usually the meeting organizer or fallback
 * admin). Items are NOT created as tasks — that only happens when the user
 * approves the queue card in the Approval Queue UI.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { meeting_id, assignee_user_id } = await req.json();
    if (!meeting_id || !assignee_user_id) {
      return new Response(
        JSON.stringify({ error: "meeting_id and assignee_user_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: meeting, error: meetingErr } = await supabaseAdmin
      .from("claap_meetings")
      .select("id, title, transcript, ai_summary, next_steps, claap_id, recorded_at, deal_id")
      .eq("id", meeting_id)
      .single();

    if (meetingErr || !meeting) {
      return new Response(JSON.stringify({ error: "Meeting not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Gate: all approval-queue activity is managed by the Deal Admin Agent.
    // If the agent is disabled for the relevant company, do not extract action
    // items (would otherwise insert a `claap_action_items` queue row).
    {
      let gateCompanyId: string | null = null;
      if (meeting.deal_id) {
        const { data: dealRow } = await supabaseAdmin
          .from("deals").select("company_id").eq("id", meeting.deal_id).maybeSingle();
        gateCompanyId = dealRow?.company_id || null;
      }
      if (!gateCompanyId) {
        const { data: mem } = await supabaseAdmin
          .from("company_members").select("company_id").eq("user_id", assignee_user_id).maybeSingle();
        gateCompanyId = (mem as any)?.company_id || null;
      }
      let agentEnabled = false;
      if (gateCompanyId) {
        const { data: agentRow } = await supabaseAdmin
          .from("admin_agent_settings").select("enabled").eq("company_id", gateCompanyId).maybeSingle();
        agentEnabled = agentRow?.enabled === true;
      }
      if (!agentEnabled) {
        console.log("[claap-extract-action-items] Deal Admin Agent disabled — skipping", { gateCompanyId });
        return new Response(
          JSON.stringify({ ok: true, note: "Deal Admin Agent disabled — skipped" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const transcript = (meeting.transcript || "").slice(0, 15000);
    const summary = meeting.ai_summary || "";
    const next_steps = Array.isArray(meeting.next_steps) ? meeting.next_steps : [];

    if (!transcript && !summary && next_steps.length === 0) {
      return new Response(JSON.stringify({ ok: true, note: "No content to analyze" }), {
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

    const today = new Date().toISOString().slice(0, 10);
    const systemPrompt = `You are an executive assistant for a commercial lending team. From a meeting transcript and summary you extract concrete, owner-attributable follow-up tasks. Always prefer the speaker's exact wording for source_quote. Today is ${today}.`;
    const userPrompt = `Meeting title: ${meeting.title || "Untitled"}

Summary:
${summary || "(no summary)"}

Existing next steps captured by upstream analysis:
${next_steps.length ? next_steps.map((s: string, i: number) => `${i + 1}. ${s}`).join("\n") : "(none)"}

Transcript (truncated):
---
${transcript || "(no transcript)"}
---

Extract the action items. Merge duplicates and overlapping tasks. For each item provide a short imperative title, a one-sentence description with context, the suggested owner name when stated or strongly implied (otherwise empty), a due ISO date if explicitly stated (otherwise null), a one-line direct source_quote, and a dedupe_key (kebab-case of the canonical task).`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
              name: "extract_action_items",
              description: "Return the deduped action items extracted from the meeting.",
              parameters: {
                type: "object",
                properties: {
                  action_items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        description: { type: "string" },
                        suggested_owner_name: { type: "string" },
                        due_at: { type: "string", description: "ISO 8601 date (YYYY-MM-DD) or empty string if no due date stated." },
                        source_quote: { type: "string" },
                        dedupe_key: { type: "string" },
                      },
                      required: ["title", "description", "suggested_owner_name", "due_at", "source_quote", "dedupe_key"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["action_items"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_action_items" } },
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error", status: aiResp.status }), {
        status: aiResp.status === 429 || aiResp.status === 402 ? aiResp.status : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ ok: true, note: "AI returned no tool call" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: { action_items: Array<{
      title: string; description: string; suggested_owner_name: string;
      due_at: string; source_quote: string; dedupe_key: string;
    }> } = { action_items: [] };
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("Failed to parse tool call args", e);
    }

    // Dedupe by dedupe_key (case insensitive)
    const seen = new Set<string>();
    const items = (parsed.action_items || []).filter((it) => {
      const k = (it.dedupe_key || it.title || "").toLowerCase().trim();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 25);

    if (items.length === 0) {
      return new Response(JSON.stringify({ ok: true, note: "No action items extracted" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Try to resolve suggested owner to a real user_id via profiles match
    const ownerNames = Array.from(new Set(items.map(i => i.suggested_owner_name).filter(Boolean)));
    const ownerMap = new Map<string, string>();
    if (ownerNames.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("user_id, first_name, last_name, email")
        .limit(2000);
      for (const name of ownerNames) {
        const n = name.toLowerCase();
        const match = (profiles || []).find((p: any) => {
          const full = `${p.first_name || ""} ${p.last_name || ""}`.toLowerCase().trim();
          return full && (full === n || full.startsWith(n) || n.startsWith(full));
        });
        if (match) ownerMap.set(name, match.user_id);
      }
    }

    const enrichedItems = items.map((it) => ({
      ...it,
      suggested_owner_user_id: ownerMap.get(it.suggested_owner_name) || null,
    }));

    // Get associated deal for the queue row
    let dealName: string | null = null;
    if (meeting.deal_id) {
      const { data: d } = await supabaseAdmin
        .from("deals").select("company").eq("id", meeting.deal_id).maybeSingle();
      dealName = d?.company || null;
    }

    // Insert the approval queue card
    const { error: insertErr } = await supabaseAdmin
      .from("ai_action_queue")
      .insert({
        user_id: assignee_user_id,
        deal_id: meeting.deal_id || null,
        deal_name: dealName,
        action_type: "claap_action_items",
        title: `${enrichedItems.length} action item${enrichedItems.length !== 1 ? "s" : ""} from "${meeting.title || "Claap recording"}"`,
        description: `Review and approve AI-extracted follow-ups from this meeting.`,
        payload: {
          claap_meeting_id: meeting.id,
          claap_id: meeting.claap_id,
          recording_title: meeting.title,
          recorded_at: meeting.recorded_at,
          action_items: enrichedItems,
        },
        source: { provider: "claap", origin: "claap-extract-action-items" },
      });

    if (insertErr) {
      console.error("Failed to insert action-items queue row", insertErr);
      throw insertErr;
    }

    return new Response(
      JSON.stringify({ ok: true, meeting_id, count: enrichedItems.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("claap-extract-action-items error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});