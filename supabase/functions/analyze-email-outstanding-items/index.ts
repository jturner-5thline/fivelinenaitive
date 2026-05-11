// analyze-email-outstanding-items
// -------------------------------
// Claude-backed analyzer that, given an inbound email + the deal's open
// outstanding items, returns three confirm-first suggestion sets:
//
//   1. attachment_matches      → filename ↔ outstanding-item semantic match
//   2. info_fulfillment_matches → email body satisfies a "Request X from Y"
//   3. new_item_suggestions    → email body mentions a NEW deliverable
//                                (e.g. "I'll need the Q1 financials by Friday")
//
// All output is suggestion-only — never auto-applied. The client surfaces
// each suggestion in the existing Suggested Updates card system; the user
// must one-click confirm before any DB write.
//
// Uses the project's centralized claude-ai proxy (no client-side keys).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface OpenItem {
  id: string;
  text: string;
}

interface AttachmentInput {
  id?: string;
  filename: string;
  size?: number;
}

interface RequestBody {
  dealId: string;
  dealName?: string;
  openItems: OpenItem[];
  attachments?: AttachmentInput[];
  /** Optional lender context — when provided, the extracted items are
   *  attributed back to this firm/contact so the UI can show "<Lender>
   *  requested N items" and source metadata flows into the audit log. */
  lenderName?: string;
  lenderId?: string;
  email: {
    threadId?: string;
    messageId?: string;
    subject?: string;
    fromName?: string;
    fromEmail?: string;
    receivedAt?: string;
    bodyPreview?: string;
  };
}

interface AttachmentMatch {
  item_id: string;
  filename: string;
  matched_on: string;       // short label e.g. "P&L Q1 2026"
  confidence: "low" | "medium" | "high";
  reasoning: string;
}

interface InfoFulfillmentMatch {
  item_id: string;
  requested_from: string;   // verbatim person/contact extracted from item text
  supporting_quote: string; // verbatim sentence from email body
  confidence: "low" | "medium" | "high";
}

interface NewItemSuggestion {
  description: string;      // concrete, action-led description for the new item
  due_date: string | null;  // ISO YYYY-MM-DD, or null when not stated
  source_quote: string;     // verbatim trigger sentence from the email
  priority: "low" | "normal" | "high" | "urgent";
  confidence: "low" | "medium" | "high";
  /** When the email is a lender request list (bulleted / numbered / "we'll
   *  need …"), every item from the same list shares this group_id so the
   *  client can render ONE grouped approval card ("Add N items") instead
   *  of N separate cards. Optional — null/empty for one-off suggestions. */
  group_id?: string | null;
  /** Short label for the group, e.g. "Capital Source Group requested 5
   *  items for Czerlonka". The UI uses this verbatim as the card header. */
  group_label?: string | null;
  /** Source attribution — echoed verbatim from the request body so the
   *  client can stamp it onto each created outstanding item. */
  requested_by_contact_name?: string | null;
  requested_by_contact_email?: string | null;
  requested_by_lender_name?: string | null;
  source_thread_id?: string | null;
  source_message_id?: string | null;
}

interface AnalysisResult {
  attachment_matches: AttachmentMatch[];
  info_fulfillment_matches: InfoFulfillmentMatch[];
  new_item_suggestions: NewItemSuggestion[];
}

const EMPTY_RESULT: AnalysisResult = {
  attachment_matches: [],
  info_fulfillment_matches: [],
  new_item_suggestions: [],
};

