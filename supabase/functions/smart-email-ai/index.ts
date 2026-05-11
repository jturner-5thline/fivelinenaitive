import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

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
    const { action, dealId, emailData, threadData, draftType, customInstructions, optionCount, singleTone, fastModel, dealContextHint } = requestBody;
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
    // Structured injection facts — extracted up-front so the prompt can
    // tell the model exactly which strings MUST appear in the draft body.
    const injectionFacts: {
      lender_name: string | null;
      lender_stage: string | null;
      open_items: string[]; // actual item descriptions (top 3)
      deal_stage: string | null;
      recent_activity: string | null;
      analyst_note: string | null;
      key_terms: string[]; // formatted "amount: $5M", "rate: 8%", etc.
    } = {
      lender_name: null,
      lender_stage: null,
      open_items: [],
      deal_stage: null,
      recent_activity: null,
      analyst_note: null,
      key_terms: [],
    };
    if (dealId) {
      const [dealRes, writeupRes, lendersRes, milestonesRes, activityRes, notesRes, outstandingRes, statusNotesRes] = await Promise.all([
        supabase.from("deals").select("*").eq("id", dealId).single(),
        supabase.from("deal_writeups").select("*").eq("deal_id", dealId).single(),
        supabase.from("deal_lenders").select("*").eq("deal_id", dealId),
        supabase.from("deal_milestones").select("*").eq("deal_id", dealId).order("position"),
        supabase.from("activity_logs").select("*").eq("deal_id", dealId).order("created_at", { ascending: false }).limit(10),
        supabase.from("deal_notes").select("*").eq("deal_id", dealId).order("created_at", { ascending: false }).limit(5),
        supabase.from("outstanding_items").select("description, status, due_date, eta, priority, lender_id, created_at").eq("deal_id", dealId).order("position"),
        supabase.from("deal_status_notes").select("note, created_at, user_id").eq("deal_id", dealId).order("created_at", { ascending: false }).limit(3),
      ]);

      const deal = dealRes.data;
      const writeup = writeupRes.data;
      const lenders = lendersRes.data || [];
      const milestones = milestonesRes.data || [];
      const activities = activityRes.data || [];
      const notes = notesRes.data || [];
      const outstandingItems = outstandingRes.data || [];
      const statusNotes = statusNotesRes.data || [];

      if (deal) {
        dealContextSources.push("deal_metadata");
        injectionFacts.deal_stage = deal.stage || null;
        // Build a short list of relevant key terms (only those with values).
        if (deal.value) injectionFacts.key_terms.push(`amount $${(Number(deal.value) / 1_000_000).toFixed(1)}M`);
        if (deal.deal_type) injectionFacts.key_terms.push(`structure ${deal.deal_type}`);
        const closing = deal.closing_date || deal.dashboard_closing_date;
        if (closing) injectionFacts.key_terms.push(`close target ${String(closing).substring(0, 10)}`);
        dealContext += `\nDEAL CONTEXT:
- Company: ${deal.company || "N/A"}
- Stage: ${deal.stage || "N/A"}
- Value: $${deal.value ? (deal.value / 1000000).toFixed(1) + "M" : "N/A"}
- Deal Type: ${deal.deal_type || "N/A"}
- Status: ${deal.status || "N/A"}
- Contact: ${deal.contact || "N/A"}
- Contact Email: ${deal.contact_email || "N/A"}
- Manager: ${deal.manager || "N/A"}
- Analyst: ${deal.analyst || "N/A"}
- Engagement Type: ${deal.engagement_type || "N/A"}
- Exclusivity: ${deal.exclusivity || "N/A"}
- Closing Date: ${deal.closing_date || deal.dashboard_closing_date || "N/A"}
- Total Fee: ${deal.total_fee ? "$" + Number(deal.total_fee).toLocaleString() : "N/A"}${deal.success_fee_percent ? ` (success fee ${deal.success_fee_percent}%)` : ""}
- Narrative: ${(deal.narrative || "N/A").toString().substring(0, 400)}
`;
      }

      if (writeup) {
        dealContextSources.push("deal_writeup");
        // Build a rich writeup block — pull every field that's likely to
        // come up in a lender/banker reply (financials, business model,
        // team, highlights, key items). Skip blanks so the AI never sees
        // empty placeholders it might echo back.
        const wuLines: string[] = [];
        const push = (label: string, val: any, max = 400) => {
          const s = (val == null ? "" : String(val)).trim();
          if (s) wuLines.push(`- ${label}: ${s.substring(0, max)}`);
        };
        push("Company", writeup.company_name);
        push("Website", writeup.company_url);
        push("Headquarters", writeup.location);
        push("Year Founded", writeup.year_founded);
        push("Headcount", writeup.headcount);
        push("Industry", writeup.industry);
        push("Deal Type", writeup.deal_type);
        push("Business Model", writeup.billing_model);
        push("Revenue Type", writeup.revenue_type);
        push("B2B / B2C", writeup.b2b_b2c);
        push("Customer Base", writeup.customer_base, 600);
        push("Profitability", writeup.profitability);
        push("Gross Margins", writeup.gross_margins);
        push("Capital Ask", writeup.capital_ask);
        push("Revenue (This Year)", writeup.this_year_revenue);
        push("Revenue (Last Year)", writeup.last_year_revenue);
        push("Total Equity Raised", writeup.total_equity_raised);
        push("Sponsorship", writeup.sponsorship);
        push("Existing Debt", writeup.existing_debt_details, 600);
        push("Collateral Available", writeup.collateral_available, 400);
        push("Use of Funds", writeup.use_of_funds, 600);
        push("Description", writeup.description, 800);

        // Financial years — show the most recent 3 rows so the model can
        // cite ARR / revenue / EBITDA / GM trajectory accurately.
        try {
          const fy = Array.isArray(writeup.financial_years) ? writeup.financial_years : [];
          if (fy.length > 0) {
            const recent = fy.slice(-3);
            const fyLines = recent.map((row: any) => {
              const bits: string[] = [];
              const yr = row.year || row.label || row.period;
              if (yr) bits.push(String(yr));
              const tag = row.is_actual === false || row.actual_or_projected === "P" ? "P" : "A";
              bits.push(`(${tag})`);
              if (row.revenue != null && row.revenue !== "") bits.push(`rev=${row.revenue}`);
              if (row.arr != null && row.arr !== "") bits.push(`arr=${row.arr}`);
              if (row.ebitda != null && row.ebitda !== "") bits.push(`ebitda=${row.ebitda}`);
              if (row.gross_margin != null && row.gross_margin !== "") bits.push(`gm=${row.gross_margin}`);
              return `    · ${bits.join(" ")}`;
            });
            wuLines.push(`- Financial Years (last ${recent.length}):\n${fyLines.join("\n")}`);
          }
        } catch { /* ignore malformed financial_years */ }

        // Key Items (write-up bullets the analyst tagged as important).
        try {
          const ki = Array.isArray(writeup.key_items) ? writeup.key_items : [];
          const cleanKi = ki
            .map((k: any) => (typeof k === "string" ? k : k?.text || k?.label || ""))
            .map((s: string) => String(s || "").replace(/\s+/g, " ").trim())
            .filter(Boolean)
            .slice(0, 8);
          if (cleanKi.length > 0) {
            wuLines.push(`- Key Items:\n${cleanKi.map((s: string) => `    · ${s.substring(0, 220)}`).join("\n")}`);
          }
        } catch { /* ignore */ }

        // Company Highlights (analyst-tagged highlights).
        try {
          const hl = Array.isArray(writeup.company_highlights) ? writeup.company_highlights : [];
          const cleanHl = hl
            .map((h: any) => (typeof h === "string" ? h : h?.text || h?.label || h?.title || ""))
            .map((s: string) => String(s || "").replace(/\s+/g, " ").trim())
            .filter(Boolean)
            .slice(0, 6);
          if (cleanHl.length > 0) {
            wuLines.push(`- Company Highlights:\n${cleanHl.map((s: string) => `    · ${s.substring(0, 220)}`).join("\n")}`);
          }
        } catch { /* ignore */ }

        // Team — name + title only (keep prompt small).
        try {
          const team = Array.isArray(writeup.team) ? writeup.team : [];
          const cleanTeam = team
            .map((t: any) => {
              const name = (t?.name || t?.full_name || "").toString().trim();
              const title = (t?.title || t?.role || t?.position || "").toString().trim();
              if (!name && !title) return "";
              return [name, title].filter(Boolean).join(" — ");
            })
            .filter(Boolean)
            .slice(0, 8);
          if (cleanTeam.length > 0) {
            wuLines.push(`- Team:\n${cleanTeam.map((s: string) => `    · ${s}`).join("\n")}`);
          }
        } catch { /* ignore */ }

        if (wuLines.length > 0) {
          dealContext += `\nDEAL SPACE WRITEUP (cite these facts verbatim — do NOT make up numbers):\n${wuLines.join("\n")}\n`;
        }
      }

      if (lenders.length > 0) {
        dealContextSources.push("deal_lenders");
        // Sort: active first, then most recently updated. Truncate notes so the
        // model sees the analyst's latest commentary verbatim.
        const sortedLenders = [...lenders].sort((a: any, b: any) => {
          const aActive = (a.tracking_status || "").toLowerCase() === "active" ? 0 : 1;
          const bActive = (b.tracking_status || "").toLowerCase() === "active" ? 0 : 1;
          if (aActive !== bActive) return aActive - bActive;
          return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
        });
        // Pick the primary in-context lender (first active, fall back to most recent).
        const primaryLender = sortedLenders[0];
        if (primaryLender) {
          injectionFacts.lender_name = primaryLender.name || null;
          const stagePart = [primaryLender.stage, primaryLender.substage].filter(Boolean).join(" / ");
          injectionFacts.lender_stage = stagePart || null;
        }
        dealContext += `\nLENDERS ON DEAL (${lenders.length} total):
${sortedLenders.map((l: any) => {
          const parts = [
            `tracking=${l.tracking_status || "unknown"}`,
            `stage=${l.stage || "—"}`,
          ];
          if (l.substage) parts.push(`substage=${l.substage}`);
          if (l.quote_amount) parts.push(`quote=$${(l.quote_amount / 1_000_000).toFixed(1)}M`);
          if (l.quote_rate) parts.push(`rate=${l.quote_rate}%`);
          if (l.quote_term) parts.push(`term=${l.quote_term}`);
          if (l.score !== null && l.score !== undefined) parts.push(`score=${l.score}`);
          if (l.pass_reason) parts.push(`pass_reason="${String(l.pass_reason).substring(0, 120)}"`);
          let line = `- ${l.name} [${parts.join(", ")}]`;
          if (l.notes) {
            line += `\n    notes: "${String(l.notes).replace(/\s+/g, " ").substring(0, 280)}"`;
          }
          return line;
        }).join("\n")}
`;
      }

      // Outstanding items — these are the concrete checklist items the model
      // should reference by name when the thread is about diligence/info
      // requests, instead of saying "due diligence list" generically.
      if (outstandingItems.length > 0) {
        dealContextSources.push("outstanding_items");
        const lenderById = new Map<string, string>(
          lenders.map((l: any) => [l.id, l.name]),
        );
        const parseStatus = (s: string | null): { received: boolean; approved: boolean } => {
          if (!s) return { received: false, approved: false };
          try {
            const p = JSON.parse(s);
            return { received: !!p.received, approved: !!p.approved };
          } catch {
            return {
              received: s === "received" || s === "approved" || s === "delivered",
              approved: s === "approved" || s === "delivered",
            };
          }
        };
        const today = Date.now();
        const enriched = outstandingItems.map((i: any) => {
          const st = parseStatus(i.status);
          const dueIso = i.due_date || i.eta;
          let overdueDays: number | null = null;
          if (!st.approved && dueIso) {
            const t = new Date(dueIso).getTime();
            if (!Number.isNaN(t) && t < today) {
              overdueDays = Math.floor((today - t) / 86_400_000);
            }
          }
          return { ...i, parsedStatus: st, overdueDays, dueIso };
        });
        const open = enriched.filter((i: any) => !i.parsedStatus.approved);
        const completed = enriched.filter((i: any) => i.parsedStatus.approved);
        // Top-3 actual descriptions to inject into the draft body verbatim.
        injectionFacts.open_items = open
          .slice(0, 3)
          .map((i: any) => String(i.description || "").trim())
          .filter(Boolean);

        dealContext += `\nOUTSTANDING ITEMS (${open.length} open / ${completed.length} completed):
${open.length === 0
  ? "- (none open)"
  : open
      .slice(0, 25)
      .map((i: any) => {
        const tags: string[] = [];
        if (i.priority && i.priority !== "normal") tags.push(i.priority);
        if (i.parsedStatus.received) tags.push("received, pending approval");
        if (i.overdueDays !== null) tags.push(`${i.overdueDays}d overdue`);
        else if (i.dueIso) tags.push(`due ${String(i.dueIso).substring(0, 10)}`);
        if (i.lender_id && lenderById.has(i.lender_id)) {
          tags.push(`for ${lenderById.get(i.lender_id)}`);
        }
        return `- ${i.description}${tags.length ? ` (${tags.join("; ")})` : ""}`;
      })
      .join("\n")}
${completed.length > 0
  ? `\nRecently completed: ${completed.slice(0, 5).map((i: any) => `"${i.description}"`).join(", ")}`
  : ""}
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
        const a0 = activities[0];
        if (a0?.description) {
          const dateStr = a0.created_at ? ` on ${String(a0.created_at).substring(0, 10)}` : "";
          injectionFacts.recent_activity = `${String(a0.description).substring(0, 180)}${dateStr}`;
        }
        dealContext += `\nRECENT ACTIVITY (last 10):
${activities.map((a: any) => `- [${a.activity_type}] ${a.description} (${a.created_at?.substring(0, 10)})`).join("\n")}
`;
      }

      if (notes.length > 0) {
        dealContextSources.push("deal_notes");
        const n0 = notes[0];
        const noteText = (n0?.content || n0?.note || "").toString().replace(/\s+/g, " ").trim();
        if (noteText) injectionFacts.analyst_note = noteText.substring(0, 200);
        dealContext += `\nANALYST/MANAGER NOTES (most recent first):
${notes.map((n: any) => `- "${(n.content || n.note || "").replace(/\s+/g, " ").substring(0, 400)}" (${n.created_at?.substring(0, 10)})`).join("\n")}
`;
      }

      // Status notes — short status updates (separate table from deal_notes)
      if (statusNotes.length > 0) {
        dealContextSources.push("status_notes");
        dealContext += `\nRECENT STATUS NOTES:
${statusNotes.map((n: any) => `- "${(n.note || "").replace(/\s+/g, " ").substring(0, 300)}" (${n.created_at?.substring(0, 10)})`).join("\n")}
`;
      }
    }

    // ─── Live deal-state hint from the AI panel ────────────────
    // The sidebar already loads a slim "Deal Context" summary (status, days
    // in stage, lender counts, overdue items, last status note). Forwarding
    // it here lets the draft tone explicitly acknowledge urgency for At
    // Risk / Off Track deals without re-querying.
    if (dealContextHint && typeof dealContextHint === "object") {
      dealContextSources.push("deal_state_snapshot");
      const h = dealContextHint;
      const overdue = h.most_overdue_item
        ? `${h.most_overdue_item.days_overdue}d overdue ("${h.most_overdue_item.description}")`
        : "none";
      const lastNote = h.last_status_note
        ? `"${(h.last_status_note.note || "").substring(0, 200)}" — ${h.last_status_note.author || "unknown"}`
        : "none";
      // Financials + open-items rendering. Only emit lines we actually have
      // numbers for, so the AI doesn't see blank/placeholder values.
      const fin = h.financials || {};
      const finLines: string[] = [];
      if (fin.deal_size_display) finLines.push(`- Deal size / capital ask: ${fin.deal_size_display}`);
      if (fin.arr_display) finLines.push(`- ARR: ${fin.arr_display}`);
      if (fin.mrr_display && !fin.arr_display) finLines.push(`- MRR: ${fin.mrr_display}`);
      if (fin.ttm_revenue_display) finLines.push(`- TTM revenue: ${fin.ttm_revenue_display}`);
      if (fin.ebitda_display) finLines.push(`- EBITDA: ${fin.ebitda_display}`);
      const financialsBlock = finLines.length > 0
        ? `\nDEAL SPACE FINANCIALS (cite verbatim — DO NOT round, DO NOT leave $X placeholders):\n${finLines.join("\n")}`
        : "";
      if (financialsBlock) dealContextSources.push("deal_space_financials");
      const openItems = Array.isArray(h.open_items) ? h.open_items.slice(0, 5) : [];
      const openItemsBlock = openItems.length > 0
        ? `\nOPEN OUTSTANDING ITEMS (match against the email topic — if the lender's question maps to one, reference it by name and a concrete ETA):\n${openItems
            .map((it: any) => {
              const timing = it.days_overdue != null
                ? ` (${it.days_overdue}d overdue)`
                : it.due_date ? ` (due ${it.due_date})` : "";
              const owner = it.assignee ? ` — owner: ${it.assignee}` : "";
              return `- ${it.description}${timing}${owner}`;
            })
            .join("\n")}`
        : "";
      const useOfProceedsBlock = h.use_of_proceeds
        ? `\nUSE OF PROCEEDS (cite when the lender asks "what's the money for"):\n"${String(h.use_of_proceeds).slice(0, 600)}"`
        : "";
      const matchedLenderBlock = (h.matched_lender && h.matched_lender_stage)
        ? `\nMATCHED LENDER ON THIS DEAL: ${h.matched_lender} — current stage: ${h.matched_lender_stage}. Tailor pacing/asks to where THIS lender is in our process.`
        : "";
      dealContext += `\nDEAL STATE SNAPSHOT (live from AI panel):
${h.deal_name ? `- Deal: ${h.deal_name}\n` : ""}\
- Status: ${h.status || "unknown"}
- Stage: ${h.stage || "unknown"} (${h.days_in_stage ?? "?"} days in stage)
- Lenders: ${h.active_lenders ?? 0} active of ${h.total_lenders ?? 0} total
- Open outstanding items: ${h.open_outstanding_items ?? 0} (most overdue: ${overdue})
- Last status note: ${lastNote}
${financialsBlock}
${useOfProceedsBlock}
${matchedLenderBlock}
${openItemsBlock}

TONE GUIDANCE FROM DEAL STATE:
${h.status === "at-risk" || h.status === "off-track"
  ? "- The deal is currently flagged as " + h.status.toUpperCase() + ". Acknowledge urgency (without alarm), be direct about next steps, and proactively name the blocker if relevant."
  : h.status === "on-hold"
  ? "- The deal is ON HOLD. Keep the reply measured and avoid implying active progress; reference the pause if the recipient asks about timing."
  : "- The deal is on track. Match a routine, professional cadence — no manufactured urgency."}
${h.most_overdue_item && (h.most_overdue_item.days_overdue ?? 0) >= 3
  ? "- There is a meaningfully overdue outstanding item; if it's relevant to this thread, gently surface it."
  : ""}
${financialsBlock ? "- When the recipient asks about financials, deal size, ARR/MRR, revenue, or EBITDA, reference the exact numbers above. NEVER write '$X' or '[amount]' placeholders." : ""}
`;
    }

    // ─── Get user profile for signature context ─────────────────
    let userContext = "";
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, first_name, last_name, email, email_signature")
      .eq("user_id", user.id)
      .single();

    if (profile) {
      userContext = `\nSENDER IDENTITY:
- Name: ${profile.display_name || `${profile.first_name || ""} ${profile.last_name || ""}`.trim()}
- Email: ${profile.email || user.email}
`;
    }

    // User-level signature (configured in Settings → Email) takes precedence
    // over the company-level style guide signature when appending to AI drafts.
    const userSignature = ((profile as any)?.email_signature || "").trim();

    // ─── Load company Email Style Guide (admin-managed) ─────────
    // Resolves the user's company, then fetches the configured signature,
    // greeting/closing, tone rules, deal-stage rules, and custom instructions.
    // The result is rendered into a strict prompt block that the draft-
    // generating actions prepend to their systemPrompt so every AI-drafted
    // reply matches the firm's voice.
    let styleGuideBlock = "";
    let companySignature = "";
    try {
      const { data: membership } = await supabase
        .from("company_members")
        .select("company_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      const companyId = membership?.company_id as string | undefined;
      if (companyId) {
        const { data: styleGuide } = await supabase
          .from("company_email_style_guide")
          .select("signature, greeting, closing, tone_guidelines, stage_rules, custom_instructions")
          .eq("company_id", companyId)
          .maybeSingle();
        if (styleGuide) {
          companySignature = (styleGuide.signature || "").trim();
          // Filter stage rules to those matching the deal's current stage when
          // possible; otherwise include all so the model still has guidance.
          let stageRulesArr: Array<{ stage?: string; rule?: string }> = [];
          if (Array.isArray(styleGuide.stage_rules)) {
            stageRulesArr = (styleGuide.stage_rules as any[]).filter(
              (r) => r && typeof r === "object",
            );
          }

          const lines: string[] = [];
          if (styleGuide.greeting?.trim()) {
            lines.push(`- Greeting: open with "${styleGuide.greeting.trim()}" (substitute the recipient's first name where bracketed).`);
          }
          if (styleGuide.closing?.trim()) {
            lines.push(`- Closing: end with "${styleGuide.closing.trim()}" before the signature.`);
          }
          if (styleGuide.tone_guidelines?.trim()) {
            lines.push(`- Tone: ${styleGuide.tone_guidelines.trim()}`);
          }
          if (stageRulesArr.length > 0) {
            const ruleLines = stageRulesArr
              .map((r) => {
                const stage = (r.stage || "").trim();
                const rule = (r.rule || "").trim();
                if (!stage && !rule) return "";
                if (!stage) return `  • ${rule}`;
                return `  • [${stage}] ${rule}`;
              })
              .filter(Boolean)
              .join("\n");
            if (ruleLines) {
              lines.push(`- Deal-stage rules (apply when the deal is in the matching stage):\n${ruleLines}`);
            }
          }
          if (styleGuide.custom_instructions?.trim()) {
            lines.push(`- Additional instructions: ${styleGuide.custom_instructions.trim()}`);
          }

          if (lines.length > 0) {
            styleGuideBlock = `\nCOMPANY EMAIL STYLE GUIDE (must be followed; overrides defaults on conflict):\n${lines.join("\n")}\n`;
          }
        }
      }
    } catch (e) {
      console.warn("[smart-email-ai] Failed to load company email style guide:", e);
    }

    // ─── Load per-contact cadence profile (Learn My Cadence) ────
    // The cadence profile is computed by the on-demand `learn-email-cadence`
    // edge function from the user's own email_cache. We feed it into the
    // draft prompt so generated replies match the user's historical tone
    // and pacing for this specific contact. The card in the AI panel uses
    // the same data to surface the "you typically follow up every N days"
    // nudge — keeping the two surfaces in sync.
    let cadenceBlock = "";
    try {
      const latestForCadence =
        emailData ||
        (threadData && (threadData.latestEmail || threadData.emails?.[0])) ||
        null;
      const cadenceContact = (latestForCadence?.from_email || "").toLowerCase();
      if (cadenceContact) {
        const { data: cadence } = await supabase
          .from("email_cadence_profiles")
          .select(
            "contact_email, contact_name, avg_followup_interval_days, median_followup_interval_days, avg_response_time_hours, last_outbound_at, outbound_count, tone, relationship_type",
          )
          .eq("user_id", user.id)
          .eq("contact_email", cadenceContact)
          .maybeSingle();
        if (cadence && cadence.outbound_count >= 3) {
          const lines: string[] = [];
          const c = cadence as any;
          if (c.avg_followup_interval_days != null) {
            lines.push(`- You typically follow up with this contact every ${Number(c.avg_followup_interval_days).toFixed(1)} days.`);
          }
          if (c.avg_response_time_hours != null) {
            lines.push(`- Your typical response time to them: ${Number(c.avg_response_time_hours).toFixed(1)} hours.`);
          }
          const tone = (c.tone || {}) as any;
          if (tone.formality) lines.push(`- Tone you usually use with them: ${tone.formality}.`);
          if (tone.common_greeting) lines.push(`- Greeting you most often open with: "${tone.common_greeting}".`);
          if (tone.avg_length_words) lines.push(`- Your typical message length to them: ~${tone.avg_length_words} words.`);
          if (c.relationship_type) lines.push(`- Relationship type: ${c.relationship_type}.`);
          if (c.last_outbound_at) {
            const days = (Date.now() - new Date(c.last_outbound_at).getTime()) / 86400000;
            lines.push(`- Days since your last outbound to them: ${days.toFixed(1)}.`);
          }
          if (lines.length > 0) {
            cadenceBlock = `\nCONTACT CADENCE (learned from your past emails — match this rhythm and tone, do NOT call attention to it):\n${lines.join("\n")}\n`;
          }
        }
      }
    } catch (e) {
      console.warn("[smart-email-ai] Failed to load cadence profile:", e);
    }

    let systemPrompt = "";
    let userPrompt = "";

    // ─── Route by action ────────────────────────────────────────
    switch (action) {
      case "generate_draft_options": {
        // Determine draft type
        const effectiveDraftType = draftType || "reply";
        // Speed: cap thread context at the last 4 messages and strip quoted history.
        const stripQuoted = (s: string | undefined | null): string => {
          if (!s) return "";
          // Cut off at common quoted-reply markers.
          const cutMarkers = [
            /\n>+\s/,                           // > quoted lines
            /\nOn .+ wrote:/i,                  // "On ... wrote:"
            /\n-{2,}\s*Original Message\s*-{2,}/i,
            /\nFrom: .+\nSent: /i,
            /\n_{5,}/,                          // "_____" separator
          ];
          let cut = s.length;
          for (const re of cutMarkers) {
            const m = s.match(re);
            if (m && m.index !== undefined && m.index < cut) cut = m.index;
          }
          return s.slice(0, cut).trim().slice(0, 1500);
        };
        const threadEmails = (threadData?.emails || []).slice(0, 4).map((e: any) => ({
          ...e,
          body_preview: stripQuoted(e.body_preview),
        }));
        const latestEmail = threadEmails[0];
        // "Detailed" tone has been removed. We now support either:
        //   - 2 options ("Concise" + "Balanced"), the default for the AI Assist sidebar
        //   - 1 option (when `singleTone` is "concise" | "balanced") for fast/lazy generation
        const tone: "concise" | "balanced" | null =
          singleTone === "concise" || singleTone === "balanced" ? singleTone : null;
        const wantSingle = !!tone;

        // Detect scheduling intent
        const fullBody = threadEmails.map((e: any) => e.body_preview || "").join(" ").toLowerCase();
        const hasSchedulingIntent = /\b(schedule|availability|calendar|meeting|call|slot|free|available|reschedule|time works|when can)\b/i.test(fullBody);

        // ─── Build the hard injection block ───────────────────────
        // This is the part that prevents generic "I'll send the diligence list"
        // phrasing. The model is told EXACTLY which strings must appear in the
        // body, with per-style minimums. Missing facts are explicitly listed
        // as "OMIT" so the model never invents them.
        const fmtList = (arr: string[]) =>
          arr.length === 0 ? "(none — OMIT this clause)" : arr.map((s) => `"${s}"`).join(", ");
        const lenderClause = injectionFacts.lender_name
          ? `MUST name the active lender by exact name "${injectionFacts.lender_name}" INLINE in the email BODY prose at least once (NOT only in the subject line). Use a natural construction that ties the lender to the stage or recent activity, e.g. "${injectionFacts.lender_name} is now in ${injectionFacts.lender_stage || "due diligence"} on this", "now that ${injectionFacts.lender_name} has signed the term sheet", "happy to coordinate with ${injectionFacts.lender_name} on the diligence items", or "${injectionFacts.lender_name}'s outstanding items are…". Pick whichever fits the thread context. Do NOT force it awkwardly, but it MUST appear in the body text.${injectionFacts.lender_stage ? ` (Lender stage: ${injectionFacts.lender_stage}.)` : ""}`
          : `(no active lender on this deal — OMIT any lender name; do NOT invent one)`;
        const stageClause = injectionFacts.deal_stage
          ? `MUST reference the deal's current stage in natural language: "${injectionFacts.deal_stage}" (e.g., "now that we're in ${injectionFacts.deal_stage}", "post-${injectionFacts.deal_stage}").`
          : `(stage unknown — OMIT stage references)`;
        const itemsClause = injectionFacts.open_items.length > 0
          ? `MUST list 1–3 of these ACTUAL outstanding-item names verbatim (or lightly paraphrased, but names preserved): ${fmtList(injectionFacts.open_items)}. NEVER replace these with generic phrases like "the diligence checklist" or "the additional due diligence list".`
          : `(no open outstanding items — OMIT any references to specific diligence items; if the recipient asked about diligence, say a tracker will follow but do NOT fabricate item names)`;
        const recentClause = injectionFacts.recent_activity
          ? `MUST weave in this concrete recent-activity detail (paraphrase naturally, do not quote): "${injectionFacts.recent_activity}".`
          : injectionFacts.analyst_note
          ? `MUST weave in this analyst-note detail (paraphrase naturally, do not quote): "${injectionFacts.analyst_note}".`
          : `(no recent activity or analyst note — OMIT)`;
        const termsClause = injectionFacts.key_terms.length > 0
          ? `When the thread touches diligence, closing, structure, or timing, reference 1 of these key terms: ${fmtList(injectionFacts.key_terms)}.`
          : `(no key terms available — OMIT)`;

        const injectionBlock = `\nHARD INJECTION REQUIREMENTS (apply to EVERY draft option you return — Concise AND Balanced):
1. LENDER: ${lenderClause}
2. STAGE: ${stageClause}
3. OUTSTANDING ITEMS: ${itemsClause}
4. RECENT ACTIVITY / NOTES: ${recentClause}
5. KEY TERMS: ${termsClause}

PER-STYLE MINIMUMS (these are non-negotiable and MUST be re-applied on every regenerate):
- "Concise" (2–3 short sentences, ≤80 words): MUST include at minimum requirements #1 (lender, if available — name the lender EXACTLY ONCE inline in the body prose), #2 (stage, if available), and #3 (at least 1 specific outstanding item, if available). If a field is unavailable, drop that requirement gracefully — never substitute a generic phrase.
- "Balanced" (4–6 sentences, ≤150 words): MUST include all of #1–#5 that are available. Name the lender EXACTLY ONCE inline in the body prose, ideally in the same clause that references the stage or the recent activity (e.g. "now that ${injectionFacts.lender_name || "the lender"} has [recent activity]…" or "${injectionFacts.lender_name || "the lender"} is now in ${injectionFacts.deal_stage || injectionFacts.lender_stage || "this stage"}…"). List 1–3 specific outstanding items inline by name. Acknowledge the current stage. Weave in the recent-activity detail. Reference 1 key term where relevant.

ANTI-GENERIC GUARDRAIL:
- The phrases "the additional due diligence list", "the diligence checklist", "the outstanding items", "the lender list", "next steps" used as standalone references are BANNED whenever the corresponding INJECTION REQUIREMENT has data. Always name the actual items / lenders / stage.
- If a required field is genuinely empty (marked OMIT above), gracefully drop the clause — do NOT hallucinate.

TRACKING:
- In your JSON response, populate "deal_context_used" with the keys you actually injected, drawn from this set: ["lender_name", "lender_stage", "outstanding_items", "deal_stage", "recent_activity", "analyst_note", "key_terms"]. Only include a key if you actually used it in the body text.
`;

        const optionsBlock = wantSingle
          ? `  "option_1_body": "string — ONLY the email body text the user will send. No subject. No greeting like 'Subject:'. No labels. No meta-commentary about the draft (do NOT say things like 'this draft acknowledges…', 'polished and professional', 'warm tone'). NEVER include any disclaimer about the AI, the deal data source, or phrases like 'Generated using …', 'based on Deal Space', 'using deal data', or '[Deal Name] data' — that label is rendered separately in the UI, never in the email body. Just the email body, ready to paste into the reply composer.",
  "option_1_tone_label": "${tone === "concise" ? "Concise" : "Balanced"}",
  "recommended_option": 1,`
          : `  "option_1_body": "string — ONLY the email body text the user will send. No subject. No labels. No meta-commentary about the draft. NEVER include 'Generated using …' or any deal-data-source disclaimer in the body. Just the email body.",
  "option_1_tone_label": "Concise",
  "option_2_body": "string — ONLY the email body text the user will send. No subject. No labels. No meta-commentary about the draft. NEVER include 'Generated using …' or any deal-data-source disclaimer in the body. Just the email body.",
  "option_2_tone_label": "Balanced",
  "recommended_option": 2,`;

        const generationRule = wantSingle
          ? (tone === "concise"
            ? `- Generate exactly 1 "Concise" draft option: shorter, direct, gets to the point in 2-4 sentences. Still warm and natural. Under 100 words.`
            : `- Generate exactly 1 "Balanced" draft option: the strongest standard reply, 4-7 sentences. Friendly, polished, and sendable. Under 150 words.`)
          : `- Generate exactly 2 draft options:
   • Option 1 — "Concise": shorter, direct, gets to the point in 2-4 sentences. Still warm and natural. Under 100 words.
   • Option 2 — "Balanced": the strongest standard reply, 4-7 sentences. Friendly, polished, and sendable. Under 150 words.
- Both must convey the SAME intent and substance — they differ only in length, structure, and level of detail.
- Both must sound like the same sender and follow the TONE & STYLE rules below.`;

        systemPrompt = `You are drafting emails on behalf of the user — a debt advisory and capital markets professional. Your voice is warm, human, and conversational while still polished and appropriate for lenders, borrowers, investors, and other professional counterparties. Think "smart colleague firing off a quick deal email," not "corporate memo."
${styleGuideBlock}
${cadenceBlock}

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

SPECIFICITY RULES (this is what makes the draft sound like the sender knows the deal):
- Reference concrete deal facts by name whenever they're relevant to the thread. Do NOT default to generic phrasing when specific data is available.
  • If asked about diligence/info requests: name 2–4 actual items from OUTSTANDING ITEMS (paraphrase naturally, do not just dump the list). Example: "I'll send the updated AR aging, the signed customer contracts, and the Q3 cohort retention file" — never "I'll send over the diligence list."
  • If asked about lender progress: name the specific lender(s) from LENDERS ON DEAL and their actual stage/substage. Example: "Decathlon is in the Management Call Completed substage and Eastward issued draft terms last week" — never "we have lenders engaged."
  • If asked about timing or status: cite the deal's actual stage, closing date if set, and the most recent status note verbatim where it adds signal.
  • If the analyst/manager NOTES contain relevant context (objections, blockers, prior commitments, sponsor preferences), weave that intelligence in naturally — do not quote it directly.
  • If RECENT ACTIVITY shows a recent stage change, lender movement, or completed milestone that's relevant to the recipient's question, mention it.
- Be specific about quantities, names, and dates when they're in the context. Use the company name, lender names, item descriptions, and figures from the structured data.
- If a relevant data point is genuinely missing, say "I'll confirm and revert" — do NOT invent it. But first check OUTSTANDING ITEMS, LENDERS, NOTES, and ACTIVITY before claiming you don't have it.
- Never just describe a category ("the diligence checklist", "the lender list", "next steps"). Always name the actual items, lenders, or actions when the structured context provides them.

FINANCIAL-QUESTION RULES (when the recipient asks about money — deal size, ARR, MRR, revenue, EBITDA, margins, run-rate, growth):
- Cite numbers ONLY from the DEAL SPACE FINANCIALS block (deal size / capital ask, ARR, MRR, TTM revenue, EBITDA). Never invent or estimate.
- For each financial figure the recipient asks about: if it IS in the block, cite it verbatim using the display value. If it is NOT in the block, write "not on file" (or "not currently on file" / "I don't have that on file yet — will confirm and revert") for that specific metric. Do NOT silently skip a directly-asked metric, and do NOT use "$X" / "[amount]" placeholders.
- Do not fabricate deal-specific references (stage names, outstanding items, lender names, status notes) that are absent from the structured context. Omit or use "not on file" instead.

CONFIRMING-DETAILS RULE (use when the deal context is thin or specific facts you'd normally cite are missing):
- If you cannot find a concrete fact you would otherwise reference (e.g., the recipient asks about a number, date, lender stage, outstanding item, or counterparty detail and the structured context does NOT contain it), include exactly ONE short "Confirming details" line near the end of the body — before the closing — written naturally, e.g.:
  • "Confirming details on the latest [topic] and will revert shortly."
  • "Just confirming a couple of items internally before I send the full picture."
- Use this line INSTEAD OF inventing or vaguely paraphrasing a fact. It signals to the recipient that the answer is being verified rather than fabricated.
- Trigger conditions (any of):
  • OUTSTANDING ITEMS, LENDERS ON DEAL, NOTES, RECENT ACTIVITY, or DEAL STATE SNAPSHOT is empty / not provided.
  • The recipient asks for a specific figure, date, term, or status that is not present in the structured context.
  • The detected intent requires data the deal record does not yet contain.
- Keep it to ONE line, lowercase casual register, no bullet points, no apology. Do NOT add it when you already have enough specifics to answer fully — over-using it makes drafts feel evasive.
- Also reflect this in the JSON: when you include the line, set "requires_more_context": true and list the missing fields in "missing_context_items".

${generationRule}
- Do NOT include any sign-off or signature block (no "Best,", "Thanks,", name, title, phone, etc.) — the app appends the user's configured signature automatically.
- End the body with the final sentence of content only. No closing line. No name.
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
  "deal_context_used": ["string array of injected deal-fact keys actually used in the body, e.g. lender_name, outstanding_items, deal_stage, recent_activity, key_terms"],
${optionsBlock}
  "recommended_option_reason": "string",
  "suggested_follow_up_actions": ["string array"],
  "cited_context_sources": ["string array of data sources used"]
}`;
        // Append the hard injection block AFTER the schema so the model sees
        // the requirements as the final, most-recent instruction.
        systemPrompt += injectionBlock;

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

Generate ${wantSingle ? 1 : 2} draft ${effectiveDraftType} option${wantSingle ? "" : "s"} based on the above context. Return strict JSON only.`;
        break;
      }

      case "draft_reply": {
        systemPrompt = `You are an expert debt advisory professional at a capital advisory firm. Draft a professional reply email based on the deal context and conversation. Be concise, professional, and action-oriented. Output ONLY the email body text (no subject, no "From:", etc.).`;
        if (styleGuideBlock) systemPrompt += `\n${styleGuideBlock}`;
        if (cadenceBlock) systemPrompt += `\n${cadenceBlock}`;
        {
          const sig = userSignature || companySignature;
          if (sig) systemPrompt += `\nAlways end the email body with this exact signature on its own lines (do NOT modify it, do NOT add any other closing line before it):\n${sig}`;
          else systemPrompt += `\nDo NOT include any signature or sign-off — the app appends the user's signature automatically.`;
        }
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
        if (styleGuideBlock) systemPrompt += `\n${styleGuideBlock}`;
        if (cadenceBlock) systemPrompt += `\n${cadenceBlock}`;
        {
          const sig = userSignature || companySignature;
          if (sig) systemPrompt += `\nAlways end the email body with this exact signature on its own lines (do NOT modify it, do NOT add any other closing line before it):\n${sig}`;
          else systemPrompt += `\nDo NOT include any signature or sign-off — the app appends the user's signature automatically.`;
        }
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
        systemPrompt = `You are a deal analyst. Summarize an email thread for a busy debt advisory professional.

Return ONLY a JSON object with this exact shape:
{
  "summary": "2-3 sentence plain-language summary of the full thread — what was discussed, what was agreed, and what is still pending. No bullets, no markdown.",
  "key_decisions": ["short, specific decisions explicitly made or agreed to in the thread"],
  "open_items": ["specific things mentioned in the thread that have NOT been resolved yet — questions awaiting answers, requested documents not provided, action items without confirmation"]
}

Rules:
- "summary" must be 2-3 sentences, written in plain English.
- "key_decisions" should ONLY include decisions explicitly made (e.g., "Agreed to share the term sheet by Friday"). If none, return [].
- "open_items" should ONLY include things still unresolved at the end of the thread. If everything is resolved, return [].
- Be concise; each list item should be one short sentence.
- Do not invent facts not present in the thread.`;
        userPrompt = `${dealContext}

EMAIL THREAD: "${threadData?.subject}"
${threadData?.emails?.map((e: any) => `From: ${e.from_name} <${e.from_email}>
Date: ${e.received_at}
---
${e.body_preview}
---`).join("\n\n")}

Return the JSON object now.`;
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
        let lenderCandidates: Array<{ id: string; name: string; stage?: string; tracking_status?: string }> = [];
        // When a deal is already linked, fetch its name so the model treats
        // the linked deal as authoritative instead of speculating against
        // candidate ids it doesn't have.
        let linkedDealName: string = "";
        if (dealId) {
          const { data: ls } = await supabase
            .from("deal_lenders")
            .select("id, name, stage, tracking_status")
            .eq("deal_id", dealId);
          lenderCandidates = (ls || []).map((l: any) => ({
            id: l.id,
            name: l.name,
            stage: l.stage,
            tracking_status: l.tracking_status,
          }));
          try {
            const { data: dRow } = await supabase
              .from("deals")
              .select("company")
              .eq("id", dealId)
              .maybeSingle();
            linkedDealName = (dRow as any)?.company || "";
          } catch { /* non-fatal */ }
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
            .select("id, company, stage, status")
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
            let score = 0;
            for (const candidate of [company]) {
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
            company: d.company || "",
            stage: d.stage,
          }));
        }

        // Master lender candidates — surfaced so Claude can identify the
        // lender FIRM even when it has not yet been added to the deal.
        // The client confirm flow uses master_lender_id to auto-link the
        // lender via ensureLenderOnDeal(). Tenant-scoped, capped at 400.
        let masterLenderCandidates: Array<{ id: string; name: string; tier?: string }> = [];
        try {
          const { data: mems2 } = await supabase
            .from("company_members")
            .select("company_id")
            .eq("user_id", user.id);
          const cids2 = (mems2 || []).map((m: any) => m.company_id).filter(Boolean);
          if (cids2.length > 0) {
            const { data: mls } = await supabase
              .from("master_lenders")
              .select("id, name, tier")
              .in("company_id", cids2)
              .order("updated_at", { ascending: false })
              .limit(400);
            masterLenderCandidates = (mls || []).map((l: any) => ({ id: l.id, name: l.name, tier: l.tier }));
          }
        } catch { /* non-fatal */ }

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
    "title": "string — confirm-first prompt that ALWAYS follows the format: 'Update <Lender Name> status on <Deal Name>'. Do NOT include the new status value, a verb other than 'Update', or a question mark — the UI shows the pre-selected status next to the prompt. Example: 'Update TriplePoint Capital status on Arbolus' or 'Update Prospeq status on Upflex'.",
    "deal_id": "string — id of the deal this update targets (use linked dealId if present, else likely_deal.id)",
    "deal_name": "string",
    "lender_id": "string — id of the lender candidate this targets, or empty",
    "master_lender_id": "string — id from MASTER LENDER CANDIDATES if matched (used to auto-link lender to deal when lender_id is empty), or empty",
    "lender_name": "string — firm name, or empty",
    "new_stage": "passed|not_a_fit|interested|in_diligence|follow_up|declined|terms_issued|info_requested|engaged|other|empty string",
    "suggested_detail": "string — REQUIRED when new_stage is passed or not_a_fit. One of: deal_size_mismatch | industry_exclusion | geographic_restriction | risk_profile_concerns | timing_issues | relationship_issues | terms_mismatch | other. Empty for other statuses.",
    "suggested_detail_confidence": "low|medium|high",
    "reason_note": "string — short rationale to save with the update (max ~200 chars)",
    "confidence": "low|medium|high",
    "ambiguity_flags": ["string — e.g. 'lender_not_matched', 'regional_nuance', 'forwarded_internally', 'multiple_deals_possible'"]
  },
  "secondary_action": {
    "kind": "draft_reply|log_activity|none",
    "title": "string — short prompt, e.g. 'Log lender feedback to Arbolus activity'",
    "details": "string — empty if none"
  },
  "suggested_tasks": [
    {
      "title": "string — concrete task name pre-filled from the email context, action-verb led. Include the counterparty and deal where natural. Example: 'Send due diligence list to Steven Adler @ Prospeq'.",
      "why": "string — ONE short sentence explaining which sentence in the email triggered this task suggestion. Keep under 120 chars.",
      "description": "string — OPTIONAL richer task body. REQUIRED for task_type='call' when triggered by a call-commitment: include a short context line (e.g. 'Call Eric re: Czerlonka & 5th Line deal. He confirmed availability most of today.') followed by extracted contact details on separate lines, prefixed with 'Cell:', 'Office:', and 'Email:' as available. Empty string when none.",
      "task_type": "follow_up|call|email|review|send_doc|meeting|general",
      "due_date_hint": "string — either an ISO date 'YYYY-MM-DD' if the email explicitly states a date (e.g. 'by Friday', 'before Nov 14'), or the literal token 'next_business_day' when no date is stated.",
      "assignee_hint": "string — 'deal_manager' when the next action is on our side, or the verbatim person name from the email when the email assigns it to a specific teammate. Default to 'deal_manager'.",
      "priority": "low|normal|high|urgent",
      "confidence": "low|medium|high"
    }
  ]
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

