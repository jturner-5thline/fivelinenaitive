import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const { meeting_ids, company_id, batch_size, all_unmatched } = body || {};

    if (!company_id) {
      return new Response(JSON.stringify({ error: "company_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get unmatched meetings to suggest for
    const limit = Math.min(Number(batch_size) || (all_unmatched ? 500 : 30), 500);
    let meetingQuery = supabase
      .from("claap_meetings")
      .select("id, title, organizer_email, started_at, duration_seconds, transcript, match_candidates, match_status, manually_locked, company_id")
      .eq("company_id", company_id)
      .eq("manually_locked", false);

    if (meeting_ids?.length) {
      meetingQuery = meetingQuery.in("id", meeting_ids);
    } else {
      meetingQuery = meetingQuery
        .in("match_status", ["unmatched", "needs_review"])
        .is("deal_id", null)
        .order("created_at", { ascending: false })
        .limit(limit);
    }

    const { data: meetings, error: meetErr } = await meetingQuery;
    if (meetErr) throw meetErr;
    if (!meetings?.length) {
      return new Response(JSON.stringify({ ok: true, processed: 0, suggestions: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get deals (broader: include archived too so historical calls match)
    const { data: deals } = await supabase
      .from("deals")
      .select("id, company, status, stage, user_id, updated_at")
      .eq("company_id", company_id)
      .order("updated_at", { ascending: false })
      .limit(1000);

    // Get CRM contacts (for domain/email matching)
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, full_name, email, primary_company_id, crm_company_id")
      .eq("org_company_id", company_id)
      .limit(5000);

    // Get CRM companies
    const { data: crmCompanies } = await supabase
      .from("companies")
      .select("id, name, primary_domain, domains")
      .limit(5000);

    // Get deal aliases
    const { data: aliases } = await supabase
      .from("deal_aliases")
      .select("deal_id, alias")
      .in("deal_id", deals.map((d: any) => d.id));

    const aliasMap: Record<string, string[]> = {};
    (aliases || []).forEach((a: any) => {
      if (!aliasMap[a.deal_id]) aliasMap[a.deal_id] = [];
      aliasMap[a.deal_id].push(a.alias.toLowerCase());
    });

    // Get participants for meetings
    const { data: participants } = await supabase
      .from("claap_meeting_participants")
      .select("meeting_id, email, name, domain, is_internal")
      .in("meeting_id", meetings.map((m: any) => m.id));

    const participantMap: Record<string, any[]> = {};
    (participants || []).forEach((p: any) => {
      if (!participantMap[p.meeting_id]) participantMap[p.meeting_id] = [];
      participantMap[p.meeting_id].push(p);
    });

    // Get deal lenders for matching
    const dealIds = (deals || []).map((d: any) => d.id);
    const { data: dealLenders } = dealIds.length ? await supabase
      .from("deal_lenders")
      .select("deal_id, name")
      .in("deal_id", dealIds) : { data: [] as any[] };

    const lenderMap: Record<string, any[]> = {};
    (dealLenders || []).forEach((l: any) => {
      if (!lenderMap[l.deal_id]) lenderMap[l.deal_id] = [];
      lenderMap[l.deal_id].push(l);
    });

    // Build flat lender directory across all deals (for cross-deal lender matching)
    const allLenderNames = new Set<string>();
    (dealLenders || []).forEach((l: any) => { if (l.name) allLenderNames.add(l.name); });

    // Get prior feedback for learning
    const { data: priorFeedback } = await supabase
      .from("claap_match_feedback")
      .select("action, suggested_deal_id, chosen_deal_id, signals")
      .eq("company_id", company_id)
      .order("created_at", { ascending: false })
      .limit(500);

    // Build learned patterns from feedback
    const learnedBoosts: Record<string, number> = {};
    const learnedPenalties: Record<string, number> = {};
    (priorFeedback || []).forEach((fb: any) => {
      if (fb.action === "confirmed" && fb.chosen_deal_id) {
        learnedBoosts[fb.chosen_deal_id] = (learnedBoosts[fb.chosen_deal_id] || 0) + 5;
      }
      if (fb.action === "dismissed" && fb.suggested_deal_id) {
        learnedPenalties[fb.suggested_deal_id] = (learnedPenalties[fb.suggested_deal_id] || 0) + 3;
      }
      if (fb.action === "reassigned" && fb.chosen_deal_id) {
        learnedBoosts[fb.chosen_deal_id] = (learnedBoosts[fb.chosen_deal_id] || 0) + 8;
      }
      if (fb.action === "reassigned" && fb.suggested_deal_id) {
        learnedPenalties[fb.suggested_deal_id] = (learnedPenalties[fb.suggested_deal_id] || 0) + 5;
      }
    });

    // ===== Helpers =====
    const COMMON_PREFIXES = [
      "fw:", "fwd:", "re:", "call with", "meeting with", "sync with",
      "intro:", "intro with", "catch up:", "catch up with", "catchup with",
      "discussion with", "chat with", "interview with", "kickoff:",
      "kickoff with", "follow up:", "follow up with", "followup with",
      "weekly", "monthly", "quarterly", "1:1", "1-1", "external",
    ];
    const STOPWORDS = new Set([
      "the","a","an","and","or","of","to","for","with","on","in","at","by",
      "call","meeting","sync","intro","catch","up","chat","discussion",
      "kickoff","followup","follow","review","weekly","monthly","quarterly",
      "external","internal","fw","fwd","re","draft","copy","new","old",
      "5thline","5th","line","naitive","financing","diligence","dd",
      "project","deal","company","lender","update","status","check","in",
      "vs","via","amp","et","is","this","that","these","those","be","do",
    ]);
    const INTERNAL_DOMAINS = new Set(["5thline.co", "naitive.co", "gmail.com", "outlook.com", "yahoo.com", "hotmail.com", "icloud.com"]);

    function normalizeTitle(s: string): string {
      let t = (s || "").toLowerCase().trim();
      // Strip leading prefixes repeatedly
      let changed = true;
      while (changed) {
        changed = false;
        for (const p of COMMON_PREFIXES) {
          if (t.startsWith(p)) { t = t.slice(p.length).trim(); changed = true; break; }
        }
      }
      // Strip "<deal> <> <something>" -> keep both sides
      t = t.replace(/[<>|·•\-—–:|]+/g, " ");
      t = t.replace(/\s+/g, " ").trim();
      return t;
    }
    function tokenize(s: string): string[] {
      return normalizeTitle(s)
        .split(/[^a-z0-9]+/)
        .filter(w => w && w.length >= 3 && !STOPWORDS.has(w));
    }
    function tokenOverlap(a: string, b: string): { overlap: number; tokens: string[] } {
      const A = new Set(tokenize(a));
      const B = new Set(tokenize(b));
      const matched: string[] = [];
      for (const t of A) if (B.has(t)) matched.push(t);
      return { overlap: matched.length, tokens: matched };
    }
    function diceCoefficient(a: string, b: string): number {
      if (!a || !b) return 0;
      const aBigrams = new Set<string>();
      for (let i = 0; i < a.length - 1; i++) aBigrams.add(a.substring(i, i + 2));
      const bBigrams = new Set<string>();
      for (let i = 0; i < b.length - 1; i++) bBigrams.add(b.substring(i, i + 2));
      let intersection = 0;
      for (const bg of aBigrams) if (bBigrams.has(bg)) intersection++;
      return aBigrams.size + bBigrams.size === 0 ? 0 : (2 * intersection) / (aBigrams.size + bBigrams.size);
    }

    // Build domain index for participants → CRM company / contact / lender
    const crmCompanyByDomain: Record<string, any> = {};
    (crmCompanies || []).forEach((c: any) => {
      const ds: string[] = [];
      if (c.primary_domain) ds.push(c.primary_domain);
      if (Array.isArray(c.domains)) ds.push(...c.domains);
      ds.forEach(d => {
        const k = String(d || "").toLowerCase().trim();
        if (k && !INTERNAL_DOMAINS.has(k)) crmCompanyByDomain[k] = c;
      });
    });
    const contactByEmail: Record<string, any> = {};
    const contactByDomain: Record<string, any[]> = {};
    (contacts || []).forEach((c: any) => {
      if (c.email) {
        const e = c.email.toLowerCase();
        contactByEmail[e] = c;
        const dom = e.split("@")[1];
        if (dom && !INTERNAL_DOMAINS.has(dom)) {
          (contactByDomain[dom] = contactByDomain[dom] || []).push(c);
        }
      }
    });

    // Map crm_company_id → deals (for cross-linking domain matches to deals)
    const dealsByCrmCompany: Record<string, any[]> = {};
    (deals || []).forEach((d: any) => {
      // We don't have crm_company_id on deal here, so skip; we still match by name
    });

    // Deterministic scoring for each meeting-deal pair
    function scoreDeal(meeting: any, deal: any, meetingParticipants: any[]): { score: number; reasons: string[] } {
      let score = 0;
      const reasons: string[] = [];
      const titleLower = (meeting.title || "").toLowerCase();
      const dealNameLower = (deal.company || "").toLowerCase();

      // Title matching: exact substring → strong; normalized substring → strong; token overlap → medium; dice → weak
      const cleanTitle = normalizeTitle(meeting.title || "");
      const cleanDeal = normalizeTitle(deal.company || "");
      if (dealNameLower.length > 2 && titleLower.includes(dealNameLower)) {
        score += 55;
        reasons.push(`Title contains "${deal.company}"`);
      } else if (cleanDeal.length > 2 && cleanTitle.includes(cleanDeal)) {
        score += 50;
        reasons.push(`Title contains "${deal.company}" (after stripping prefixes)`);
      } else {
        const { overlap, tokens } = tokenOverlap(meeting.title || "", deal.company || "");
        if (overlap >= 2) {
          score += 40 + Math.min(overlap * 5, 20);
          reasons.push(`Title shares words [${tokens.join(", ")}] with "${deal.company}"`);
        } else if (overlap === 1 && tokens[0].length >= 5) {
          score += 22;
          reasons.push(`Title shares "${tokens[0]}" with "${deal.company}"`);
        } else {
          const dice = diceCoefficient(cleanTitle, cleanDeal);
          if (dice >= 0.55) {
            score += Math.round(dice * 30);
            reasons.push(`Title similar to "${deal.company}" (${Math.round(dice * 100)}%)`);
          }
        }
      }

      // Alias matching (substring + token overlap)
      const dealAliases = aliasMap[deal.id] || [];
      for (const alias of dealAliases) {
        if (alias.length <= 2) continue;
        if (titleLower.includes(alias) || cleanTitle.includes(alias)) {
          score += 45;
          reasons.push(`Title matches deal alias "${alias}"`);
          break;
        }
        const { overlap, tokens } = tokenOverlap(meeting.title || "", alias);
        if (overlap >= 2) {
          score += 30;
          reasons.push(`Title shares words [${tokens.join(", ")}] with alias "${alias}"`);
          break;
        }
      }

      // Lender matching: any participant domain matches a lender on this deal (by name)
      const lenders = lenderMap[deal.id] || [];
      for (const participant of meetingParticipants) {
        if (participant.is_internal) continue;
        const pDomain = (participant.domain || "").toLowerCase();
        const pDomainCore = pDomain.replace(/\.(com|io|co|net|org|ai|us|uk)$/i, "").replace(/[^a-z0-9]/g, "");
        for (const lender of lenders) {
          if (!lender.name) continue;
          const lenderCore = lender.name.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (pDomainCore && lenderCore.length > 3 && (pDomainCore.includes(lenderCore) || lenderCore.includes(pDomainCore))) {
            score += 35;
            reasons.push(`Attendee domain @${pDomain} matches lender "${lender.name}"`);
          }
          // Token overlap with lender name in title
          const { overlap } = tokenOverlap(meeting.title || "", lender.name);
          if (overlap >= 2) {
            score += 20;
            reasons.push(`Title mentions lender "${lender.name}"`);
          }
        }
      }

      // Activity recency bonus
      if (deal.status === "active") {
        score += 5;
        reasons.push("Deal is active");
      }
      const daysSinceUpdate = (Date.now() - new Date(deal.updated_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceUpdate < 7) {
        score += 5;
        reasons.push("Deal recently updated");
      }

      // Learned boosts/penalties
      if (learnedBoosts[deal.id]) {
        const boost = Math.min(learnedBoosts[deal.id], 20);
        score += boost;
        reasons.push(`Boosted by prior user confirmations (+${boost})`);
      }
      if (learnedPenalties[deal.id]) {
        const penalty = Math.min(learnedPenalties[deal.id], 15);
        score -= penalty;
        reasons.push(`Reduced by prior dismissals (-${penalty})`);
      }

      // Exclude test deals unless explicitly boosted
      if (dealNameLower.includes("test") && !learnedBoosts[deal.id]) {
        score -= 20;
      }

      return { score: Math.max(0, Math.min(100, score)), reasons };
    }

    // Process each meeting
    let totalSuggestions = 0;

    for (const meeting of meetings) {
      const meetingParticipants = participantMap[meeting.id] || [];

      // Score all deals
      const scoredDeals = deals.map((deal: any) => {
        const { score, reasons } = scoreDeal(meeting, deal, meetingParticipants);
        return { deal_id: deal.id, deal_name: deal.company, score, reasons };
      }).filter((d: any) => d.score >= 10)
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, 5);

      // Use AI for additional ranking if we have LOVABLE_API_KEY and meaningful text
      let aiEnhancedDeals = scoredDeals;
      if (lovableApiKey && scoredDeals.length > 0 && (meeting.title || meeting.transcript)) {
        try {
          const contextText = [
            meeting.title ? `Meeting title: "${meeting.title}"` : "",
            meetingParticipants.length > 0
              ? `Participants: ${meetingParticipants.map((p: any) => `${p.name || ""} (${p.email || p.domain || "unknown"})`).join(", ")}`
              : "",
            meeting.transcript ? `Transcript excerpt: ${(meeting.transcript as string).substring(0, 800)}` : "",
          ].filter(Boolean).join("\n");

          const candidateList = scoredDeals.map((d: any, i: number) =>
            `${i + 1}. "${d.deal_name}" (current score: ${d.score}, reasons: ${d.reasons.join("; ")})`
          ).join("\n");

          const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${lovableApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash-lite",
              messages: [
                {
                  role: "system",
                  content: `You are a deal-matching assistant for a financial advisory CRM. Given a meeting/call context and candidate deals, rank the deals by likelihood this call is about that deal. Return a JSON array of objects with deal_index (1-based), confidence_adjustment (-20 to +20), and reason (short sentence). Only adjust if you have clear signal. Be conservative.`,
                },
                {
                  role: "user",
                  content: `Meeting context:\n${contextText}\n\nCandidate deals:\n${candidateList}\n\nRank these deals by likelihood. Return JSON array only.`,
                },
              ],
              temperature: 0.1,
            }),
          });

          if (aiResponse.ok) {
            const aiData = await aiResponse.json();
            const content = aiData.choices?.[0]?.message?.content || "";
            // Extract JSON from response
            const jsonMatch = content.match(/\[[\s\S]*?\]/);
            if (jsonMatch) {
              const adjustments = JSON.parse(jsonMatch[0]);
              for (const adj of adjustments) {
                const idx = (adj.deal_index || 0) - 1;
                if (idx >= 0 && idx < aiEnhancedDeals.length) {
                  aiEnhancedDeals[idx].score = Math.max(0, Math.min(100, aiEnhancedDeals[idx].score + (adj.confidence_adjustment || 0)));
                  if (adj.reason) {
                    aiEnhancedDeals[idx].reasons.push(`AI: ${adj.reason}`);
                  }
                }
              }
              aiEnhancedDeals.sort((a: any, b: any) => b.score - a.score);
            }
          }
        } catch (aiErr) {
          console.error("AI enhancement failed, using deterministic only:", aiErr);
        }
      }

      // Take top 3 suggestions
      const topSuggestions = aiEnhancedDeals.slice(0, 3).filter((d: any) => d.score >= 15);

      if (topSuggestions.length > 0) {
        // Delete existing pending suggestions for this meeting
        await supabase
          .from("claap_match_suggestions")
          .delete()
          .eq("meeting_id", meeting.id)
          .eq("status", "pending");

        // Insert new suggestions
        const { error: insertErr } = await supabase
          .from("claap_match_suggestions")
          .insert(
            topSuggestions.map((s: any, i: number) => ({
              meeting_id: meeting.id,
              deal_id: s.deal_id,
              confidence: s.score,
              reason: s.reasons.join("; "),
              suggestion_source: lovableApiKey ? "ai_enhanced" : "deterministic",
              rank: i + 1,
              status: "pending",
            }))
          );

        if (!insertErr) {
          totalSuggestions += topSuggestions.length;

          // Update meeting
          await supabase
            .from("claap_meetings")
            .update({
              suggestions_generated_at: new Date().toISOString(),
              suggestion_count: topSuggestions.length,
              match_candidates: topSuggestions.map((s: any) => ({
                deal_id: s.deal_id,
                deal_name: s.deal_name,
                confidence: s.score,
                reason: s.reasons.join("; "),
              })),
            } as any)
            .eq("id", meeting.id);
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, processed: meetings.length, suggestions: totalSuggestions }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("claap-suggest-matches error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
