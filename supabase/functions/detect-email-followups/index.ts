import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

/**
 * detect-email-followups
 * ----------------------
 * Dedicated AI endpoint that analyzes an email thread (after the main
 * workflow analysis has completed on the client) and returns up to 5
 * structured follow-up task suggestions. The client gates this call so
 * it only runs once thread analysis is done — never during
 * "Analyzing thread…".
 *
 * Contract:
 *   POST { threadData, emailData?, dealId?, dealName?, currentUserName? }
 *   200  { suggestions: FollowupSuggestion[] }
 *   200  { suggestions: [], error?: string }   // soft errors stay 200 so
 *                                              // CORS preflight is never
 *                                              // blocked by a 5xx.
 *
 * FollowupSuggestion shape mirrors `WorkflowAnalysis.suggested_tasks[i]`
 * in src/hooks/useThreadWorkflowAnalysis.ts so the existing
 * SuggestedFollowupsCard renders it without any prop changes.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Confidence = "low" | "medium" | "high";
type TaskType =
  | "follow_up"
  | "call"
  | "email"
  | "review"
  | "send_doc"
  | "meeting"
  | "general";
type Priority = "low" | "normal" | "high" | "urgent";

interface FollowupSuggestion {
  title: string;
  why: string;
  description?: string;
  task_type: TaskType;
  due_date_hint: string; // ISO 'YYYY-MM-DD' or 'next_business_day'
  assignee_hint: string; // 'deal_manager' or verbatim name
  priority: Priority;
  confidence: Confidence;
}

function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      // Soft-fail: keep the sidebar usable even if AI is unconfigured.
      return ok({ suggestions: [], error: "LOVABLE_API_KEY missing" });
    }

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

    const body = await req.json().catch(() => ({} as any));
    const {
      threadData,
      emailData,
      dealId,
      dealName,
      currentUserName,
    } = body || {};

    if (!threadData || typeof threadData !== "object") {
      return ok({ suggestions: [], error: "threadData required" });
    }

    // Trim payload defensively — the gateway has tight per-request limits.
    const threadStr = JSON.stringify(threadData);
    if (threadStr.length > 60_000) {
      return ok({ suggestions: [], error: "thread too large" });
    }

    const subject = threadData.subject || emailData?.subject || "(no subject)";
    const emails: any[] = Array.isArray(threadData.emails)
      ? threadData.emails.slice(-6)
      : [];
    const latest = threadData.latestEmail || emailData || emails[emails.length - 1] || {};

    const transcript = emails
      .map((e: any, i: number) => {
        const from = e?.from_name || e?.from_email || "Unknown";
        const when = e?.received_at || "";
        const txt = (e?.body_text || e?.body_preview || "").toString().slice(0, 1500);
        return `[#${i + 1}] From: ${from} (${when})\n${txt}`;
      })
      .join("\n\n---\n\n");

    const systemPrompt = [
      "You are an M&A deal-ops assistant. Read an email thread and extract",
      "the concrete follow-up tasks the recipient must do next.",
      "Rules:",
      "- Return at most 5 suggestions, ordered by importance.",
      "- Each suggestion must reference a specific commitment or ask in the thread.",
      "- Never invent generic tasks like 'reply to email' or 'review thread'.",
      "- Use 'next_business_day' for due_date_hint unless the email names a date.",
      "- assignee_hint = 'deal_manager' when the user owns the work, otherwise",
      "  the verbatim name from the email signature.",
      "- If no clear follow-up exists, return an empty list.",
    ].join(" ");

    const userPrompt =
      `Subject: ${subject}\n` +
      (dealName ? `Linked deal: ${dealName}\n` : "") +
      (currentUserName ? `Current user: ${currentUserName}\n` : "") +
      `\nThread (most recent last):\n${transcript}\n\n` +
      `Latest sender: ${latest?.from_name || latest?.from_email || "Unknown"}`;

    const tool = {
      type: "function",
      function: {
        name: "emit_followups",
        description: "Return structured follow-up task suggestions.",
        parameters: {
          type: "object",
          properties: {
            suggestions: {
              type: "array",
              maxItems: 5,
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  why: { type: "string" },
                  description: { type: "string" },
                  task_type: {
                    type: "string",
                    enum: [
                      "follow_up",
                      "call",
                      "email",
                      "review",
                      "send_doc",
                      "meeting",
                      "general",
                    ],
                  },
                  due_date_hint: { type: "string" },
                  assignee_hint: { type: "string" },
                  priority: {
                    type: "string",
                    enum: ["low", "normal", "high", "urgent"],
                  },
                  confidence: {
                    type: "string",
                    enum: ["low", "medium", "high"],
                  },
                },
                required: [
                  "title",
                  "why",
                  "task_type",
                  "due_date_hint",
                  "assignee_hint",
                  "priority",
                  "confidence",
                ],
                additionalProperties: false,
              },
            },
          },
          required: ["suggestions"],
          additionalProperties: false,
        },
      },
    };

    const aiResp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
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
          tools: [tool],
          tool_choice: {
            type: "function",
            function: { name: "emit_followups" },
          },
        }),
      },
    );

    if (aiResp.status === 429) {
      return ok({ suggestions: [], error: "rate_limited" });
    }
    if (aiResp.status === 402) {
      return ok({ suggestions: [], error: "payment_required" });
    }
    if (!aiResp.ok) {
      const t = await aiResp.text().catch(() => "");
      console.error("detect-email-followups gateway error", aiResp.status, t);
      return ok({ suggestions: [], error: "ai_gateway_error" });
    }

    const json = await aiResp.json().catch(() => null) as any;
    const call = json?.choices?.[0]?.message?.tool_calls?.[0];
    const argsStr = call?.function?.arguments;
    let parsed: { suggestions?: FollowupSuggestion[] } = {};
    if (argsStr) {
      try { parsed = JSON.parse(argsStr); } catch { parsed = {}; }
    }
    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions.slice(0, 5)
      : [];

    return ok({ suggestions, dealId: dealId || null });
  } catch (e) {
    console.error("detect-email-followups error", e);
    // Stay 200 so client CORS path is never blocked by a 5xx.
    return ok({ suggestions: [], error: e instanceof Error ? e.message : "unknown" });
  }
});