function safeJson(text: string): AnalysisResult | null {
  // Strip ```json fences if Claude wraps the response despite instructions.
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      attachment_matches: Array.isArray(parsed.attachment_matches) ? parsed.attachment_matches : [],
      info_fulfillment_matches: Array.isArray(parsed.info_fulfillment_matches) ? parsed.info_fulfillment_matches : [],
      new_item_suggestions: Array.isArray(parsed.new_item_suggestions) ? parsed.new_item_suggestions : [],
    };
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Auth ──────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Parse + validate body ─────────────────────────────
    let body: RequestBody;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!body?.dealId || !body?.email) {
      return new Response(
        JSON.stringify({ success: false, error: "dealId and email are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const openItems = (body.openItems || []).slice(0, 60); // hard cap for prompt size
    const attachments = (body.attachments || [])
      .filter((a) => a && typeof a.filename === "string" && a.filename.trim().length > 0)
      .slice(0, 30);

    // Nothing meaningful to analyze on either axis → return early.
    if (openItems.length === 0 && attachments.length === 0) {
      return new Response(
        JSON.stringify({ success: true, result: EMPTY_RESULT }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Build Claude prompt ───────────────────────────────
    const today = new Date().toISOString().slice(0, 10);

    const senderLabel = body.email.fromName || body.email.fromEmail || "the sender";
    const lenderLabel = body.lenderName || "";
    const dealLabelForGroup = body.dealName || "this deal";
    const defaultGroupLabel = lenderLabel
      ? `${lenderLabel} requested {N} items for ${dealLabelForGroup}`
      : `${senderLabel} requested {N} items for ${dealLabelForGroup}`;

    const systemPrompt = `You are a careful debt-advisory operations classifier. You read an inbound email tied to a specific deal and the deal's OPEN outstanding items, and return THREE confirm-first suggestion sets. NEVER mark anything done — every entry you return is suggestion-only and must be confirmed by a human.

Return STRICT JSON only — no markdown fences, no commentary:
{
  "attachment_matches": [
    {
      "item_id": "string — id from OPEN OUTSTANDING ITEMS that this attachment satisfies",
      "filename": "string — the matched attachment filename verbatim",
      "matched_on": "string — short label e.g. 'P&L Q1 2026' or 'Signed NDA'",
      "confidence": "low|medium|high",
      "reasoning": "string — one short sentence explaining why this filename matches this item"
    }
  ],
  "info_fulfillment_matches": [
    {
      "item_id": "string — id from OPEN OUTSTANDING ITEMS",
      "requested_from": "string — the contact name extracted from the item text (e.g. 'Jane' from 'Request P&L from Jane')",
      "supporting_quote": "string — verbatim sentence from the email body that fulfills the request",
      "confidence": "low|medium|high"
    }
  ],
  "new_item_suggestions": [
    {
      "description": "string — concrete, action-led item description (e.g. 'Q1 2026 financials from Acme')",
      "due_date": "string|null — ISO 'YYYY-MM-DD' if the email explicitly states a date, else null. Today is ${today}.",
      "source_quote": "string — verbatim trigger sentence from the email body",
      "priority": "low|normal|high|urgent",
      "confidence": "low|medium|high",
      "group_id": "string|null — when the email contains a SINGLE list of requested items (bulleted, numbered, or otherwise enumerated by the sender as one diligence ask), use the SAME group_id (e.g. 'lender_request_1') for every item from that list. null for one-off, unrelated suggestions.",
      "group_label": "string|null — short header for the group, formatted as '<Sender or Lender> requested <N> items for <Deal>'. Only set on the FIRST item of the group; null on subsequent items in the same group. Suggested template: '${defaultGroupLabel}'.",
      "requested_by_contact_name": "${(body.email.fromName || "").replace(/"/g, '\\"')}",
      "requested_by_contact_email": "${(body.email.fromEmail || "").replace(/"/g, '\\"')}",
      "requested_by_lender_name": "${(lenderLabel || "").replace(/"/g, '\\"')}",
      "source_thread_id": "${(body.email.threadId || "").replace(/"/g, '\\"')}",
      "source_message_id": "${(body.email.messageId || "").replace(/"/g, '\\"')}"
    }
  ]
}

RULES:
- ATTACHMENT MATCHES: Only include matches where the attachment filename clearly corresponds to the open item. Use semantic understanding: "PnL_Acme_Q1.pdf" matches "Q1 P&L"; "NDA-signed-final.docx" matches "Signed NDA"; "Acme-2026-financial-statements.xlsx" matches "Audited financials". Never invent matches. Each open item should appear AT MOST ONCE across attachment_matches.
- INFO FULFILLMENT: Only when the open item is explicitly phrased as a request from a NAMED person/contact (e.g. "Request bank statements from John", "Ask Jane for the cap table") AND the inbound email is from that same person AND the body materially provides the requested info (or attaches it). Skip when the email is just a generic acknowledgement.
- NEW ITEM SUGGESTIONS — TWO PATTERNS, BOTH IMPORTANT:
  (A) ONE-OFF DELIVERABLES: a single sentence in the email body asking for / committing to a deal-relevant deliverable with a date or deadline ("I'll send the Q1 financials by Friday", "please send updated AR aging by EOD Tuesday"). Surface each one as its own suggestion with group_id=null.
  (B) LENDER REQUEST LISTS — TOP PRIORITY: the inbound lender email contains a CLEAR LIST of diligence items the lender wants in order to underwrite the deal. Lists may appear as bullets ("•", "-", "*"), numbered ("1.", "2)", "(1)"), lettered ("a.", "b)"), or as line-separated short phrases under a lead-in like "to begin our review we'll need", "please provide the following", "we'll need the items below", "to move forward please send", "diligence items required", "in order to evaluate". Extract EVERY item in such a list as its own outstanding item — do not merge them, do not summarize them. Use the SAME group_id for every item from the same list, and put a group_label ONLY on the first item.
  GENERAL RULES for new items:
  - NEVER duplicate an existing open item — compare semantically before suggesting (e.g. don't add "P&L" if "Year-End P&L" is already open).
  - IGNORE signature blocks, legal disclaimers, confidentiality footers, "Sent from my iPhone", forwarded-message headers ("On … wrote:"), and quoted prior messages — only extract from the most recent inbound author's actual prose.
  - Description should be a clean, action-led noun phrase suitable for a checklist row. Strip leading bullet markers, numbering, and parenthetical asides like "(attached)" or "(if available)".
  - Cap at 12 entries total. If a list contains more than 12 items, return the first 12 in document order.
  - Return [] if no clear new deliverable.
  - When in doubt between a generic suggestion and extracting an explicit lender request list, ALWAYS prefer extracting the list — these are the highest-value suggestions for the user.
- DATE PARSING: Convert relative phrases ("Friday", "next Tuesday", "EOD Wednesday", "by end of week") to absolute ISO dates using today's date as the anchor (today = ${today}). For "by Friday", pick the upcoming Friday. If only a vague horizon is given ("soon", "shortly", "next week") without a specific day, set due_date to null.
- PRIORITY: Default to "normal". Use "high"/"urgent" only when the email explicitly signals urgency ("ASAP", "before tomorrow's call", "blocking the close").
- CONFIDENCE: "high" = unambiguous; "medium" = strong inference with one ambiguity; "low" = weak inference, requires human judgment.
- If nothing applies in a section, return an empty array for that section. Always return all three keys.`;

    const itemsBlock = openItems.length > 0
      ? openItems.map((i) => `- id=${i.id} text="${(i.text || "").slice(0, 240)}"`).join("\n")
      : "(no open outstanding items)";

    const attachmentsBlock = attachments.length > 0
      ? attachments.map((a) => `- "${a.filename}"${a.size ? ` (${a.size} bytes)` : ""}`).join("\n")
      : "(no attachments)";

    const userPrompt = `DEAL: ${body.dealName || "(unnamed)"} (id=${body.dealId})
${lenderLabel ? `LENDER (matched contact): ${lenderLabel}` : ""}
TODAY: ${today}

OPEN OUTSTANDING ITEMS:
${itemsBlock}

EMAIL ATTACHMENTS:
${attachmentsBlock}

EMAIL:
Subject: ${body.email.subject || ""}
From: ${body.email.fromName || ""} <${body.email.fromEmail || ""}>
Date: ${body.email.receivedAt || ""}
Body:
${(body.email.bodyPreview || "").slice(0, 6000)}

Analyze and return strict JSON per the schema.`;

    // ── Call the centralized claude-ai proxy ──────────────
    // Forward the user's bearer so claude-ai authenticates the same user
    // and applies the org's feature-gating policies.
    const { data: claudeData, error: claudeError } = await supabase.functions.invoke("claude-ai", {
      body: {
        messages: [{ role: "user", content: userPrompt }],
        system: systemPrompt,
        temperature: 0.1,
        max_tokens: 2048,
        context: "email_outstanding_items",
      },
    });

    if (claudeError || !claudeData?.success) {
      console.warn("[analyze-email-outstanding-items] claude error:", claudeError || claudeData?.error);
      // Fail soft — return empty result so the client falls back to the
      // deterministic fuzzy matcher without surfacing a hard error.
      return new Response(
        JSON.stringify({ success: true, result: EMPTY_RESULT, fallback: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const parsed = safeJson(String(claudeData.response || ""));
    if (!parsed) {
      console.warn("[analyze-email-outstanding-items] failed to parse Claude JSON");
      return new Response(
        JSON.stringify({ success: true, result: EMPTY_RESULT, fallback: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Post-process new_item_suggestions:
    //  - Always stamp source attribution (the model is unreliable about
    //    echoing it back even with explicit prompt instructions).
    //  - Resolve `{N}` placeholder in group_label to the actual group size.
    //  - Propagate group_label to every item in the group so the client
    //    can render the header from any item.
    try {
      const items = parsed.new_item_suggestions || [];
      const groupSizes = new Map<string, number>();
      const groupLabels = new Map<string, string>();
      for (const it of items) {
        if (it && it.group_id) {
          groupSizes.set(it.group_id, (groupSizes.get(it.group_id) || 0) + 1);
          if (it.group_label && !groupLabels.has(it.group_id)) {
            groupLabels.set(it.group_id, String(it.group_label));
          }
        }
      }
      for (const it of items) {
        if (!it || typeof it !== "object") continue;
        it.requested_by_contact_name = body.email.fromName || null;
        it.requested_by_contact_email = body.email.fromEmail || null;
        it.requested_by_lender_name = body.lenderName || null;
        it.source_thread_id = body.email.threadId || null;
        it.source_message_id = body.email.messageId || null;
        if (it.group_id) {
          const size = groupSizes.get(it.group_id) || 1;
          let label = groupLabels.get(it.group_id) || "";
          if (!label) {
            const who = body.lenderName || body.email.fromName || "Sender";
            label = `${who} requested ${size} items for ${dealLabelForGroup}`;
          } else {
            label = label.replace(/\{N\}/g, String(size));
          }
          it.group_label = label;
          it.group_size = size;
        } else {
          it.group_label = null;
        }
      }
      parsed.new_item_suggestions = items;
    } catch (postErr) {
      console.warn("[analyze-email-outstanding-items] post-process error:", postErr);
    }

    return new Response(
      JSON.stringify({ success: true, result: parsed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[analyze-email-outstanding-items] error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
