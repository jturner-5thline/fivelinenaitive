import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { callClaude } from "../_shared/claudeChat.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

interface EmailForAnalysis {
  cache_id: string;
  subject: string;
  snippet: string;
  body_text?: string;
  from_email: string;
  from_name: string;
}

interface AnalysisResult {
  cache_id: string;
  deal_match: { deal_id: string; deal_name: string } | null;
  category: string;
  sentiment: string;
  priority: string;
  summary: string;
  suggested_action: string | null;
  follow_up_needed: boolean;
  follow_up_by: string | null;
  extracted_data: Record<string, any>;
  signals: string[];
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth with user token
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(SUPABASE_URL, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { emails, settings } = await req.json() as {
      emails: EmailForAnalysis[];
      settings?: {
        auto_tagging?: boolean;
        sentiment_analysis?: boolean;
        signal_detection?: boolean;
        follow_up_reminders?: boolean;
        auto_extract?: boolean;
      };
    };

    if (!emails || emails.length === 0) {
      return new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user's deals for matching
    const { data: membership } = await serviceClient
      .from("company_members")
      .select("company_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    let dealContext = "No deals available for matching.";
    if (membership?.company_id) {
      const { data: deals } = await serviceClient
        .from("deals")
        .select("id, company, stage, status, value")
        .eq("company_id", membership.company_id)
        .in("status", ["active", "on_hold"])
        .limit(200);

      if (deals && deals.length > 0) {
        dealContext = "Available deals for matching:\n" + deals.map(d =>
          `- ID: ${d.id} | Company: ${d.company} | Stage: ${d.stage} | Status: ${d.status}`
        ).join("\n");
      }

      // Also get lender names for matching
      const { data: lenders } = await serviceClient
        .from("deal_lenders")
        .select("name, deal_id")
        .in("deal_id", (deals || []).map(d => d.id))
        .limit(500);

      if (lenders && lenders.length > 0) {
        const uniqueLenders = [...new Set(lenders.map(l => l.name))].slice(0, 100);
        dealContext += "\n\nKnown lender names: " + uniqueLenders.join(", ");
      }
    }

    // Build prompt
    const emailList = emails.map((e, i) => {
      const content = e.body_text?.slice(0, 1000) || e.snippet || "";
      return `Email ${i + 1} (cache_id: "${e.cache_id}"):
Subject: ${e.subject}
From: ${e.from_name} <${e.from_email}>
Content: ${content}`;
    }).join("\n\n---\n\n");

    const enabledFeatures: string[] = [];
    if (settings?.auto_tagging !== false) enabledFeatures.push("category classification");
    if (settings?.sentiment_analysis !== false) enabledFeatures.push("sentiment analysis");
    if (settings?.signal_detection !== false) enabledFeatures.push("signal detection");
    if (settings?.follow_up_reminders !== false) enabledFeatures.push("follow-up detection");
    if (settings?.auto_extract !== false) enabledFeatures.push("data extraction");

    const systemPrompt = `You are an email intelligence analyst for a deal management platform. Analyze each email and return structured JSON.

${dealContext}

For each email, provide:
1. deal_match: Match to a deal by company name, contact name, or lender name. Return {deal_id, deal_name} or null.
2. category: One of [deal_update, lender_communication, follow_up_needed, terms_discussion, due_diligence, scheduling, internal, newsletter, other]
3. sentiment: One of [positive, negative, neutral, urgent]
4. priority: One of [high, medium, low]
5. summary: One sentence summary of the key point
6. suggested_action: Brief recommended next step, or null
7. follow_up_needed: boolean
8. follow_up_by: ISO date string if follow_up_needed, otherwise null
9. extracted_data: Object with any extracted dollar amounts, dates, rates, company names, lender names
10. signals: Array of detected signals like ["term_sheet_received", "closing_language", "risk_indicator", "loi_mention", "covenant_breach"]

Enabled features: ${enabledFeatures.join(", ")}

Return ONLY a valid JSON array with one object per email. Each object must include the "cache_id" from the input.
Do not include markdown formatting or code blocks. Return raw JSON only.`;

    let responseText = "";
    try {
      const result = await callClaude({
        system: systemPrompt,
        messages: [{ role: "user", content: `Analyze these emails:\n\n${emailList}` }],
        temperature: 0.3,
        maxTokens: 8192,
      });
      responseText = result.text;
    } catch (e: any) {
      const status = e?.status ?? 500;
      console.error("Claude error:", status, e?.message);
      return new Response(JSON.stringify({
        error: status === 429 ? "Rate limited, retry later" : "AI analysis failed",
        partial: true,
        results: [],
      }), {
        status: status === 429 ? 429 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse JSON response - handle potential markdown wrapping
    let parsed: AnalysisResult[];
    try {
      const cleaned = responseText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      // Tolerate models that wrap the array in an object or add prose: pull first JSON array.
      const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
      parsed = JSON.parse(arrayMatch ? arrayMatch[0] : cleaned);
    } catch (parseErr) {
      console.error("Failed to parse AI response:", responseText.slice(0, 500));
      return new Response(JSON.stringify({
        error: "Failed to parse AI analysis",
        partial: true,
        results: [],
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Store results in email_analysis table
    const inserts = parsed.map((r: AnalysisResult) => ({
      email_cache_id: r.cache_id,
      user_id: user.id,
      deal_id: r.deal_match?.deal_id || null,
      deal_name: r.deal_match?.deal_name || null,
      category: r.category || "other",
      sentiment: r.sentiment || "neutral",
      priority: r.priority || "medium",
      summary: r.summary || null,
      suggested_action: r.suggested_action || null,
      follow_up_needed: r.follow_up_needed || false,
      follow_up_by: r.follow_up_by || null,
      extracted_data: r.extracted_data || {},
      signals: r.signals || [],
    }));

    // Upsert to handle re-analysis
    for (const insert of inserts) {
      const { error: insertErr } = await serviceClient
        .from("email_analysis")
        .upsert(insert, { onConflict: "email_cache_id" });

      if (insertErr) {
        console.error("Insert error for", insert.email_cache_id, insertErr);
      }
    }

    // If deal matching is found, add to activity logs
    for (const r of parsed) {
      if (r.deal_match?.deal_id) {
        await serviceClient.from("activity_logs").insert({
          deal_id: r.deal_match.deal_id,
          user_id: user.id,
          activity_type: "email_intelligence",
          description: `Email from ${emails.find(e => e.cache_id === r.cache_id)?.from_name || "unknown"}: ${r.summary || "analyzed"}`,
          metadata: {
            email_cache_id: r.cache_id,
            category: r.category,
            sentiment: r.sentiment,
            priority: r.priority,
          },
        }).then(() => {}).catch(err => console.error("Activity log error:", err));
      }
    }

    // Auto-draft a response for inbound funding-source questions.
    // Trigger draft-lender-question-response when an email is classified as
    // a lender/funding-source communication that contains questions and we
    // matched it to a deal. The draft lands in the Approval Queue for the
    // deal manager to review/edit/send — nothing is sent automatically.
    try {
      const questionSignals = new Set([
        "question_asked", "questions_asked", "info_request", "diligence_question",
      ]);
      const lenderCategories = new Set(["lender_communication", "due_diligence", "terms_discussion"]);

      // Pre-resolve which senders are known funding-source contacts on their
      // matched deals — sender-is-a-lender is a strong enough signal to
      // trigger a Q&A draft even if the classifier didn't tag it as such.
      const candidatePairs = parsed
        .map((r) => {
          const src = emails.find(e => e.cache_id === r.cache_id);
          return { r, src };
        })
        .filter(({ r, src }) => !!r.deal_match?.deal_id && !!src);
      const dealIds = [...new Set(candidatePairs.map(p => p.r.deal_match!.deal_id))];
      const fromEmailsLc = [...new Set(
        candidatePairs.map(p => (p.src!.from_email || "").toLowerCase()).filter(Boolean),
      )];
      const senderIsLenderKey = new Set<string>(); // `${dealId}::${email}`
      if (dealIds.length && fromEmailsLc.length) {
        // Match against per-deal lender contacts…
        // lender_contacts.lender_id -> master_lenders.id
        // deal_lenders.master_lender_id -> master_lenders.id
        // Bridge through master_lender_id so we can map a lender-contact email
        // to every deal that has that master lender attached.
        const { data: dlRows } = await serviceClient
          .from("deal_lenders")
          .select("deal_id, master_lender_id")
          .in("deal_id", dealIds)
          .not("master_lender_id", "is", null);
        const masterIds = [...new Set((dlRows || []).map((r: any) => r.master_lender_id))];
        let contactByMaster = new Map<string, string[]>();
        if (masterIds.length) {
          const { data: lenderContacts } = await serviceClient
            .from("lender_contacts")
            .select("email, lender_id")
            .in("lender_id", masterIds)
            .not("email", "is", null);
          for (const row of (lenderContacts || []) as any[]) {
            const em = String(row?.email || "").toLowerCase();
            if (!em) continue;
            const arr = contactByMaster.get(row.lender_id) || [];
            arr.push(em);
            contactByMaster.set(row.lender_id, arr);
          }
        }
        for (const row of (dlRows || []) as any[]) {
          const emails = contactByMaster.get(row.master_lender_id) || [];
          for (const em of emails) senderIsLenderKey.add(`${row.deal_id}::${em}`);
        }
        // …and per-deal deal_lenders.notes containing the sender's domain
        // (fallback when a specific contact row isn't captured).
        const { data: dealLendersRows } = await serviceClient
          .from("deal_lenders")
          .select("deal_id, notes")
          .in("deal_id", dealIds);
        const notesByDeal = new Map<string, string>();
        for (const row of (dealLendersRows || []) as any[]) {
          const cur = notesByDeal.get(row.deal_id) || "";
          notesByDeal.set(row.deal_id, `${cur}\n${row.notes || ""}`);
        }
        for (const p of candidatePairs) {
          const em = (p.src!.from_email || "").toLowerCase();
          const at = em.lastIndexOf("@");
          const dom = at === -1 ? "" : em.slice(at + 1);
          if (!dom) continue;
          const notes = (notesByDeal.get(p.r.deal_match!.deal_id) || "").toLowerCase();
          if (notes.includes(dom)) senderIsLenderKey.add(`${p.r.deal_match!.deal_id}::${em}`);
        }
      }

      const draftCandidates = parsed.filter((r) => {
        if (!r.deal_match?.deal_id) return false;
        const src = emails.find(e => e.cache_id === r.cache_id);
        if (!src) return false;
        const bodyHasQuestion = /\?/.test(src.body_text || src.snippet || "");
        if (!bodyHasQuestion) return false; // hard requirement — must contain a question
        const catMatch = lenderCategories.has((r.category || "").toLowerCase());
        const signalMatch = (r.signals || []).some(s => questionSignals.has(String(s).toLowerCase()));
        const senderMatch = senderIsLenderKey.has(
          `${r.deal_match.deal_id}::${(src.from_email || "").toLowerCase()}`,
        );
        return catMatch || signalMatch || senderMatch;
      });

      if (draftCandidates.length > 0) {
        // Skip any email that already has a queued/pending draft for it.
        const ids = draftCandidates.map(r => r.cache_id);
        const { data: existing } = await serviceClient
          .from("ai_action_queue")
          .select("id, source")
          .eq("action_type", "draft_email")
          .in("status", ["pending", "approved"])
          .filter("source->>email_cache_id", "in", `(${ids.map(i => `"${i}"`).join(",")})`);
        const already = new Set((existing || [])
          .map((row: any) => row?.source?.email_cache_id)
          .filter(Boolean));

        await Promise.all(draftCandidates
          .filter(r => !already.has(r.cache_id))
          .map(async (r) => {
            try {
              await fetch(`${SUPABASE_URL}/functions/v1/draft-lender-question-response`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": authHeader!,
                },
                body: JSON.stringify({
                  email_cache_id: r.cache_id,
                  deal_id: r.deal_match!.deal_id,
                }),
              });
            } catch (err) {
              console.error("[analyze-emails] draft-lender-question-response invoke failed", r.cache_id, err);
            }
          }));
      }
    } catch (autoErr) {
      console.error("[analyze-emails] auto-draft trigger failed", autoErr);
    }

    return new Response(JSON.stringify({ results: parsed }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("analyze-emails error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