SUGGESTED STATUS MAPPING (recommended_update.new_stage):
- This is a DRAFT recommendation only. The user will review and may override before saving.
- "passed" — lender declined for general/strategic reasons.
- "not_a_fit" — lender explicitly cited mismatch with mandate, sector, size, structure, or strategy ("outside our box", "not in our wheelhouse"). Do NOT collapse this into "passed" — they are distinct.
- "interested" — clear positive signal, wants to keep engaging.
- "in_diligence" — actively reviewing materials / asking diligence questions.
- "follow_up" — needs another touch to advance (info request, scheduling).
- "declined" — formal decline language without mandate-fit reasoning.
- Use the most specific status that is supported by the email language. Never silently collapse "passed" and "not_a_fit" — they stay distinct.

SUGGESTED DETAIL TAXONOMY (recommended_update.suggested_detail) — SHARED with the lenders-page disqualification modal. Use these EXACT keys when new_stage is "passed" or "not_a_fit":
- deal_size_mismatch — too big / too small for the lender's check size
- industry_exclusion — sector or vertical is on the lender's avoid list (e.g. "we don't do event spaces", cannabis, adult, etc.)
- geographic_restriction — outside the lender's allowed states/countries
- risk_profile_concerns — credit, leverage, burn, profitability, customer concentration concerns
- timing_issues — wrong moment (recently funded a similar deal, capacity full, year-end pause)
- relationship_issues — prior relationship friction or conflict
- terms_mismatch — pricing/structure/term length the lender will not match
- other — none of the above clearly applies
Pick the SINGLE best key based on the verbatim language in the email. Set suggested_detail_confidence to "high" only when the email explicitly cites the reason. Leave suggested_detail empty for any new_stage other than passed/not_a_fit.

