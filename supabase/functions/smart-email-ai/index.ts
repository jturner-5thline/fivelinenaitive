import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

    const requestBody = await req.json();
    const { action, dealId, emailData, threadData, draftType, customInstructions, optionCount } = requestBody;
    const attachments = Array.isArray(requestBody?.attachments) ? requestBody.attachments : [];

    // Validate input lengths
    const threadStr = JSON.stringify(threadData || {});
    if (threadStr.length > 50000) {
      return new Response(JSON.stringify({ error: "Thread data too large" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Assemble deal context ──────────────────────────────────
    let dealContext = "";
    let dealContextSources: string[] = [];
    if (dealId) {
      const [dealRes, writeupRes, lendersRes, milestonesRes, activityRes, notesRes] = await Promise.all([
        supabase.from("deals").select("*").eq("id", dealId).single(),
        supabase.from("deal_writeups").select("*").eq("deal_id", dealId).single(),
        supabase.from("deal_lenders").select("*").eq("deal_id", dealId),
        supabase.from("deal_milestones").select("*").eq("deal_id", dealId).order("position"),
        supabase.from("activity_logs").select("*").eq("deal_id", dealId).order("created_at", { ascending: false }).limit(10),
        supabase.from("deal_notes").select("*").eq("deal_id", dealId).order("created_at", { ascending: false }).limit(5),
      ]);

      const deal = dealRes.data;
      const writeup = writeupRes.data;
      const lenders = lendersRes.data || [];
      const milestones = milestonesRes.data || [];
      const activities = activityRes.data || [];
      const notes = notesRes.data || [];

      if (deal) {
        dealContextSources.push("deal_metadata");
        dealContext += `\nDEAL CONTEXT:
- Company: ${deal.company || "N/A"}
- Stage: ${deal.stage || "N/A"}
- Value: $${deal.value ? (deal.value / 1000000).toFixed(1) + "M" : "N/A"}
- Deal Type: ${deal.deal_type || "N/A"}
- Status: ${deal.status || "N/A"}
- Contact: ${deal.contact || "N/A"}
- Contact Email: ${deal.contact_email || "N/A"}
`;
      }

      if (writeup) {
        dealContextSources.push("deal_writeup");
        dealContext += `\nWRITEUP:
- Industry: ${writeup.industry || "N/A"}
- Capital Ask: ${writeup.capital_ask || "N/A"}
- Revenue (This Year): ${writeup.this_year_revenue || "N/A"}
- Revenue (Last Year): ${writeup.last_year_revenue || "N/A"}
- Use of Funds: ${writeup.use_of_funds || "N/A"}
- Description: ${(writeup.description || "N/A").substring(0, 500)}
`;
      }

      if (lenders.length > 0) {
        dealContextSources.push("deal_lenders");
        dealContext += `\nLENDERS (${lenders.length}):
${lenders.map((l: any) => `- ${l.name}: stage=${l.stage}, substage=${l.substage || "none"}${l.quote_amount ? ", quote=$" + (l.quote_amount / 1000000).toFixed(1) + "M" : ""}${l.quote_rate ? ", rate=" + l.quote_rate + "%" : ""}`).join("\n")}
`;
      }

      if (milestones.length > 0) {
        dealContextSources.push("milestones");
        dealContext += `\nMILESTONES:
${milestones.map((m: any) => `- ${m.title}: ${m.completed ? "✅ Done" : "⬜ Pending"}${m.due_date ? " (due: " + m.due_date + ")" : ""}`).join("\n")}
`;
      }

      if (activities.length > 0) {
        dealContextSources.push("recent_activity");
        dealContext += `\nRECENT ACTIVITY (last 10):
${activities.map((a: any) => `- [${a.activity_type}] ${a.description} (${a.created_at?.substring(0, 10)})`).join("\n")}
`;
      }

      if (notes.length > 0) {
        dealContextSources.push("deal_notes");
        dealContext += `\nRECENT NOTES:
${notes.map((n: any) => `- ${(n.content || n.note || "").substring(0, 200)} (${n.created_at?.substring(0, 10)})`).join("\n")}
`;
      }
    }

    // ─── Get user profile for signature context ─────────────────
    let userContext = "";
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, first_name, last_name, email")
      .eq("user_id", user.id)
      .single();

    if (profile) {
      userContext = `\nSENDER IDENTITY:
- Name: ${profile.display_name || `${profile.first_name || ""} ${profile.last_name || ""}`.trim()}
- Email: ${profile.email || user.email}
`;
    }

    let systemPrompt = "";
    let userPrompt = "";

    // ─── Route by action ────────────────────────────────────────
    switch (action) {
      case "generate_draft_options": {
        // Determine draft type
        const effectiveDraftType = draftType || "reply";
        const threadEmails = threadData?.emails || [];
        const latestEmail = threadEmails[0];
        const wantThree = optionCount === 3;

        // Detect scheduling intent
        const fullBody = threadEmails.map((e: any) => e.body_preview || "").join(" ").toLowerCase();
        const hasSchedulingIntent = /\b(schedule|availability|calendar|meeting|call|slot|free|available|reschedule|time works|when can)\b/i.test(fullBody);

        const optionsBlock = wantThree
          ? `  "option_1_subject": "string — email subject line",
  "option_1_body": "string — full email body text",
  "option_1_tone_label": "Concise",
  "option_1_rationale": "string — why this version works",
  "option_2_subject": "string — same or similar subject",
  "option_2_body": "string — full email body text",
  "option_2_tone_label": "Balanced",
  "option_2_rationale": "string — why this version works",
  "option_3_subject": "string — same or similar subject",
  "option_3_body": "string — full email body text",
  "option_3_tone_label": "Detailed",
  "option_3_rationale": "string — why this version works",
  "recommended_option": 1 | 2 | 3,`
          : `  "option_1_subject": "string — email subject line",
  "option_1_body": "string — full email body text",
  "option_1_tone_label": "string — e.g. 'Concise & Direct'",
  "option_1_rationale": "string — why this version works",
  "option_2_subject": "string — same or similar subject",
  "option_2_body": "string — full email body text",
  "option_2_tone_label": "string — e.g. 'Polished & Warm'",
  "option_2_rationale": "string — why this version works",
  "recommended_option": 1 or 2,`;

        const generationRule = wantThree
          ? `- Generate exactly 3 draft options:
   • Option 1 — "Concise": shorter, direct, gets to the point in 2-4 sentences. Still warm and natural.
   • Option 2 — "Balanced": the strongest standard reply, 4-7 sentences. Friendly, polished, and sendable.
   • Option 3 — "Detailed": more explanatory, includes relevant context and next steps; can run longer (still under ~250 words). Conversational throughout.
- All three must convey the SAME intent and substance — they differ only in length, structure, and level of detail.
- All three must sound like the same sender and follow the TONE & STYLE rules below.`
          : `- Generate exactly 2 draft options.
- Both drafts must convey the SAME intent, recommendation, and tone.
- They should differ only in wording, sentence structure, and phrasing — NOT in strategy or substance.
- One may be slightly tighter/direct, the other slightly smoother.
- Both must sound like the same sender and follow the TONE & STYLE rules below.
- Keep replies concise (under 150 words) unless complexity demands more.`;

        systemPrompt = `You are drafting emails on behalf of the user — a debt advisory and capital markets professional. Your voice is warm, human, and conversational while still polished and appropriate for lenders, borrowers, investors, and other professional counterparties. Think "smart colleague firing off a quick deal email," not "corporate memo."

TONE & STYLE (apply to ALL draft options by default):
- Slightly informal, friendly, and natural — never stiff or legalistic.
- Prefer phrases like: "Thanks for the update!", "Appreciate you sending this over", "Sounds good!", "Happy to take a look", "No problem!", "Hope you're doing well", "Will circle back soon", "Let us know if any questions come up".
- Avoid overly formal phrases like: "Thank you for your correspondence.", "We appreciate your prompt response.", "Please do not hesitate to reach out.", "Kindly advise.", "We will revert accordingly."
- Short, clean sentences. Avoid long multi-clause sentences, excessive commas, stiff semicolons, or memo-like em dashes.
- Occasional "!" is fine where it feels natural — do NOT overdo it (max 1-2 per draft, and only when warmth fits).
- No slang, no emojis, no playful filler, no loss of factual precision.
- If the underlying message is sensitive, serious, or negative, dial the warmth down and stay measured — accuracy and appropriateness always beat informality.
- For simple check-ins, scheduling, intros, or quick acknowledgements, lean into the warmer/lighter end of the range.

CRITICAL RULES:
- Use ONLY the provided structured context. Never fabricate deal facts, process status, attachment details, notes content, or scheduling availability.
- If context is incomplete, note uncertainty — do NOT fill gaps with assumptions.
${generationRule}
- Do NOT include email signatures — the app handles that.
- Return ONLY valid JSON matching the required schema. No markdown fences, no commentary.
${hasSchedulingIntent ? "\n- SCHEDULING DETECTED: Only reference specific availability times if they were provided in the context. If no calendar data is provided, suggest the recipient propose times rather than inventing availability." : ""}

REQUIRED JSON SCHEMA:
{
  "detected_intent": "string — what the email is about",
  "draft_type": "${effectiveDraftType}",
  "confidence": "high|medium|low",
  "requires_more_context": boolean,
  "missing_context_items": ["string array of what's missing, if any"],
  "used_deal_context": boolean,
  "used_calendar_context": boolean,
${optionsBlock}
  "recommended_option_reason": "string",
  "suggested_follow_up_actions": ["string array"],
  "cited_context_sources": ["string array of data sources used"]
}`;

        const threadForPrompt = threadEmails.map((e: any) =>
          `From: ${e.from_name} <${e.from_email}>
To: ${e.to_name} <${e.to_email}>
Date: ${e.received_at}
---
${e.body_preview}
---`
        ).join("\n\n");

        userPrompt = `${dealContext}${userContext}

DRAFT TYPE: ${effectiveDraftType}
${customInstructions ? `\nUSER INSTRUCTIONS: ${customInstructions}` : ""}

EMAIL THREAD "${threadData?.subject || ""}":
${threadForPrompt}

Generate ${wantThree ? 3 : 2} closely-aligned draft ${effectiveDraftType} options based on the above context. Return strict JSON only.`;
        break;
      }

      case "draft_reply": {
        systemPrompt = `You are an expert debt advisory professional at a capital advisory firm. Draft a professional reply email based on the deal context and conversation. Be concise, professional, and action-oriented. Output ONLY the email body text (no subject, no "From:", etc.).`;
        userPrompt = `${dealContext}

EMAIL THREAD:
${threadData?.emails?.map((e: any) => `From: ${e.from_name} <${e.from_email}>
To: ${e.to_name} <${e.to_email}>
Date: ${e.received_at}
---
${e.body_preview}
---`).join("\n\n")}

Draft a professional reply to the most recent email in this thread. Consider the deal context when relevant.`;
        break;
      }

      case "auto_draft": {
        systemPrompt = `You are an expert debt advisory professional at a capital advisory firm. You proactively draft reply emails when a response is needed. Your drafts should be concise, professional, and address any questions or requests in the latest email. Consider the full deal context for accuracy. Output ONLY the email body text (no subject, no "From:", etc.). Keep replies under 150 words unless the complexity requires more.`;
        userPrompt = `${dealContext}

EMAIL THREAD: "${threadData?.subject}"
${threadData?.emails?.map((e: any) => `From: ${e.from_name} <${e.from_email}>
Date: ${e.received_at}
---
${e.body_preview}
---`).join("\n\n")}

This email requires a response. Draft a professional, context-aware reply addressing any questions, requests, or action items in the latest message.`;
        break;
      }

      case "summarize_thread": {
        systemPrompt = `You are a deal analyst. Summarize email threads concisely focusing on: key decisions, action items, next steps, and deal-relevant information. Return a JSON object with: { "summary": "...", "action_items": ["..."], "key_decisions": ["..."], "next_steps": ["..."] }`;
        userPrompt = `${dealContext}

EMAIL THREAD: "${threadData?.subject}"
${threadData?.emails?.map((e: any) => `[${e.from_name}] ${e.body_preview}`).join("\n\n")}

Provide a structured summary.`;
        break;
      }

      case "extract_data": {
        systemPrompt = `You are a financial data extraction specialist. Extract structured deal terms and key data points from emails. Return a JSON object with: { "terms": [{ "label": "...", "value": "...", "confidence": "high|medium|low" }], "dates": [{ "description": "...", "date": "..." }], "amounts": [{ "description": "...", "amount": "..." }] }`;
        userPrompt = `${dealContext}

EMAIL CONTENT:
From: ${emailData?.from_name}
Subject: ${emailData?.subject || threadData?.subject}
Body: ${emailData?.body_preview}

Extract any financial terms, amounts, rates, dates, and other structured data.`;
        break;
      }

      case "detect_signals": {
        systemPrompt = `You are a deal intelligence analyst. Analyze emails for signals that indicate lender stage changes or deal status changes. Return a JSON object with: { "signals": [{ "type": "stage_change|follow_up_needed|risk_flag|positive_signal", "description": "...", "suggested_action": "...", "urgency": "high|medium|low", "lender_name": "..." }] }`;
        userPrompt = `${dealContext}

EMAIL:
From: ${emailData?.from_name} <${emailData?.from_email}>
Subject: ${emailData?.subject || threadData?.subject}
Body: ${emailData?.body_preview}

Identify any signals that suggest:
1. A lender stage should be updated
2. Follow-up is needed
3. There's a risk or concern
4. There's positive momentum`;
        break;
      }

      case "suggest_link": {
        systemPrompt = `You are a deal matching assistant. Given an email and available deal context, determine if this email should be linked to the current deal. Return a JSON object: { "should_link": true/false, "confidence": "high|medium|low", "reason": "..." }`;
        userPrompt = `${dealContext}

EMAIL:
From: ${emailData?.from_name} <${emailData?.from_email}>
Subject: ${emailData?.subject}
Body: ${emailData?.body_preview}

Should this email be linked to this deal? Consider sender, subject, and content relevance.`;
        break;
      }

      case "follow_up_check": {
        systemPrompt = `You are a deal operations assistant. Analyze email threads to identify ones that need follow-up. Return a JSON object: { "needs_follow_up": true/false, "days_since_last_reply": number, "urgency": "high|medium|low", "suggested_follow_up": "..." }`;
        userPrompt = `${dealContext}

EMAIL THREAD: "${threadData?.subject}"
Latest message from: ${threadData?.latestEmail?.from_name}
Latest message date: ${threadData?.latestEmail?.received_at}
Thread messages:
${threadData?.emails?.map((e: any) => `[${e.from_name} - ${e.received_at}] ${e.snippet}`).join("\n")}

Does this thread need a follow-up? If so, suggest what to say.`;
        break;
      }

      case "email_to_activity": {
        systemPrompt = `You are a deal activity logger. Given an email thread, generate a concise activity log entry that captures the key event or update. Return a JSON object: { "activity_type": "email_exchange|lender_update|document_received|meeting_scheduled|action_required|status_update", "summary": "...", "key_details": ["..."], "suggested_tags": ["..."] }. The summary should be a single sentence (max 100 chars) suitable for an activity feed. key_details should be 2-4 bullet points of important information.`;
        userPrompt = `${dealContext}

EMAIL THREAD: "${threadData?.subject}"
Participants: ${threadData?.emails?.map((e: any) => e.from_name).filter((n: string, i: number, a: string[]) => a.indexOf(n) === i).join(", ")}
${threadData?.emails?.map((e: any) => `[${e.from_name} - ${e.received_at}] ${e.body_preview}`).join("\n\n")}

Generate a concise activity log entry for this email thread.`;
        break;
      }

      case "parse_term_sheet": {
        systemPrompt = `You are a term sheet analysis expert in commercial lending and debt advisory. Extract and structure key terms from a term sheet email or attachment description. Return a JSON object: { "deal_terms": { "facility_type": "...", "amount": "...", "rate": "...", "spread": "...", "tenor": "...", "amortization": "...", "collateral": "...", "covenants": ["..."], "fees": [{ "type": "...", "amount": "..." }], "conditions_precedent": ["..."], "key_dates": [{ "description": "...", "date": "..." }] }, "comparison_notes": "...", "risk_flags": ["..."], "negotiation_points": ["..."] }. Be thorough but only include fields where data is clearly present. comparison_notes should note how these terms compare to market norms if identifiable.`;
        userPrompt = `${dealContext}

TERM SHEET EMAIL:
From: ${emailData?.from_name} <${emailData?.from_email}>
Subject: ${emailData?.subject || threadData?.subject}
Body: ${emailData?.body_preview}

${threadData?.emails ? `FULL THREAD:\n${threadData.emails.map((e: any) => `[${e.from_name}] ${e.body_preview}`).join("\n\n")}` : ""}

Parse and extract all term sheet data from this email/thread. Identify any risk flags and potential negotiation points.`;
        break;
      }

      case "detect_lender_pass": {
        // Classify whether the latest inbound email is a lender pass/decline.
        // Returns strict JSON for downstream UI confirmation.
        const latestEmail = emailData || threadData?.latestEmail || threadData?.emails?.[0];
        const senderEmail: string = (latestEmail?.from_email || "").toLowerCase();
        const senderName: string = latestEmail?.from_name || "";
        const senderDomain = senderEmail.split("@")[1] || "";

        // Build lender candidate list from the deal so the model can match exactly.
        let lenderCandidates: Array<{ id: string; name: string }> = [];
        if (dealId) {
          const { data: ls } = await supabase
            .from("deal_lenders")
            .select("id, name, stage")
            .eq("deal_id", dealId);
          lenderCandidates = (ls || []).map((l: any) => ({ id: l.id, name: l.name }));
        }

        systemPrompt = `You are a careful classifier deciding whether the LAST inbound email from a lender contact is a PASS / DECLINE on a debt deal.

You return STRICT JSON with this schema:
{
  "is_pass": boolean,
  "confidence": "low" | "medium" | "high",
  "intent_category": "hard_pass" | "soft_pass" | "info_request" | "scheduling" | "internal_forward" | "other",
  "reason_summary": "string — short, neutral, max ~140 chars (e.g. 'US team not a fit')",
  "source_quote": "string — the single most decisive quoted sentence from the email, verbatim",
  "matched_lender_name": "string — pick from candidates list, or empty string if none match",
  "matched_lender_id": "string — id of matched lender from candidates, or empty string"
}

CLASSIFICATION RULES:
- A PASS = the lender themselves clearly indicate they will not move forward on this opportunity.
- High confidence = unambiguous decline language ("we have to pass", "we're declining", "not a fit", "unable to pursue").
- Medium confidence = clear lean toward decline but slightly hedged ("after discussing internally we don't think this works for us right now").
- Low confidence / not a pass = "circle back later", "need more info", scheduling messages, internal forwards, or any non-decline content.
- A "soft" not-now ("circle back in 6 months", "interesting but timing isn't right") => intent_category="soft_pass" and is_pass=false unless extremely explicit.
- An internal forward (someone forwarding the lender's reply rather than the lender writing it) => intent_category="internal_forward" and is_pass=false.
- A request for more information => intent_category="info_request" and is_pass=false.
- Never invent a quote. If unsure, use the most decisive sentence verbatim from the email body.

LENDER MATCHING:
- Use sender name, sender email domain, and email content to match the sender to ONE lender from the candidates list.
- If no candidate is a clear match, return "" for matched_lender_name and matched_lender_id.

Return ONLY the JSON object, no markdown fences, no commentary.`;

        userPrompt = `${dealContext}

LENDER CANDIDATES ON THIS DEAL:
${lenderCandidates.length > 0 ? lenderCandidates.map(l => `- id=${l.id} name="${l.name}"`).join("\n") : "(none)"}

INBOUND EMAIL TO CLASSIFY:
From: ${senderName} <${senderEmail}>
Sender domain: ${senderDomain}
Subject: ${latestEmail?.subject || threadData?.subject || ""}
Date: ${latestEmail?.received_at || ""}

Body:
${(latestEmail?.body_preview || latestEmail?.snippet || "").substring(0, 4000)}

Classify this email per the rules. Return strict JSON only.`;
        break;
      }

      case "suggest_data_room_destination": {
        // Suggest the best deal + category for uploading a set of email attachments.
        // Inputs: emailData/threadData (subject, body, sender), and `attachments` (array of {filename, content_type, size}).
        const latestEmail = emailData || threadData?.latestEmail || threadData?.emails?.[0];
        const senderEmail: string = (latestEmail?.from_email || "").toLowerCase();
        const senderName: string = latestEmail?.from_name || "";
        const senderDomain = senderEmail.split("@")[1] || "";
        const subject: string = latestEmail?.subject || threadData?.subject || "";
        const body: string = (latestEmail?.body_preview || latestEmail?.snippet || "").substring(0, 3000);
        const incomingAttachments: Array<{ filename: string; content_type?: string; size?: number }> = attachments;
        const attachmentList = incomingAttachments;

        // If a dealId is already provided, fetch its name; otherwise look up candidate deals
        // by sender domain via the user's accessible deals.
        let candidateDeals: Array<{ id: string; company: string }> = [];
        if (dealId) {
          const { data: d } = await supabase.from("deals").select("id, company").eq("id", dealId).maybeSingle();
          if (d) candidateDeals.push({ id: d.id, company: d.company });
        } else {
          const { data: ds } = await supabase
            .from("deals")
            .select("id, company, contact_email, status")
            .eq("status", "active")
            .limit(50);
          candidateDeals = (ds || []).map((d: any) => ({ id: d.id, company: d.company }));
        }

        systemPrompt = `You categorize email attachments for upload into a deal's data room.

Return STRICT JSON:
{
  "suggested_deal_id": "string — id from candidate list, or empty string",
  "suggested_deal_name": "string — company name, or empty string",
  "confidence": "low" | "medium" | "high",
  "reason": "string — short, e.g. 'Subject mentions Censys; sender email matches deal contact'",
  "default_category": "materials" | "financials" | "agreements" | "other",
  "per_file": [
    { "filename": "string", "category": "materials" | "financials" | "agreements" | "other", "include": true }
  ]
}

CATEGORY RULES (deal data room has 4 categories):
- financials = CIM, financial model, P&L, balance sheet, cash flow, projections, budget, KPIs, tax returns, audit
- agreements = NDA, LOI, term sheet, contract, MSA, amendment, lease, license
- materials = pitch deck, presentation, teaser, memo, overview, customer list, product docs
- other = anything else

PER-FILE RULES:
- Always include every input filename in per_file (preserve filenames exactly).
- Set include=false ONLY for obvious tracking pixels, 1x1 images, signature logos, or empty files.
- Pick the single best category per file based on filename + content_type.

DEAL MATCHING:
- Score by: explicit company name in subject/body, sender email/domain matching a known deal contact, attachment filenames mentioning company names.
- High confidence requires multiple matching signals.
- If unsure, return empty suggested_deal_id and confidence "low".

Return ONLY the JSON object — no markdown, no commentary.`;

        userPrompt = `EMAIL:
From: ${senderName} <${senderEmail}>
Sender domain: ${senderDomain}
Subject: ${subject}
Body excerpt:
${body}

ATTACHMENTS TO CLASSIFY:
${attachmentList.map(a => `- "${a.filename}" (${a.content_type || "unknown"}, ${a.size ? Math.round(a.size / 1024) + " KB" : "?"})`).join("\n") || "(none)"}

CANDIDATE DEALS (active):
${candidateDeals.length > 0 ? candidateDeals.slice(0, 30).map(d => `- id=${d.id} name="${d.company}"`).join("\n") : "(none)"}

Classify and return strict JSON only.`;
        break;
      }

      case "analyze_thread_workflow": {
        // Claude-powered workflow extraction: identifies likely deal, lender contact,
        // lender firm, workflow signal, recommended update, reason, and supporting quote.
        // When no dealId is provided, also tries to infer the most likely deal from the
        // user's accessible active deals.
        const latestEmail = emailData || threadData?.latestEmail || threadData?.emails?.[0];
        const senderEmail: string = (latestEmail?.from_email || "").toLowerCase();
        const senderName: string = latestEmail?.from_name || "";
        const senderDomain = senderEmail.split("@")[1] || "";
        const subject: string = latestEmail?.subject || threadData?.subject || "";

        // Build lender candidate list from the linked deal (for high-precision matching).
        let lenderCandidates: Array<{ id: string; name: string; stage?: string }> = [];
        if (dealId) {
          const { data: ls } = await supabase
            .from("deal_lenders")
            .select("id, name, stage")
            .eq("deal_id", dealId);
          lenderCandidates = (ls || []).map((l: any) => ({ id: l.id, name: l.name, stage: l.stage }));
        }

        // Build deal candidates — when no deal is linked yet, surface deals the
        // user can access so Claude can infer the likely match. We pull a wider
        // set than before (no `status='active'` filter — Naitive deals use other
        // statuses) and pre-rank by subject/body keyword overlap so the most
        // promising matches appear at the top of the prompt.
        let dealCandidates: Array<{ id: string; company: string; name?: string; stage?: string }> = [];
        if (!dealId) {
          // Resolve user's company for tenant-scoped candidate fetching.
          const { data: memberships } = await supabase
            .from("company_members")
            .select("company_id")
            .eq("user_id", user.id);
          const companyIds = (memberships || []).map((m: any) => m.company_id).filter(Boolean);

          let dealsQuery = supabase
            .from("deals")
            .select("id, company, name, stage, status")
            .order("updated_at", { ascending: false })
            .limit(300);
          if (companyIds.length > 0) {
            dealsQuery = dealsQuery.in("company_id", companyIds);
          }
          const { data: ds } = await dealsQuery;
          const all = (ds || []) as any[];

          // Pre-rank: exact / partial matches against subject + body get top
          // priority. Strip generic words to reduce false positives.
          const haystack = `${subject} ${(latestEmail?.body_preview || "").substring(0, 2000)}`.toLowerCase();
          const scored = all.map((d) => {
            const company = (d.company || "").toLowerCase().trim();
            const altName = (d.name || "").toLowerCase().trim();
            let score = 0;
            for (const candidate of [company, altName]) {
              if (!candidate || candidate.length < 3) continue;
              if (subject.toLowerCase().includes(candidate)) score += 10;
              else if (haystack.includes(candidate)) score += 5;
            }
            return { d, score };
          });
          scored.sort((a, b) => b.score - a.score);

          // Always include matched candidates first, then fill up to 80 with
          // the most-recently-updated deals so Claude still has breadth.
          const matched = scored.filter((s) => s.score > 0).map((s) => s.d);
          const rest = scored.filter((s) => s.score === 0).map((s) => s.d);
          const ordered = [...matched, ...rest].slice(0, 80);
          dealCandidates = ordered.map((d: any) => ({
            id: d.id,
            company: d.company || d.name || "",
            name: d.name && d.name !== d.company ? d.name : undefined,
            stage: d.stage,
          }));
        }

        systemPrompt = `You are a careful debt-advisory workflow classifier. You read an email thread between an advisor and a lender and infer:
1. The most likely DEAL the thread is about
2. The most likely lender CONTACT (the person)
3. The most likely lender FIRM / account
4. The workflow SIGNAL the inbound email represents
5. A recommended UPDATE to suggest to the user (confirm-first; never auto-applied)

Return STRICT JSON only — no markdown fences, no commentary:
{
  "likely_deal": { "id": "string — id from candidate list, or empty", "name": "string — deal company name, or empty", "confidence": "low|medium|high", "reasoning": "string — brief why" },
  "likely_contact": { "name": "string — sender name or signature name", "email": "string", "confidence": "low|medium|high" },
  "likely_lender_firm": { "id": "string — id from lender candidates if matched, else empty", "name": "string — firm/account name (from signature, domain, or candidates)", "confidence": "low|medium|high", "reasoning": "string" },
  "signal": {
    "type": "terms_issued|lender_pass|not_a_fit|info_request|meeting_request|positive_interest|diligence_question|access_issue|internal_note|no_signal",
    "label": "string — short human-readable, e.g. 'Term sheet received', 'Lender pass (US team)'",
    "confidence": "low|medium|high",
    "supporting_quote": "string — the single most decisive verbatim quote from the email body",
    "nuance": "string — any important nuance, e.g. 'US team passed but UK team may still review' (empty string if none)"
  },
  "recommended_update": {
    "kind": "deal_stage|lender_status|none",
    "title": "string — explicit confirm-first prompt, e.g. 'Mark TriplePoint Capital as Passed on Arbolus?' or 'Update Arbolus to Terms Issued?'",
    "deal_id": "string — id of the deal this update targets (use linked dealId if present, else likely_deal.id)",
    "deal_name": "string",
    "lender_id": "string — id of the lender candidate this targets, or empty",
    "lender_name": "string — firm name, or empty",
    "new_stage": "passed|terms_issued|not_a_fit|info_requested|engaged|interested|other|empty string",
    "reason_note": "string — short rationale to save with the update (max ~200 chars)",
    "confidence": "low|medium|high"
  },
  "secondary_action": {
    "kind": "draft_reply|log_activity|none",
    "title": "string — short prompt, e.g. 'Log lender feedback to Arbolus activity'",
    "details": "string — empty if none"
  }
}

CLASSIFICATION GUIDE:
- terms_issued: lender sends term sheet / indicative terms / proposal letter / LOI. Look for terms like "indicative terms", "term sheet attached", "proposal letter", numerical pricing offers.
- lender_pass: lender clearly declines ("we have to pass", "we're declining", "won't move forward", "unable to pursue"). Distinguish hard pass vs nuanced regional pass — preserve nuance.
- not_a_fit: "outside our strike zone", "not in our wheelhouse", "doesn't fit our box".
- info_request: lender asks for diligence materials, model, or follow-ups.
- meeting_request: scheduling language ("let's get on a call", "available next week").
- positive_interest: "we're interested", "would like to learn more", "seems compelling".
- diligence_question: a pointed question about the financials or business.
- access_issue: data room login problems / file access errors.
- internal_note: an internal forward or commentary, NOT external lender wording. In this case set recommended_update.kind="none".
- no_signal: small talk, thanks, intros — no workflow update warranted.

DEAL MATCHING:
- Use subject line, signature, prior thread content, sender email, and candidate list.
- If a deal is already linked (dealId in context), use that and set high confidence.
- Otherwise, score by exact company name match in subject or thread body, then by sender domain matching a candidate's known contact.
- If no candidate is a clear match, set likely_deal.id="" and confidence="low".

LENDER FIRM MATCHING:
- Prefer exact match against lender candidate list.
- Otherwise infer firm from sender email signature, domain (drop generic gmail/outlook), or footer text.

QUOTE EXTRACTION:
- supporting_quote MUST be a verbatim sentence from the email body. Never paraphrase. If unsure, use the most decisive sentence.

CONFIDENCE:
- high = unambiguous matches and clear signal language.
- medium = strong inference but some ambiguity (e.g., regional nuance).
- low = weak inference; requires user to confirm associations first.

If the email is internal commentary only (kind="internal_note"), recommended_update should be {"kind":"none"}.`;

        userPrompt = `${dealContext}

LENDER CANDIDATES ON LINKED DEAL:
${lenderCandidates.length > 0 ? lenderCandidates.map(l => `- id=${l.id} name="${l.name}" stage=${l.stage || "?"}`).join("\n") : "(none — deal not linked or has no lenders)"}

${!dealId ? `CANDIDATE DEALS (no deal linked yet — pick the most likely one if you can; the top entries already keyword-match the subject/body):
${dealCandidates.length > 0 ? dealCandidates.slice(0, 60).map(d => `- id=${d.id} name="${d.company}"${d.name ? ` aka="${d.name}"` : ""} stage=${d.stage || "?"}`).join("\n") : "(none)"}` : `LINKED DEAL: id=${dealId}`}

EMAIL THREAD:
Subject: ${subject}
Latest inbound message:
  From: ${senderName} <${senderEmail}>
  Sender domain: ${senderDomain}
  Date: ${latestEmail?.received_at || ""}
  Body:
${(latestEmail?.body_preview || latestEmail?.snippet || "").substring(0, 5000)}

Earlier thread context (most recent first):
${(threadData?.emails || []).slice(0, 6).map((e: any) => `[${e.from_name} <${e.from_email}> @ ${e.received_at}] ${(e.body_preview || e.snippet || "").substring(0, 800)}`).join("\n---\n")}

Analyze and return strict JSON per the schema.`;
        break;
      }

      case "follow_up_sequence": {
        systemPrompt = `You are a deal follow-up strategist. Analyze an email thread and suggest a follow-up sequence strategy. Return a JSON object: { "status": "awaiting_response|ball_in_our_court|mutual_action|stale", "days_silent": number, "recommended_sequence": [{ "day": number, "action": "email|call|internal_note", "tone": "gentle|firm|urgent", "draft": "..." }], "escalation_trigger": "...", "context_notes": "..." }. day is the number of days from now. Limit to 3 follow-ups max. Each draft should be under 80 words.`;
        userPrompt = `${dealContext}

EMAIL THREAD: "${threadData?.subject}"
Latest message from: ${threadData?.latestEmail?.from_name}
Latest message date: ${threadData?.latestEmail?.received_at}
Thread history:
${threadData?.emails?.map((e: any) => `[${e.from_name} - ${e.received_at}] ${e.snippet}`).join("\n")}

Analyze this thread and create a follow-up sequence plan. Consider the deal stage, lender relationships, and urgency.`;
        break;
      }

      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: action === "generate_draft_options" ? "google/gemini-2.5-flash" : action === "analyze_thread_workflow" ? "google/gemini-2.5-flash" : "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: (action === "draft_reply" || action === "auto_draft" || action === "generate_draft_options") ? 0.7 : 0.3,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      throw new Error("AI gateway error");
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content || "";

    // Try to parse as JSON for structured responses
    let parsed: any = content;
    if (action !== "draft_reply" && action !== "auto_draft") {
      try {
        const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        parsed = { raw: content };
      }
    }

    // For generate_draft_options, inject context sources
    if (action === "generate_draft_options" && typeof parsed === "object" && !parsed.raw) {
      parsed.cited_context_sources = dealContextSources.length > 0 ? dealContextSources : ["email_thread_only"];
    }

    // Log AI usage
    if (action === "generate_draft_options") {
      try {
        const { data: membership } = await supabase
          .from("company_members")
          .select("company_id")
          .eq("user_id", user.id)
          .limit(1)
          .single();

        if (membership?.company_id) {
          await supabase.from("ai_usage_logs").insert({
            user_id: user.id,
            company_id: membership.company_id,
            feature: "email_draft_options",
            model: "google/gemini-2.5-flash",
            input_tokens: aiResult.usage?.prompt_tokens || 0,
            output_tokens: aiResult.usage?.completion_tokens || 0,
            status: "success",
          });
        }
      } catch (logErr) {
        console.error("Failed to log AI usage:", logErr);
      }
    }

    // For email_to_activity, also log the activity
    if (action === "email_to_activity" && dealId && parsed?.summary) {
      try {
        await supabase.from("activity_logs").insert({
          deal_id: dealId,
          activity_type: parsed.activity_type || "email_exchange",
          description: parsed.summary,
          user_id: user.id,
          metadata: {
            source: "smart_email",
            thread_subject: threadData?.subject,
            key_details: parsed.key_details,
            suggested_tags: parsed.suggested_tags,
          },
        });
      } catch (logErr) {
        console.error("Failed to log activity:", logErr);
      }
    }

    // For detect_lender_pass, persist the detection so the UI can read/confirm it later.
    if (action === "detect_lender_pass" && dealId && typeof parsed === "object" && !parsed.raw) {
      try {
        const latest = emailData || threadData?.latestEmail || threadData?.emails?.[0];
        const messageId: string | undefined = latest?.gmail_message_id || latest?.id;

        if (messageId) {
          const isPass = !!parsed.is_pass;
          const confidence = ["low", "medium", "high"].includes(parsed.confidence) ? parsed.confidence : "low";
          const matchedId: string | null = parsed.matched_lender_id && typeof parsed.matched_lender_id === "string" && parsed.matched_lender_id.length > 0
            ? parsed.matched_lender_id
            : null;
          const matchedName: string = parsed.matched_lender_name || "";

          // Upsert by (gmail_message_id, deal_id) — only stamp/refresh if not already confirmed/dismissed.
          const { data: existing } = await supabase
            .from("lender_pass_detections")
            .select("id, status")
            .eq("gmail_message_id", messageId)
            .eq("deal_id", dealId)
            .maybeSingle();

          if (!existing) {
            await supabase.from("lender_pass_detections").insert({
              deal_id: dealId,
              deal_lender_id: matchedId,
              lender_name: matchedName || latest?.from_name || "Unknown lender",
              gmail_message_id: messageId,
              thread_id: latest?.thread_id || threadData?.threadId || null,
              sender_email: latest?.from_email || null,
              sender_name: latest?.from_name || null,
              confidence,
              is_pass: isPass,
              reason_summary: parsed.reason_summary || null,
              source_quote: parsed.source_quote || null,
              status: "pending",
              raw_classification: parsed,
            });
          } else if (existing.status === "pending") {
            // Refresh the latest classification but keep status pending.
            await supabase
              .from("lender_pass_detections")
              .update({
                deal_lender_id: matchedId,
                lender_name: matchedName || latest?.from_name || "Unknown lender",
                confidence,
                is_pass: isPass,
                reason_summary: parsed.reason_summary || null,
                source_quote: parsed.source_quote || null,
                raw_classification: parsed,
              })
              .eq("id", existing.id);
          }
        }
      } catch (persistErr) {
        console.error("Failed to persist lender pass detection:", persistErr);
      }
    }

    return new Response(JSON.stringify({ result: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("smart-email-ai error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
