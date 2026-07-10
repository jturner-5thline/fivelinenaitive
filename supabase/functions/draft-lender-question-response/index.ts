// deno-lint-ignore-file no-explicit-any
/**
 * Draft an Approval-Queue-ready email response to an inbound funding-source
 * (lender / referral) email that asks questions about a deal.
 *
 * Flow:
 *  1. Load the inbound email from `email_cache` by id.
 *  2. Resolve the deal — either from the caller (`deal_id` in body) or by
 *     matching the sender domain / name to a `deal_lenders` row.
 *  3. Pull deal context: write-up narrative, recent deal-space notes,
 *     status notes, transcripts, and the specific lender's stage/notes.
 *  4. Ask Claude to produce a professional reply that answers each question
 *     using only the supplied context (no invented numbers or commitments).
 *  5. Insert an `ai_action_queue` row with action_type='draft_email' and
 *     target_object_type='deal_lender' so the Deal Admin Agent surfaces it
 *     in the Approval Queue for the deal manager to approve/edit/send.
 *
 * Body: { email_cache_id: string, deal_id?: string, dry_run?: boolean }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { callClaude } from "../_shared/claudeChat.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

function stripHtml(html: string): string {
  if (!html) return "";
  // Drop quoted reply blocks — Outlook / Gmail conventions.
  const cutMarkers = [
    /<div[^>]+class="?gmail_quote/i,
    /<blockquote/i,
    /-----Original Message-----/i,
    /From:\s*.+?\s*<[^>]+>\s*Sent:/i,
    /On .+ wrote:/i,
  ];
  let clipped = html;
  for (const m of cutMarkers) {
    const idx = clipped.search(m);
    if (idx > 200) {
      clipped = clipped.slice(0, idx);
      break;
    }
  }
  return clipped
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function firstName(full?: string | null): string {
  if (!full) return "";
  return String(full).split(/[,\s]+/)[0] || "";
}

function domainOf(email?: string | null): string {
  if (!email) return "";
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1).toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("Authorization");
  if (!auth) {
    return new Response(JSON.stringify({ ok: false, error: "missing auth" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ ok: false, error: "unauthenticated" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }
  const emailCacheId: string | undefined = body?.email_cache_id;
  const explicitDealId: string | undefined = body?.deal_id;
  const dryRun = Boolean(body?.dry_run);
  if (!emailCacheId) {
    return new Response(JSON.stringify({ ok: false, error: "email_cache_id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Load inbound email.
  const { data: email, error: emailErr } = await admin
    .from("email_cache")
    .select("id, user_id, thread_id, subject, from_email, from_name, to_emails, cc_emails, body_text, body_html, snippet, received_at")
    .eq("id", emailCacheId)
    .maybeSingle();
  if (emailErr || !email) {
    return new Response(JSON.stringify({ ok: false, error: `email not found: ${emailErr?.message}` }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const plainBody = (email.body_text && email.body_text.trim().length > 0)
    ? email.body_text
    : stripHtml(email.body_html || "");
  const emailForModel = plainBody.slice(0, 6000) || email.snippet || "";

  // 2. Resolve the deal.
  let dealId = explicitDealId || null;
  let dealLenderId: string | null = null;
  let dealLender: any = null;

  if (!dealId) {
    // Try thread → deal via deal_emails / email_threads.
    if (email.thread_id) {
      const { data: threadDeal } = await admin
        .from("email_threads")
        .select("deal_id")
        .eq("thread_id", email.thread_id)
        .not("deal_id", "is", null)
        .maybeSingle();
      if (threadDeal?.deal_id) dealId = threadDeal.deal_id;
    }
  }

  if (!dealId) {
    // Match by sender domain against deal_lenders on deals owned by the caller.
    const dom = domainOf(email.from_email);
    const fromName = (email.from_name || "").split(" ")[0] || "";
    const { data: candidates } = await admin
      .from("deal_lenders")
      .select("id, deal_id, name, notes")
      .or(dom ? `name.ilike.%${dom.split('.')[0]}%,notes.ilike.%${dom}%` : `name.ilike.%${fromName}%`);
    if (candidates && candidates.length > 0) {
      // Prefer a deal the caller owns.
      const dealIds = [...new Set(candidates.map((c: any) => c.deal_id))];
      const { data: ownedDeals } = await admin
        .from("deals")
        .select("id")
        .in("id", dealIds)
        .eq("user_id", userData.user.id);
      const ownedSet = new Set((ownedDeals || []).map((d: any) => d.id));
      const picked = candidates.find((c: any) => ownedSet.has(c.deal_id)) || candidates[0];
      dealId = picked.deal_id;
      dealLenderId = picked.id;
      dealLender = picked;
    }
  }

  if (!dealId) {
    return new Response(JSON.stringify({ ok: false, error: "could not resolve deal for this email" }), {
      status: 422,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Load lender row for this deal + sender if not already resolved.
  if (!dealLender) {
    const dom = domainOf(email.from_email);
    const domCore = dom.split(".")[0];
    const { data: lenders } = await admin
      .from("deal_lenders")
      .select("id, name, stage, substage, notes, tracking_status")
      .eq("deal_id", dealId);
    // Match a lender by comparing tokens of its name against the sender's
    // domain core. e.g. "LAGO Innovation Fund" vs "lagogcm.com" → "lago" is
    // a prefix of "lagogcm" and vice-versa. Also fall back to notes contents.
    const match = (lenders || []).find((l: any) => {
      const nameTokens = String(l.name || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      const notesLower = String(l.notes || "").toLowerCase();
      if (!domCore) return false;
      if (notesLower.includes(dom)) return true;
      return nameTokens.some((tok) => {
        if (!tok) return false;
        if (tok.length >= 4 && (domCore.startsWith(tok) || tok.startsWith(domCore))) return true;
        if (tok.length >= 5 && domCore.includes(tok)) return true;
        return false;
      });
    }) || null;
    if (match) {
      dealLender = match;
      dealLenderId = match.id;
    }
  }

  // 3. Gather deal context.
  const [dealRes, writeupRes, notesRes, statusNotesRes, transcriptsRes, financialsRes, milestonesRes] = await Promise.all([
    admin.from("deals")
      .select("id, company, stage, value, engagement_type, deal_type, narrative, notes, business_model, deal_owner, manager, user_id, closing_date")
      .eq("id", dealId).maybeSingle(),
    admin.from("deal_writeups")
      .select("company_name, description, narrative_summary, use_of_funds, existing_debt_details, industry, capital_ask, this_year_revenue, last_year_revenue, profitability, gross_margins, financial_years, key_items, company_highlights, existing_debt_items")
      .eq("deal_id", dealId).maybeSingle(),
    admin.from("deal_space_notes")
      .select("title, content, created_at")
      .eq("deal_id", dealId).order("created_at", { ascending: false }).limit(8),
    admin.from("deal_status_notes")
      .select("note, created_at").eq("deal_id", dealId)
      .order("created_at", { ascending: false }).limit(10),
    admin.from("deal_call_transcripts")
      .select("title, summary, transcript, created_at")
      .eq("deal_id", dealId).order("created_at", { ascending: false }).limit(3),
    admin.from("deal_space_financials")
      .select("period_label, revenue, gross_profit, ebitda, net_income").eq("deal_id", dealId)
      .order("period_label", { ascending: true }).limit(24),
    admin.from("deal_milestones")
      .select("title, is_completed, completed_at").eq("deal_id", dealId)
      .order("created_at", { ascending: false }).limit(15),
  ]);

  const deal = dealRes.data;
  const writeup = writeupRes.data;
  if (!deal) {
    return new Response(JSON.stringify({ ok: false, error: "deal load failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Resolve sender / signature.
  const { data: profile } = await admin.from("profiles")
    .select("display_name, first_name, last_name, email").eq("user_id", deal.user_id).maybeSingle();
  const senderName = (profile?.display_name?.trim()
    || `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim()
    || deal.deal_owner
    || "");

  // 4. Build context block for the model.
  const notesText = (notesRes.data || []).map((n: any) =>
    `• ${n.title || "Note"} (${(n.created_at || "").slice(0, 10)}): ${stripHtml(n.content || "").slice(0, 800)}`
  ).join("\n");
  const statusText = (statusNotesRes.data || []).map((s: any) =>
    `• ${(s.created_at || "").slice(0, 10)}: ${String(s.note || "").slice(0, 400)}`
  ).join("\n");
  const transcriptText = (transcriptsRes.data || []).map((t: any) =>
    `• ${t.title || "Call"} (${(t.created_at || "").slice(0, 10)}): ${String(t.summary || t.transcript || "").slice(0, 1500)}`
  ).join("\n");
  const financialsText = (financialsRes.data || []).map((f: any) =>
    `${f.period_label}: rev=${f.revenue ?? "?"}, gp=${f.gross_profit ?? "?"}, ebitda=${f.ebitda ?? "?"}`
  ).join(" | ");
  const milestonesText = (milestonesRes.data || []).map((m: any) =>
    `${m.is_completed ? "✓" : "◻"} ${m.title}`
  ).join("\n");

  const writeupBlock = writeup ? [
    `Company: ${writeup.company_name}`,
    writeup.industry && `Industry: ${writeup.industry}`,
    writeup.description && `Description: ${writeup.description}`,
    writeup.narrative_summary && `Narrative: ${writeup.narrative_summary}`,
    writeup.capital_ask && `Capital Ask: ${writeup.capital_ask}`,
    writeup.use_of_funds && `Use of Funds: ${writeup.use_of_funds}`,
    writeup.existing_debt_details && `Existing Debt: ${writeup.existing_debt_details}`,
    writeup.this_year_revenue && `This Year Rev: ${writeup.this_year_revenue}`,
    writeup.last_year_revenue && `Last Year Rev: ${writeup.last_year_revenue}`,
    writeup.profitability && `Profitability: ${writeup.profitability}`,
    writeup.gross_margins && `Gross Margins: ${writeup.gross_margins}`,
  ].filter(Boolean).join("\n") : "(no write-up on file)";

  const contextBlock = [
    "=== DEAL WRITE-UP ===",
    writeupBlock,
    deal.narrative ? `\nDeal Narrative: ${deal.narrative}` : "",
    deal.notes ? `\nDeal Notes: ${deal.notes}` : "",
    "\n=== RECENT DEAL-SPACE NOTES ===",
    notesText || "(none)",
    "\n=== STATUS NOTES ===",
    statusText || "(none)",
    "\n=== CALL TRANSCRIPTS (summaries) ===",
    transcriptText || "(none)",
    "\n=== FINANCIAL SNAPSHOTS ===",
    financialsText || "(none)",
    "\n=== MILESTONES ===",
    milestonesText || "(none)",
    "\n=== FUNDING-SOURCE RECORD ===",
    dealLender
      ? `Lender: ${dealLender.name} | Stage: ${dealLender.stage || "?"} / ${dealLender.substage || ""} | Notes: ${(dealLender.notes || "").slice(0, 600)}`
      : "(sender not linked to a specific deal_lenders row)",
  ].join("\n");

  // 5. Ask Claude to draft the reply.
  const recipientFirstName = firstName(email.from_name) || firstName(email.from_email?.split("@")[0]);
  const system = [
    "You are 5th Line's writing engine helping the deal manager respond to a funding source's questions about an active deal.",
    "The funding source (a lender / referral) has emailed with questions. Draft a professional reply that answers each question **using ONLY the supplied deal context**.",
    "Hard rules:",
    "- If a question cannot be answered from the context, say so directly (e.g. 'Let me confirm and follow up' or 'We'll send that separately'). NEVER invent numbers, dates, terms, commitments, or facts.",
    "- Address each distinct question the sender asked, in the order asked. Use short paragraphs or a numbered list mirroring their questions.",
    "- Tone: professional, concise, neutral-warm. No marketing language, no filler.",
    "- Plain prose (not markdown). No headings.",
    `- Greet: "Hi ${recipientFirstName || "there"},".`,
    senderName
      ? `- Sign off as "${senderName}" on its own line.`
      : "- Do not include a sign-off name; the app will append the user's configured signature.",
    "- Reply subject: prefix with 'Re:' if the incoming subject does not already start with 'Re:'.",
    "Return STRICT JSON: {\"subject\": string, \"body\": string, \"answered_questions\": string[], \"unanswered_questions\": string[]}. No prose outside the JSON.",
  ].join("\n");

  const userMsg = [
    `Deal: ${deal.company} (stage: ${deal.stage})`,
    `Incoming email from ${email.from_name || ""} <${email.from_email}> on ${email.received_at}`,
    `Subject: ${email.subject}`,
    `\n--- INCOMING EMAIL BODY ---\n${emailForModel}\n--- END EMAIL ---`,
    `\n--- DEAL CONTEXT ---\n${contextBlock}\n--- END CONTEXT ---`,
    "Draft the reply now.",
  ].join("\n");

  let raw = "";
  try {
    const result = await callClaude({
      system,
      messages: [{ role: "user", content: userMsg }],
      temperature: 0.3,
      maxTokens: 2048,
    });
    raw = result.text || "";
  } catch (e: any) {
    console.error("[draft-lender-question-response] Claude error", e?.status, e?.message);
    return new Response(JSON.stringify({ ok: false, error: `Claude error: ${e?.message || "unknown"}` }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let subject = email.subject?.startsWith("Re:") ? email.subject : `Re: ${email.subject || deal.company}`;
  let draftBody = "";
  let answered: string[] = [];
  let unanswered: string[] = [];
  try {
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(cleaned);
    if (parsed?.subject) subject = String(parsed.subject).trim();
    if (parsed?.body) draftBody = String(parsed.body).trim();
    if (Array.isArray(parsed?.answered_questions)) answered = parsed.answered_questions.map(String);
    if (Array.isArray(parsed?.unanswered_questions)) unanswered = parsed.unanswered_questions.map(String);
  } catch {
    draftBody = raw.trim();
  }

  if (!draftBody) {
    return new Response(JSON.stringify({ ok: false, error: "empty draft" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const evidence = [
    {
      id: email.id,
      kind: "email",
      excerpt: `Inbound from ${email.from_name || email.from_email} on ${(email.received_at || "").slice(0, 10)}: ${(email.snippet || plainBody).slice(0, 300)}`,
    },
    dealLenderId ? {
      id: dealLenderId,
      kind: "funding_source",
      excerpt: `${dealLender?.name} (${dealLender?.stage || "?"}${dealLender?.substage ? " / " + dealLender.substage : ""})`,
    } : null,
    writeup ? {
      id: dealId,
      kind: "writeup",
      excerpt: `Write-up narrative used for context (${writeup.company_name}).`,
    } : null,
  ].filter(Boolean);

  const title = `Draft Response to ${email.from_name || email.from_email} — ${deal.company}`;
  const description = `${email.from_name || email.from_email} asked ${answered.length + unanswered.length || "several"} question(s) about ${deal.company}. Drafted a reply using the deal write-up${(notesRes.data || []).length ? ", deal-space notes" : ""}${(transcriptsRes.data || []).length ? ", and call transcripts" : ""}. Review before sending.`;
  const rationaleParts = [
    `Inbound email from a funding-source contact (${email.from_email}) contained questions about ${deal.company}.`,
    answered.length ? `Answered ${answered.length}: ${answered.slice(0, 5).join("; ")}.` : "",
    unanswered.length ? `Flagged ${unanswered.length} as needing manager confirmation: ${unanswered.slice(0, 5).join("; ")}.` : "",
  ].filter(Boolean).join(" ");

  if (dryRun) {
    return new Response(JSON.stringify({
      ok: true, dry_run: true, deal_id: dealId, subject, body: draftBody,
      answered_questions: answered, unanswered_questions: unanswered,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const toRecipient = email.from_email;
  const payload = {
    user_id: deal.user_id,
    deal_id: dealId,
    deal_name: deal.company,
    action_type: "draft_email",
    title,
    description,
    payload: {
      source_email_cache_id: email.id,
      thread_id: email.thread_id,
      answered_questions: answered,
      unanswered_questions: unanswered,
    },
    source: {
      kind: "lender_question_response",
      email_cache_id: email.id,
      thread_id: email.thread_id,
      from: email.from_email,
    },
    priority: unanswered.length > 0 ? "high" : "normal",
    risk_level: "medium",
    target_object_type: dealLenderId ? "deal_lender" : "deal",
    target_object_id: dealLenderId || dealId,
    new_values: {
      to: [toRecipient],
      cc: [],
      subject,
      body: draftBody,
      in_reply_to_gmail_message_id: email.id,
      thread_id: email.thread_id,
    },
    evidence,
    rationale: rationaleParts,
    on_approve_execution_type: "email",
  };

  const { data: inserted, error: insErr } = await admin
    .from("ai_action_queue")
    .insert(payload)
    .select("id")
    .single();

  if (insErr) {
    console.error("[draft-lender-question-response] insert failed", insErr);
    return new Response(JSON.stringify({ ok: false, error: insErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({
    ok: true,
    queue_id: inserted?.id,
    deal_id: dealId,
    deal_lender_id: dealLenderId,
    answered_questions: answered,
    unanswered_questions: unanswered,
    subject,
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});