DEAL MATCHING:
- Use subject line, signature, prior thread content, sender email, and candidate list.
- If a deal is already linked (dealId in context), use that and set high confidence.
- Otherwise, score by exact company name match in subject or thread body, then by sender domain matching a candidate's known contact.
- If no candidate is a clear match, set likely_deal.id="" and confidence="low".

LENDER FIRM MATCHING:
- Prefer exact match against LENDER CANDIDATES ON LINKED DEAL.
- If the firm is NOT in LENDER CANDIDATES ON LINKED DEAL but IS in MASTER LENDER CANDIDATES, set lender_id="" AND populate master_lender_id with the matching id so the client can auto-link the lender to the deal.
- Otherwise infer firm from sender email signature, domain (drop generic gmail/outlook), or footer text and leave both lender_id and master_lender_id empty.

QUOTE EXTRACTION:
- supporting_quote MUST be a verbatim sentence from the email body. Never paraphrase. If unsure, use the most decisive sentence.

CONFIDENCE:
- high = unambiguous matches and clear signal language.
- medium = strong inference but some ambiguity (e.g., regional nuance).
- low = weak inference; requires user to confirm associations first.

If the email is internal commentary only (kind="internal_note"), recommended_update should be {"kind":"none"}.

SUGGESTED TASKS:
- Detect clear next-action language in the inbound email. Trigger phrases include (non-exhaustive):
  • "send the due diligence list" / "please send over" / "can you send" / "share the model" / "get me the cap table"
  • "follow up with a term sheet" / "circle back next week" / "follow up on …"
  • "schedule a call" / "let's set up a call" / "let's get on a call" / "set up time"
  • "confirm the wire" / "confirm the …" / "approve the …"
  Treat polite/ask variants ("please …", "can you …", "could you …", "would you …", "let's …") as equivalent to the imperative form.
