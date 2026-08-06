import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface StageOption { id: string; label: string }

/**
 * extract-lender-email-context
 * ----------------------------
 * Reads a lender email thread and returns (a) a short, factual note the user
 * can save onto the funding source ("why they passed", "waiting on X", etc.)
 * and (b) the pipeline stage the email implies, chosen from the workspace's
 * own stage list. Used by the AI Assist "Update Lender Stage" card so the
 * note field arrives pre-filled with real context from the lender's email.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("[extract-lender-email-context] missing bearer header");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    let userId = claimsData?.claims?.sub as string | undefined;
    if (!userId) {
      const { data: userData, error: userError } = await supabase.auth.getUser(token);
      userId = userData?.user?.id;
      if (!userId) {
        console.error("[extract-lender-email-context] auth failed", claimsError?.message, userError?.message);
      }
    }
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const subject: string = String(body?.subject || "").slice(0, 500);
    const lenderName: string = String(body?.lenderName || "").slice(0, 200);
    const dealName: string = String(body?.dealName || "").slice(0, 200);
    const currentStageLabel: string = String(body?.currentStageLabel || "").slice(0, 120);
    const stageOptions: StageOption[] = Array.isArray(body?.stageOptions)
      ? body.stageOptions.slice(0, 40).map((s: any) => ({ id: String(s?.id || ""), label: String(s?.label || "") }))
      : [];
    const messages: Array<{ from?: string; at?: string; text?: string }> = Array.isArray(body?.messages)
      ? body.messages.slice(-6)
      : [];

    const transcript = messages
      .map((m) => `From: ${String(m.from || "unknown").slice(0, 160)}${m.at ? ` (${String(m.at).slice(0, 40)})` : ""}\n${String(m.text || "").slice(0, 4000)}`)
      .join("\n\n---\n\n")
      .slice(0, 16000);

    if (!transcript.trim()) {
      return new Response(JSON.stringify({ note: "", stageId: null, reason: "no_email_text" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stageList = stageOptions.map((s) => `- ${s.id} :: ${s.label}`).join("\n");

    const system = `You summarize lender/funding-source email threads for a debt advisory CRM.
Return STRICT JSON only, no markdown fences:
{"note": string, "stageId": string|null, "confidence": "high"|"medium"|"low"}

"note" rules:
- 1-2 sentences, max ~280 characters, plain text, no greeting or sign-off.
- State only what the LENDER said: their decision, the reason behind it (e.g. "passed — outside credit box, needs 2 yrs positive EBITDA"), their current position, or what they are waiting on.
- Quote concrete specifics they gave (pricing, leverage, size, timing, missing items, names).
- Never invent facts. If the email carries no lender-side substance, return "" for note.
- Do not mention the email itself ("in this email…"), just the substance.

"stageId" rules:
- Choose the single best id from the allowed stages below based on what the lender said, or null if the email does not clearly imply a stage change.
- Only use ids from the list, exactly as written.`;

    const prompt = `Funding source: ${lenderName || "(unknown)"}
Deal: ${dealName || "(unknown)"}
Current stage: ${currentStageLabel || "(unknown)"}
Subject: ${subject}

Allowed stages:
${stageList || "(none provided)"}

Email thread (oldest to newest):
${transcript}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const details = await aiRes.text();
      console.error(`[extract-lender-email-context] gateway ${aiRes.status}: ${details.slice(0, 500)}`);
      return new Response(JSON.stringify({ error: "AI request failed", status: aiRes.status, details }), {
        status: aiRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiRes.json();
    const raw = data?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try {
      parsed = JSON.parse(String(raw).replace(/^```(?:json)?/i, "").replace(/```$/, "").trim());
    } catch {
      console.warn("[extract-lender-email-context] unparseable model output");
    }

    const note = typeof parsed?.note === "string" ? parsed.note.trim().slice(0, 400) : "";
    const stageId = stageOptions.some((s) => s.id === parsed?.stageId) ? String(parsed.stageId) : null;
    const confidence = ["high", "medium", "low"].includes(parsed?.confidence) ? parsed.confidence : "low";

    return new Response(JSON.stringify({ note, stageId, confidence }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[extract-lender-email-context] error", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
