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

     const { prompt, threadData, dealId, dealName, companyId } = await req.json();
    const cleanPrompt = (prompt || "").toString().trim().slice(0, 2000);
    if (!cleanPrompt) {
      return new Response(JSON.stringify({ error: "prompt required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build a compact transcript instead of stringifying the whole thread.
    // The classifier only needs the subject + last few message bodies.
    const td: any = threadData || {};
    const _emails: any[] = Array.isArray(td.emails) ? td.emails.slice(-3) : [];
    const _latest = td.latestEmail || _emails[_emails.length - 1] || {};
    const _transcript = _emails
      .map((e: any, i: number) => {
        const from = e?.from_name || e?.from_email || "Unknown";
        const when = e?.received_at || "";
        const txt = (e?.body_preview || e?.snippet || "")
          .toString()
          .slice(0, 700);
        return `[#${i + 1}] From: ${from} (${when})\n${txt}`;
      })
      .join("\n\n---\n\n");
    const threadStr =
      `Subject: ${td.subject || ""}\n` +
      `Latest from: ${_latest?.from_name || ""} <${_latest?.from_email || ""}>\n\n` +
      _transcript;

    const systemPrompt = `You are an assistant inside an email-aware deal CRM.
Given a user's natural-language request and the email thread context, classify
their intent into ONE of:

  - "ask"        : user wants an answer/explanation about the email or deal
  - "task"       : user wants to create a follow-up task
  - "note"       : user wants to log a note/update on the deal
  - "data_room"  : user wants to save info/files to the deal's data room
  - "draft"      : user wants to draft a reply or follow-up email
  - "allocate_hours" : user wants to allocate / log / update / apply / attribute
                  hours from the email body onto one or more deals. Trigger on
                  phrases like "allocate the hours", "log these hours",
                  "update each deal with the hours", "apply weekly hours",
                  "log time against deals", or any explicit mention of
                  attributing numeric hours to deals named in the email.

Then produce a short title (max ~80 chars), a body (1-4 sentences for ask/note/draft,
or the suggested task title for task), and a 1-sentence rationale.

When intent is "allocate_hours", populate the optional "hour_items" array.
Extract every (deal/company name → hours) pair you can find in the email body.

Rules for extraction:
  - Inspect ONLY the most recent / non-quoted portion of the thread when
    possible. Do NOT double-count lines that appear in quoted history.
  - Accept formats like:
        "Acme - 1.5"
        "Acme: 1.5 hours"
        "Acme   2"
        "Acme — 45 min"   (convert minutes to decimal hours)
        "Acme 0.25"
        ".25" attached to a label
  - Convert minutes to decimal hours (e.g. 45 min → 0.75).
  - Strip currency, bullets, parentheticals.
  - Each item must include the raw label exactly as it appeared, a normalized
    label (trimmed, single-spaced), the numeric hours (decimal), and a short
    sourceSnippet showing the line it came from.
  - Skip lines that are clearly totals, headers, or summary rows.
  - If hours are missing or non-numeric, skip the line silently.
If intent is not "allocate_hours", omit "hour_items" entirely.

When intent is "note", you MUST also inspect the thread + prompt for any
specific lender/firm being discussed. If you can identify one, populate the
optional "lender" field with:
  - name   : the lender / firm name as written in the thread
  - status : ALWAYS try to set this. Map signals to one of:
             "in-review"      — lender is reviewing materials, evaluating, in early diligence
             "terms-issued"   — a term sheet / proposal has been sent
             "in-diligence"   — formal due diligence is underway (DD, in-DD, "in diligence", credit committee, underwriting)
             "closed-funded"  — the loan has closed and funded
             Only omit "status" if the email truly gives no signal at all.
             Cue words: "evaluating / reviewing / under review" → in-review.
             "in diligence / in DD / due diligence / underwriting / credit committee" → in-diligence.
             "term sheet issued / proposal / draft terms" → terms-issued.
             "funded / closed" → closed-funded.
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
        // Faster lite model — intent routing + short task title is well
        // within its capability and cuts latency by ~2x vs. flash preview.
        model: "google/gemini-2.5-flash-lite",
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
                    enum: ["ask", "task", "note", "data_room", "draft", "allocate_hours"],
                  },
                  title: { type: "string" },
                  body: { type: "string" },
                  rationale: { type: "string" },
                  hour_items: {
                    type: "array",
                    description: "Only set when intent='allocate_hours'. One entry per (deal, hours) pair extracted from the email.",
                    items: {
                      type: "object",
                      properties: {
                        rawLabel: { type: "string" },
                        normalizedLabel: { type: "string" },
                        hours: { type: "number" },
                        sourceSnippet: { type: "string" },
                      },
                      required: ["rawLabel", "normalizedLabel", "hours"],
                      additionalProperties: false,
                    },
                  },
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

    // ── allocate_hours: server-side deal resolution ─────────────────────
    if (parsed.intent === "allocate_hours") {
      const items: Array<any> = Array.isArray(parsed.hour_items) ? parsed.hour_items : [];
      const normalize = (s: unknown) =>
        (typeof s === "string" ? s : s == null ? "" : String(s))
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, " ")
          .replace(/\s+/g, " ")
          .trim();

      // Pull the user's accessible deals (RLS-scoped via user-bound client).
      let dealsQuery = supabase
        .from("deals")
        .select("id, company, name, status, company_id")
        .neq("status", "archived");
      if (companyId) dealsQuery = dealsQuery.eq("company_id", companyId);
      const { data: dealRows, error: dealsErr } = await dealsQuery.limit(2000);
      if (dealsErr) console.warn("[allocate_hours] deal fetch failed", dealsErr.message);

      const deals = (dealRows || []).map((d: any) => ({
        id: d.id as string,
        label: (d.company || d.name || "") as string,
        norm: normalize(d.company || d.name || ""),
      })).filter((d: any) => d.norm);

      const tokenScore = (a: string, b: string): number => {
        if (!a || !b) return 0;
        if (a === b) return 1;
        const at = new Set(a.split(" "));
        const bt = new Set(b.split(" "));
        let inter = 0;
        at.forEach((t) => { if (bt.has(t)) inter += 1; });
        const union = new Set([...at, ...bt]).size;
        return union ? inter / union : 0;
      };

      const resolved = items.map((it: any) => {
        const rawLabel = String(it?.rawLabel ?? "").slice(0, 200);
        const normalizedLabel = String(it?.normalizedLabel ?? rawLabel).slice(0, 200);
        const hours = Number(it?.hours);
        const sourceSnippet = String(it?.sourceSnippet ?? "").slice(0, 240);
        const valid = isFinite(hours) && hours > 0 && hours <= 168;
        const target = normalize(normalizedLabel || rawLabel);

        let bestId: string | null = null;
        let bestName: string | null = null;
        let bestScore = 0;

        if (target && deals.length) {
          // exact normalized
          const exact = deals.find((d) => d.norm === target);
          if (exact) {
            bestId = exact.id; bestName = exact.label; bestScore = 1;
          } else {
            // prefix / contains, then jaccard tokens
            for (const d of deals) {
              let s = 0;
              if (d.norm.startsWith(target) || target.startsWith(d.norm)) s = 0.9;
              else if (d.norm.includes(target) || target.includes(d.norm)) s = 0.8;
              const tok = tokenScore(target, d.norm);
              s = Math.max(s, tok);
              if (s > bestScore) { bestScore = s; bestId = d.id; bestName = d.label; }
            }
          }
        }

        const status: "matched" | "ambiguous" | "unmatched" =
          !valid || !bestId ? "unmatched"
            : bestScore >= 0.85 ? "matched"
            : bestScore >= 0.5 ? "ambiguous"
            : "unmatched";

        return {
          rawLabel,
          normalizedLabel,
          hours: valid ? hours : 0,
          sourceSnippet,
          matchedDealId: status === "unmatched" ? undefined : bestId || undefined,
          matchedDealName: status === "unmatched" ? undefined : bestName || undefined,
          confidence: Math.round(bestScore * 100) / 100,
          status,
          writeTarget: "weekly_time_entries.hours",
          writeMode: "upsert-child-entry" as const,
        };
      });

      const totalHours = resolved.reduce((s, r) => s + (r.hours || 0), 0);
      const matchedCount = resolved.filter((r) => r.status === "matched").length;
      const ambiguousCount = resolved.filter((r) => r.status === "ambiguous").length;
      const unmatchedCount = resolved.filter((r) => r.status === "unmatched").length;

      parsed.hour_plan = {
        intent: "allocate_deal_hours_from_email",
        sourceThreadId: threadData?.threadId || null,
        sourceEmailId: threadData?.latestEmail?.id || null,
        summary: {
          totalItems: resolved.length,
          matchedItems: matchedCount,
          ambiguousItems: ambiguousCount,
          unmatchedItems: unmatchedCount,
          totalHours: Math.round(totalHours * 100) / 100,
        },
        items: resolved,
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