- CALL COMMITMENT DETECTION (HIGH PRIORITY — do not miss these):
  • If our side asked a call-availability question ("good to call you this afternoon?", "can I give you a ring?", "ok if I call?", "free for a quick call?", "jump on the phone?") AND the counterparty replied affirmatively in any form ("yup", "yes", "sure", "sounds good", "works for me", "ok", "should be around", "available", "free all day", "I'm around"), that IS a confirmed call commitment — emit a suggested_task with task_type="call".
  • Time references in either side ("today", "this afternoon", "this morning", "tonight", "tomorrow", "later today", "around X pm", "most of the day", "all day") set the timeframe. Map to:
      - "today / this morning / this afternoon / tonight / most of the day / all day" → due_date_hint = today's ISO date
      - "tomorrow" → tomorrow's ISO date
      - explicit weekday or date → that ISO date
      - otherwise → "next_business_day"
  • Title MUST be: "Call <FirstName LastName> <timeframe>" (e.g. "Call Eric Lousararian today", "Call Steven Adler this afternoon"). Use the counterparty's full name from their signature or From header — never "the lender" or "them".
  • Description MUST include: (a) brief call context referencing the deal, (b) any contact details extracted from the counterparty's signature on a new line each, prefixed:
      - "Cell: <number>"
      - "Office: <number with extension if present>"
      - "Email: <email>"
    Extract these verbatim from the email signature block — look for labels like "Cell", "Mobile", "M:", "Office", "O:", "Direct", "Tel", "Phone", "Email", or bare phone-number patterns ((xxx) xxx-xxxx, xxx-xxx-xxxx, xxx.xxx.xxxx, +1 xxx…). Include extensions ("x 114", "ext 114"). Skip if not present.
  • priority = "high" when timeframe is today/this morning/this afternoon/tonight; otherwise "normal".
  • confidence = "high" when both the ask and the affirmative reply are present in the thread.
