import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function htmlToText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|li|h[1-6])>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const TOOL = {
  type: "function",
  function: {
    name: "narrative_change_analysis",
    description:
      "Analyze how a pipeline narrative has changed period-over-period and produce executive commentary.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        editor_view: {
          type: "object",
          additionalProperties: false,
          properties: {
            new_themes: { type: "array", items: { type: "string" }, maxItems: 6 },
            repeated_themes: { type: "array", items: { type: "string" }, maxItems: 6 },
            improving: { type: "array", items: { type: "string" }, maxItems: 6 },
            worsening: { type: "array", items: { type: "string" }, maxItems: 6 },
            blockers_added: { type: "array", items: { type: "string" }, maxItems: 6 },
            blockers_removed: { type: "array", items: { type: "string" }, maxItems: 6 },
            tone: {
              type: "string",
              enum: ["more optimistic", "more cautious", "more urgent", "consistent"],
            },
            biggest_shift: { type: "string" },
          },
          required: [
            "new_themes",
            "repeated_themes",
            "improving",
            "worsening",
            "blockers_added",
            "blockers_removed",
            "tone",
            "biggest_shift",
          ],
        },
        viewer_view: {
          type: "object",
          additionalProperties: false,
          properties: {
            what_changed: { type: "string" },
            what_remains: { type: "string" },
            biggest_risk: { type: "string" },
            biggest_positive: { type: "string" },
            recommended_focus: { type: "array", items: { type: "string" }, maxItems: 5 },
          },
          required: [
            "what_changed",
            "what_remains",
            "biggest_risk",
            "biggest_positive",
            "recommended_focus",
          ],
        },
        chips: {
          type: "array",
          maxItems: 8,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              label: { type: "string" },
              kind: {
                type: "string",
                enum: ["new-risk", "improved", "repeated-theme", "escalating", "resolved"],
              },
            },
            required: ["label", "kind"],
          },
        },
      },
      required: ["editor_view", "viewer_view", "chips"],
    },
  },
} as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const {
      currentContent = "",
      currentLabel = "Current period",
      priorContent = "",
      priorLabel = "Prior period",
      mode = "viewer", // "viewer" | "editor"
    } = body as {
      currentContent?: string;
      currentLabel?: string;
      priorContent?: string;
      priorLabel?: string;
      mode?: "viewer" | "editor";
    };

    const currText = htmlToText(currentContent);
    const priorText = htmlToText(priorContent);

    if (!currText && !priorText) {
      return new Response(
        JSON.stringify({
          empty: true,
          message: "No narrative content to analyze yet.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const system = `You are an executive analyst summarizing how a sales-pipeline narrative has evolved between two reporting periods. Be concise, specific, and grounded ONLY in the narrative text provided. Do NOT invent metrics or facts. If the prior narrative is missing or empty, treat the current narrative as the baseline and call that out in your output.`;

    const userMsg = `Mode: ${mode}

--- ${priorLabel} (prior) ---
${priorText || "(no prior narrative)"}

--- ${currentLabel} (current${mode === "editor" ? ", may be a draft" : ""}) ---
${currText || "(empty)"}

Compare the two and call narrative_change_analysis with the structured fields. Keep each list item under ~10 words. Keep paragraph fields under ~2 sentences.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "narrative_change_analysis" } },
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Add credits in Lovable Cloud settings." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiResp.json();
    const call = data?.choices?.[0]?.message?.tool_calls?.[0];
    const argsStr = call?.function?.arguments;
    let parsed: any = null;
    try {
      parsed = argsStr ? JSON.parse(argsStr) : null;
    } catch (e) {
      console.error("Tool args parse error", e, argsStr);
    }
    if (!parsed) {
      return new Response(JSON.stringify({ error: "Empty AI response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        ...parsed,
        meta: { currentLabel, priorLabel, hasPrior: !!priorText },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("naitive-narrative-analysis error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});