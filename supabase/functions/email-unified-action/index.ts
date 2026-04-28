import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * email-unified-action
 * --------------------
 * Single entry point for the merged "Ask AI / Quick Task" experience in the
 * email AI Assist sidebar. Takes a free-form prompt + thread/deal context,
 * classifies the user's intent, and returns a structured suggestion the
 * client can render and confirm before it touches any record.
 *
 * Intents:
 *   - "ask"        → user wants an answer about the email/deal
 *   - "task"       → create a follow-up task
 *   - "note"       → add a note/update to the linked deal
 *   - "data_room"  → file/save something into the deal's data room
 *   - "draft"      → draft a follow-up email/response
 *
 * Returns: { intent, title, body, rationale }
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader || "" } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { prompt, threadData, dealId, dealName } = await req.json();
    const cleanPrompt = (prompt || "").toString().trim().slice(0, 2000);
    if (!cleanPrompt) {
      return new Response(JSON.stringify({ error: "prompt required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const threadStr = JSON.stringify(threadData || {}).slice(0, 8000);

    const systemPrompt = `You are an assistant inside an email-aware deal CRM.
Given a user's natural-language request and the email thread context, classify
their intent into ONE of:

  - "ask"        : user wants an answer/explanation about the email or deal
  - "task"       : user wants to create a follow-up task
  - "note"       : user wants to log a note/update on the deal
  - "data_room"  : user wants to save info/files to the deal's data room
  - "draft"      : user wants to draft a reply or follow-up email

Then produce a short title (max ~80 chars), a body (1-4 sentences for ask/note/draft,
or the suggested task title for task), and a 1-sentence rationale.

When intent is "note", ALSO inspect the thread + prompt for any specific
lender/firm being discussed. If you can identify one, populate the optional
"lender" field with:
  - name   : the lender / firm name as written in the thread
  - status : one of "in-review" | "terms-issued" | "in-diligence" | "closed-funded"
             (omit if the email gives no signal)
  - note   : a one-sentence summary of the lender's current position that
             should be saved on the lender record (different from the deal-level
             note body — this one is lender-specific)
If no specific lender is being discussed, omit "lender" entirely.

Respond ONLY by calling the route_action tool.`;

    const userPrompt = `User request: "${cleanPrompt}"

Linked deal: ${dealName ? dealName + " (id " + dealId + ")" : "none"}

Email thread (truncated):
${threadStr}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
        tools: [
          {
            type: "function",
            function: {
              name: "route_action",
              description: "Route the user's request to one structured action",
              parameters: {
                type: "object",
                properties: {
                  intent: {
                    type: "string",
                    enum: ["ask", "task", "note", "data_room", "draft"],
                  },
                  title: { type: "string" },
                  body: { type: "string" },
                  rationale: { type: "string" },
                  lender: {
                    type: "object",
                    description: "Optional. Only set when intent='note' and a specific lender is being discussed.",
                    properties: {
                      name:   { type: "string" },
                      status: {
                        type: "string",
                        enum: ["in-review", "terms-issued", "in-diligence", "closed-funded"],
                      },
                      note:   { type: "string" },
                    },
                    required: ["name"],
                    additionalProperties: false,
                  },
                },
                required: ["intent", "title", "body", "rationale"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "route_action" } },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit, try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    let parsed: any = null;
    try {
      parsed = JSON.parse(toolCall?.function?.arguments || "{}");
    } catch {
      parsed = null;
    }

    if (!parsed?.intent) {
      // Fallback: treat as ask
      parsed = {
        intent: "ask",
        title: cleanPrompt.slice(0, 80),
        body: aiJson?.choices?.[0]?.message?.content || "Couldn't classify request.",
        rationale: "Defaulted to Ask AI.",
      };
    }

    return new Response(JSON.stringify({ result: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("email-unified-action error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