- Each detected next action becomes ONE entry in suggested_tasks. Up to 3 tasks max. Return [] when there is no clear next action.
- Title MUST be a concrete, action-verb-led sentence pre-filled from the email context. Include the counterparty name and the deal name when they are known. Examples:
  • "Send due diligence list to Steven Adler @ Prospeq"
  • "Schedule intro call with Kayne Anderson on Upflex"
  • "Confirm wire instructions with Brookfield"
- Default assignee_hint to "deal_manager" unless the email explicitly addresses or names a specific teammate (e.g. "James, can you send the model?" → assignee_hint: "James").
- Default due_date_hint to "next_business_day". Only return an ISO date when the email explicitly states one ("by Friday Nov 14" → "2025-11-14"). Never invent dates.
- Keep "why" to ONE sentence quoting the trigger phrase from the email when possible.`;

        userPrompt = `${dealContext}

LENDER CANDIDATES ON LINKED DEAL (authoritative — these are the lenders already on this specific deal; ALWAYS prefer matching against this list before MASTER LENDER CANDIDATES):
${lenderCandidates.length > 0 ? lenderCandidates.map(l => `- id=${l.id} name="${l.name}" stage=${l.stage || "?"} tracking=${l.tracking_status || "?"}`).join("\n") : "(none — deal not linked or has no lenders)"}

MASTER LENDER CANDIDATES (firm-level directory — use these when the firm is not yet on this deal so the client can auto-link):
${masterLenderCandidates.length > 0 ? masterLenderCandidates.slice(0, 200).map(l => `- id=${l.id} name="${l.name}"${l.tier ? ` tier=${l.tier}` : ""}`).join("\n") : "(none)"}

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

    // Model selection — for generate_draft_options, prefer the faster/cheaper
    // gemini-2.5-flash-lite when the client requests `fastModel: true` (default
    // for the AI Assist sidebar's initial open). Heavier model is reserved for
    // explicit "Regenerate" actions.
    const selectedModel = action === "generate_draft_options"
      ? (fastModel === false ? "google/gemini-2.5-flash" : "google/gemini-2.5-flash-lite")
      : action === "analyze_thread_workflow"
        ? "google/gemini-2.5-flash"
        : "google/gemini-3-flash-preview";

    // Cap output tokens for draft options so the model can't run away.
    const maxTokensForAction =
      action === "generate_draft_options" ? (singleTone ? 600 : 1100) : undefined;

    const t0 = Date.now();
    console.log(`[smart-email-ai] action=${action} model=${selectedModel} singleTone=${singleTone || "none"} threadEmails=${threadData?.emails?.length || 0}`);
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: (action === "draft_reply" || action === "auto_draft" || action === "generate_draft_options") ? 0.7 : 0.3,
        ...(maxTokensForAction ? { max_tokens: maxTokensForAction } : {}),
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
    const latencyMs = Date.now() - t0;
    console.log(`[smart-email-ai] action=${action} model=${selectedModel} latency=${latencyMs}ms input_tokens=${aiResult.usage?.prompt_tokens || 0} output_tokens=${aiResult.usage?.completion_tokens || 0}`);

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
      // Surface the actually-injected fact keys (model-reported) so the UI's
      // "Context used: N sources" pill counts real enrichment — not just which
      // tables we fetched. Fall back to the structural sources list.
      const modelInjected: string[] = Array.isArray(parsed.deal_context_used)
        ? parsed.deal_context_used.filter((s: any) => typeof s === "string" && s.length > 0)
        : [];
      // Union: structural sources we loaded + injected fact keys the model used.
      const merged = Array.from(new Set([
        ...(dealContextSources.length > 0 ? dealContextSources : []),
        ...modelInjected,
      ]));
      parsed.cited_context_sources = merged.length > 0 ? merged : ["email_thread_only"];
      // Also expose the explicit injected-fields array for any UI that wants it.
      parsed.deal_context_used = modelInjected;

      // If we actually injected the live Deal Space snapshot or financials,
      // force used_deal_context=true so the UI's "Generated using <Deal Name>
      // deal data" label is reliably shown — don't depend on the model's
      // self-report which can be inconsistent.
      if (
        dealContextSources.includes("deal_state_snapshot") ||
        dealContextSources.includes("deal_space_financials") ||
        dealContextSources.includes("deal_metadata")
      ) {
        parsed.used_deal_context = true;
      }

      // ─── Append the user's configured signature to each draft body ───
      // The model is instructed not to add any sign-off; we append the user's
      // Settings → Email signature (or, as fallback, the company style-guide
      // signature, then a sender-name fallback) so drafts always end with the
      // user's actual signature instead of a generic "Best, <name>".
      try {
        const senderName =
          (profile?.display_name as string | undefined)?.trim() ||
          `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() ||
          "";
        const fallbackSig = senderName ? `Best,\n${senderName}` : "";
        const sigToAppend = (userSignature || companySignature || fallbackSig).trim();
        if (sigToAppend) {
          const appendSig = (body: unknown): string => {
            if (typeof body !== "string") return body as any;
            let trimmed = body.replace(/[\s\n]+$/g, "");
            // If the model already ended with this exact signature, leave it.
            if (trimmed.endsWith(sigToAppend)) return trimmed;
            return `${trimmed}\n\n${sigToAppend}`;
          };
          if (parsed.option_1_body) parsed.option_1_body = appendSig(parsed.option_1_body);
          if (parsed.option_2_body) parsed.option_2_body = appendSig(parsed.option_2_body);
        }
      } catch (sigErr) {
        console.warn("[smart-email-ai] signature append skipped:", sigErr);
      }
    }

    // For analyze_thread_workflow, post-process to ensure deal_id resolution.
    // If Claude returned a deal name but no id (or vice versa), reconcile against
    // our candidate list so the UI always has a real deal to target.
    if (action === "analyze_thread_workflow" && typeof parsed === "object" && !parsed.raw) {
      try {
        const candidates = (typeof dealCandidates !== "undefined" ? dealCandidates : []) as any[];
        const ld = parsed.likely_deal || {};
        const norm = (s: string) => (s || "").toLowerCase().trim();

        // 1) If id missing but name present, find by name.
        if (!ld.id && ld.name) {
          const wanted = norm(ld.name);
          const match = candidates.find((c) => norm(c.company) === wanted)
            || candidates.find((c) => norm(c.company).includes(wanted) || wanted.includes(norm(c.company)));
          if (match) {
            ld.id = match.id;
            ld.name = match.company || ld.name;
            if (!ld.confidence || ld.confidence === "low") ld.confidence = "medium";
          }
        }
        // 2) If id present but name missing, fill name.
        if (ld.id && !ld.name) {
          const match = candidates.find((c) => c.id === ld.id);
          if (match) ld.name = match.company;
        }

        // 3) Propagate resolved deal into recommended_update so the UI can act.
        const rec = parsed.recommended_update || {};
        if (rec.kind && rec.kind !== "none") {
          if (!rec.deal_id && ld.id) rec.deal_id = ld.id;
          if (!rec.deal_name && ld.name) rec.deal_name = ld.name;
          // Rewrite the title if it still says "unknown" / placeholder
          if (ld.name && rec.title && /unknown|the deal/i.test(rec.title)) {
            rec.title = rec.title.replace(/unknown|the deal/gi, ld.name);
          }
        }
        parsed.likely_deal = ld;
        parsed.recommended_update = rec;
      } catch (resolveErr) {
        console.warn("workflow deal resolution skipped:", resolveErr);
      }
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
            model: selectedModel,
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
