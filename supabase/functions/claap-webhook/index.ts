import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-claap-signature",
};

interface ClaapWebhookPayload {
  event: string;
  data: {
    id: string;
    title?: string;
    url?: string;
    videoUrl?: string;
    durationSeconds?: number;
    createdAt?: string;
    recorder?: {
      email: string;
      name: string;
    };
    meeting?: {
      participants: Array<{
        name: string;
        email: string;
        attended: boolean;
      }>;
      startingAt?: string;
      endingAt?: string;
    };
    transcripts?: Array<{
      textUrl: string;
      isTranscript: boolean;
    }>;
    // New Claap aiFields flat-collection format (preferred). Each entry is
    // one rendered AI field (key/label/value/type). Rolling out alongside
    // the legacy insightTemplates shape — both must be supported until
    // 2026-06-15, at which point the legacy branch can be removed.
    aiFields?: Array<{
      key: string;
      label: string;
      value: string;
      type: string;
    }>;
    // Legacy nested insightTemplates -> insights -> sections shape.
    insightTemplates?: Array<{
      id?: string;
      name?: string;
      insights?: Array<{
        id?: string;
        name?: string;
        sections?: Array<{
          title?: string;
          description?: string;
          content?: string;
          text?: string;
        }>;
      }>;
    }>;
  };
}

/**
 * Normalize Claap insight payloads into a flat list of
 * { title, description } entries.
 *
 * Claap is in the middle of migrating from the nested
 * insightTemplates[].insights[].sections[] shape to a flat aiFields[]
 * collection. Both shapes ship in webhook payloads and REST responses
 * during the rollout window (until 2026-06-15). Prefer aiFields when
 * present; otherwise flatten the legacy template tree.
 */
export function extractClaapInsights(data: {
  aiFields?: ClaapWebhookPayload["data"]["aiFields"];
  insightTemplates?: ClaapWebhookPayload["data"]["insightTemplates"];
}): Array<{ title: string; description: string }> {
  // New format takes precedence.
  if (Array.isArray(data?.aiFields) && data.aiFields.length > 0) {
    return data.aiFields
      .map((f) => ({
        title: (f?.label || f?.key || "").trim(),
        description: (f?.value ?? "").toString().trim(),
      }))
      .filter((s) => s.title || s.description);
  }

  // Legacy fallback: flatten insightTemplates[].insights[].sections[].
  if (Array.isArray(data?.insightTemplates) && data.insightTemplates.length > 0) {
    const out: Array<{ title: string; description: string }> = [];
    for (const tpl of data.insightTemplates) {
      for (const ins of tpl?.insights ?? []) {
        for (const sec of ins?.sections ?? []) {
          const title = (sec?.title || ins?.name || tpl?.name || "").trim();
          const description = (sec?.description ?? sec?.content ?? sec?.text ?? "").toString().trim();
          if (title || description) out.push({ title, description });
        }
      }
    }
    return out;
  }

  return [];
}

// ─── Shared matching utilities ───────────────────────────

/** Dice coefficient for fuzzy matching */
function diceCoefficient(a: string, b: string): number {
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();
  if (s1 === s2) return 1;
  if (s1.length < 2 || s2.length < 2) return 0;
  const bigrams1 = new Map<string, number>();
  for (let i = 0; i < s1.length - 1; i++) {
    const bg = s1.substring(i, i + 2);
    bigrams1.set(bg, (bigrams1.get(bg) || 0) + 1);
  }
  let inter = 0;
  for (let i = 0; i < s2.length - 1; i++) {
    const bg = s2.substring(i, i + 2);
    const c = bigrams1.get(bg) || 0;
    if (c > 0) { bigrams1.set(bg, c - 1); inter++; }
  }
  return (2.0 * inter) / (s1.length - 1 + (s2.length - 1));
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

interface MatchResult {
  matched: boolean;
  matchType: "deal" | "lender" | "company" | "contact" | null;
  matchSource: string | null;
  lenderId: string | null;
  crmCompanyId: string | null;
  contactId: string | null;
  dealIds: string[];
  callType: string | null;
  confidence: number; // 0-100
  ambiguous: boolean; // true if multiple deal candidates
}

interface ClassifiedParticipant {
  name: string;
  email: string;
  domain: string;
  is_internal: boolean;
}

// ─── Confidence-scored Smart Matching ────────────────────
// Priority: Deal (high confidence) → Lender → Company → Contact
async function runSmartMatching(
  supabaseAdmin: any,
  title: string | null,
  participants: ClassifiedParticipant[],
  configCompanyId: string | null,
): Promise<MatchResult> {
  const result: MatchResult = {
    matched: false, matchType: null, matchSource: null,
    lenderId: null, crmCompanyId: null, contactId: null,
    dealIds: [], callType: null, confidence: 0, ambiguous: false,
  };

  const externalParticipants = participants.filter(p => !p.is_internal);
  const externalEmails = externalParticipants.map(p => p.email).filter(Boolean);
  const externalDomains = [...new Set(externalParticipants.map(p => p.domain).filter(Boolean))];
  const titleNorm = normalizeName(title || "");
  const titleLower = (title || "").toLowerCase();

  // ═══════════════════════════════════════════════════════
  // 1. DEAL MATCH (highest priority when confident)
  // ═══════════════════════════════════════════════════════
  if (titleNorm || externalEmails.length > 0 || externalDomains.length > 0) {
    // Fetch active deals (scoped to company if available)
    let dealQuery = supabaseAdmin
      .from("deals")
      .select("id, company, company_id")
      .or("status.is.null,status.neq.archived")
      .limit(500);
    if (configCompanyId) dealQuery = dealQuery.eq("company_id", configCompanyId);
    const { data: deals } = await dealQuery;

    // Fetch deal aliases
    let aliasQuery = supabaseAdmin
      .from("deal_aliases")
      .select("deal_id, alias_normalized")
      .limit(2000);
    const { data: aliases } = await aliasQuery;

    // Build alias map: deal_id → normalized aliases
    const aliasMap = new Map<string, string[]>();
    if (aliases) {
      for (const a of aliases) {
        const existing = aliasMap.get(a.deal_id) || [];
        existing.push(a.alias_normalized);
        aliasMap.set(a.deal_id, existing);
      }
    }

    // Score each deal
    interface DealCandidate { id: string; name: string; score: number; source: string; }
    const candidates: DealCandidate[] = [];

    if (deals && titleNorm) {
      for (const deal of deals) {
        if (!deal.company) continue;
        const dealName = normalizeName(deal.company);
        let bestScore = 0;
        let bestSource = "";

        // Exact substring match in title (high confidence)
        if (dealName.length >= 3 && titleNorm.includes(dealName)) {
          bestScore = 90;
          bestSource = `Deal name in title: "${deal.company}"`;
        }

        // Dice coefficient fuzzy match
        if (bestScore < 70 && dealName.length >= 4) {
          const dice = diceCoefficient(dealName, titleNorm);
          if (dice > 0.6) {
            bestScore = Math.max(bestScore, Math.round(dice * 85));
            bestSource = `Fuzzy deal name match: "${deal.company}" (${Math.round(dice * 100)}%)`;
          }
        }

        // Check aliases
        const dealAliases = aliasMap.get(deal.id) || [];
        for (const alias of dealAliases) {
          if (alias.length >= 3 && titleNorm.includes(alias)) {
            const aliasScore = 85;
            if (aliasScore > bestScore) {
              bestScore = aliasScore;
              bestSource = `Deal alias in title: "${alias}" → "${deal.company}"`;
            }
          }
          if (alias.length >= 4) {
            const dice = diceCoefficient(alias, titleNorm);
            if (dice > 0.55) {
              const aliasScore = Math.round(dice * 80);
              if (aliasScore > bestScore) {
                bestScore = aliasScore;
                bestSource = `Fuzzy deal alias match: "${alias}" → "${deal.company}" (${Math.round(dice * 100)}%)`;
              }
            }
          }
        }

        if (bestScore >= 50) {
          candidates.push({ id: deal.id, name: deal.company, score: bestScore, source: bestSource });
        }
      }
    }

    // Cross-reference: participant domains/contacts pointing to exactly one deal
    if (externalEmails.length > 0 && deals) {
      const { data: contactMatches } = await supabaseAdmin
        .from("contacts").select("id, email, crm_company_id")
        .in("email", externalEmails).limit(10);

      if (contactMatches && contactMatches.length > 0) {
        const { data: contactDeals } = await supabaseAdmin
          .from("contact_deals").select("deal_id, contact_id")
          .in("contact_id", contactMatches.map((c: any) => c.id));

        if (contactDeals) {
          // Boost candidates that match contact-linked deals
          const contactDealIds = new Set<string>(contactDeals.map((cd: any) => cd.deal_id));
          for (const cand of candidates) {
            if (contactDealIds.has(cand.id)) {
              cand.score = Math.min(cand.score + 15, 100);
              cand.source += " + participant contact match";
            }
          }
          // If no title-based candidates but contacts point to exactly one active deal
          if (candidates.length === 0 && contactDealIds.size === 1) {
            const dealId = [...contactDealIds][0] as string;
            const deal = (deals as any[]).find((d: any) => d.id === dealId);
            if (deal) {
              candidates.push({
                id: dealId,
                name: deal.company,
                score: 60,
                source: `Contact participant linked to deal: "${deal.company}"`,
              });
            }
          }
        }
      }
    }

    // Evaluate deal candidates
    candidates.sort((a, b) => b.score - a.score);

    if (candidates.length === 1 && candidates[0].score >= 60) {
      result.matched = true;
      result.matchType = "deal";
      result.matchSource = candidates[0].source;
      result.dealIds = [candidates[0].id];
      result.callType = "Deal Call";
      result.confidence = candidates[0].score;
      return result;
    }

    if (candidates.length >= 2) {
      const top = candidates[0];
      const second = candidates[1];
      // If top candidate is clearly ahead, auto-link
      if (top.score >= 75 && top.score - second.score >= 15) {
        result.matched = true;
        result.matchType = "deal";
        result.matchSource = top.source;
        result.dealIds = [top.id];
        result.callType = "Deal Call";
        result.confidence = top.score;
        return result;
      }
      // Otherwise ambiguous — mark matched but flag for review
      if (top.score >= 50) {
        result.matched = true;
        result.matchType = "deal";
        result.matchSource = `Ambiguous: ${candidates.slice(0, 3).map(c => `"${c.name}" (${c.score}%)`).join(", ")}`;
        result.dealIds = candidates.slice(0, 5).map(c => c.id);
        result.callType = "Deal Call (ambiguous)";
        result.confidence = top.score;
        result.ambiguous = true;
        return result;
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  // 2. LENDER MATCH
  // ═══════════════════════════════════════════════════════
  if (configCompanyId) {
    if (titleLower) {
      const { data: lenders } = await supabaseAdmin
        .from("master_lenders").select("id, name")
        .eq("company_id", configCompanyId).limit(500);

      if (lenders) {
        for (const lender of lenders) {
          const lenderName = normalizeName(lender.name);
          if (lenderName.length >= 3 && titleLower.includes(lenderName)) {
            result.matched = true;
            result.matchType = "lender";
            result.matchSource = `Lender name in title: "${lender.name}"`;
            result.lenderId = lender.id;
            result.callType = "Lender Call";
            result.confidence = 75;
            const { data: dealLenders } = await supabaseAdmin
              .from("deal_lenders").select("deal_id").eq("name", lender.name).limit(10);
            if (dealLenders) result.dealIds = dealLenders.map((dl: any) => dl.deal_id);
            return result;
          }
          if (diceCoefficient(lenderName, normalizeName(title || "")) > 0.45) {
            result.matched = true;
            result.matchType = "lender";
            result.matchSource = `Fuzzy lender name match: "${lender.name}"`;
            result.lenderId = lender.id;
            result.callType = "Lender Call";
            result.confidence = 55;
            return result;
          }
        }
      }
    }

    for (const domain of externalDomains) {
      const { data: lenderContacts } = await supabaseAdmin
        .from("lender_contacts").select("lender_id, email")
        .ilike("email", `%@${domain}`).limit(5);

      if (lenderContacts && lenderContacts.length > 0) {
        result.matched = true;
        result.matchType = "lender";
        result.matchSource = `Lender contact domain match: ${domain}`;
        result.lenderId = lenderContacts[0].lender_id;
        result.callType = "Lender Call";
        result.confidence = 65;
        return result;
      }
    }

    for (const participant of externalParticipants) {
      if (!participant.name) continue;
      const { data: lenderContacts } = await supabaseAdmin
        .from("lender_contacts").select("lender_id, name")
        .ilike("name", `%${participant.name}%`).limit(3);

      if (lenderContacts && lenderContacts.length > 0) {
        result.matched = true;
        result.matchType = "lender";
        result.matchSource = `Lender contact name match: ${participant.name}`;
        result.lenderId = lenderContacts[0].lender_id;
        result.callType = "Lender Call";
        result.confidence = 55;
        return result;
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  // 3. COMPANY MATCH
  // ═══════════════════════════════════════════════════════
  for (const domain of externalDomains) {
    const { data: companyMatches } = await supabaseAdmin
      .from("crm_companies").select("id, name, domain, additional_domains")
      .or(`domain.ilike.%${domain}%,additional_domains.cs.{${domain}}`).limit(5);

    if (companyMatches && companyMatches.length > 0) {
      const company = companyMatches[0];
      result.matched = true;
      result.matchType = "company";
      result.matchSource = `Company domain match: ${domain} → ${company.name}`;
      result.crmCompanyId = company.id;
      result.callType = "Company Call";
      result.confidence = 70;
      const { data: deals } = await supabaseAdmin
        .from("deals").select("id").or("status.is.null,status.neq.archived").ilike("company", `%${company.name}%`).limit(5);
      if (deals) result.dealIds = deals.map((d: any) => d.id);
      return result;
    }
  }

  if (titleLower) {
    const { data: allCompanies } = await supabaseAdmin
      .from("crm_companies").select("id, name").limit(500);

    if (allCompanies) {
      for (const co of allCompanies) {
        const coName = normalizeName(co.name);
        if (coName.length >= 3 && titleLower.includes(coName)) {
          result.matched = true;
          result.matchType = "company";
          result.matchSource = `Company name in title: "${co.name}"`;
          result.crmCompanyId = co.id;
          result.callType = "Company Call";
          result.confidence = 65;
          return result;
        }
        if (diceCoefficient(coName, normalizeName(title || "")) > 0.5) {
          result.matched = true;
          result.matchType = "company";
          result.matchSource = `Fuzzy company name match: "${co.name}"`;
          result.crmCompanyId = co.id;
          result.callType = "Company Call";
          result.confidence = 50;
          return result;
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  // 4. CONTACT MATCH
  // ═══════════════════════════════════════════════════════
  if (externalEmails.length > 0) {
    const { data: contactMatches } = await supabaseAdmin
      .from("contacts").select("id, crm_company_id, first_name, last_name, email")
      .in("email", externalEmails).limit(10);

    if (contactMatches && contactMatches.length > 0) {
      const contact = contactMatches[0];
      result.matched = true;
      result.matchType = "contact";
      result.matchSource = `Contact email match: ${contact.email}`;
      result.contactId = contact.id;
      result.crmCompanyId = contact.crm_company_id || null;
      result.callType = "Contact Call";
      result.confidence = 60;
      const { data: contactDeals } = await supabaseAdmin
        .from("contact_deals").select("deal_id").eq("contact_id", contact.id);
      if (contactDeals) result.dealIds = contactDeals.map((cd: any) => cd.deal_id);
      return result;
    }
  }

  return result;
}

// ─── Main handler ────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Read raw body once so we can both verify HMAC and parse JSON
  const rawBody = await req.text();
  let payload: ClaapWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ ok: true, note: "invalid json" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const eventTypePreview = payload?.event;
  console.log(
    "[claap] webhook",
    eventTypePreview,
    payload?.data?.id,
    "aiFields=",
    Array.isArray(payload?.data?.aiFields) ? payload.data.aiFields.length : "absent",
    "insightTemplates=",
    Array.isArray(payload?.data?.insightTemplates) ? payload.data.insightTemplates.length : "absent",
  );
  const authHeader = req.headers.get("Authorization");
  let authenticatedUserId: string | null = null;

  // Internal UI calls (force_sync) must come with a valid Supabase JWT.
  if (eventTypePreview === "force_sync") {
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    authenticatedUserId = userData.user.id;
  } else {
    // External Claap webhook: require HMAC-SHA256 signature when secret is configured.
    const webhookSecret = Deno.env.get("CLAAP_WEBHOOK_SECRET");
    const signature = req.headers.get("x-claap-signature");
    if (!webhookSecret) {
      console.error("CLAAP_WEBHOOK_SECRET is not configured; rejecting unauthenticated webhook");
      return new Response(JSON.stringify({ error: "Webhook signature verification not configured" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!signature) {
      return new Response(JSON.stringify({ error: "Missing x-claap-signature" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    try {
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(webhookSecret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
      const expected = Array.from(new Uint8Array(sigBuf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const provided = signature.replace(/^sha256=/, "").toLowerCase();
      // Constant-time comparison
      if (expected.length !== provided.length) {
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      let mismatch = 0;
      for (let i = 0; i < expected.length; i++) {
        mismatch |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
      }
      if (mismatch !== 0) {
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } catch (e) {
      console.error("Signature verification failed:", e);
      return new Response(JSON.stringify({ error: "Signature verification error" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  try {
    const eventType = payload.event;

    // Handle force-sync from UI
    if (eventType === "force_sync") {
      const skippedCallId = (payload.data as unknown as { skipped_call_id: string }).skipped_call_id;
      // Use the authenticated user's id, never trust the body
      const userId = authenticatedUserId;

      if (!skippedCallId) throw new Error("Missing skipped_call_id");

      const { data: skippedCall } = await supabaseAdmin
        .from("claap_skipped_calls")
        .select("*")
        .eq("id", skippedCallId)
        .single();

      if (!skippedCall) throw new Error("Skipped call not found");

      await supabaseAdmin
        .from("claap_skipped_calls")
        .update({ force_synced: true, force_synced_by: userId, force_synced_at: new Date().toISOString() })
        .eq("id", skippedCallId);

      const meetingRecord = {
        claap_id: skippedCall.claap_id,
        title: skippedCall.title,
        recording_url: skippedCall.recording_url,
        organizer_email: skippedCall.organizer_email,
        duration_seconds: skippedCall.duration_seconds,
        started_at: skippedCall.started_at,
        company_id: skippedCall.company_id,
        status: "pending_review" as const,
        call_type: "Force Synced",
        match_source: "Manually force synced by admin",
      };

      await supabaseAdmin
        .from("claap_meetings")
        .upsert(meetingRecord, { onConflict: "claap_id" });

      const participants = skippedCall.participants as Array<{ name: string; email: string; domain: string; is_internal: boolean }> || [];
      const { data: meeting } = await supabaseAdmin
        .from("claap_meetings")
        .select("id")
        .eq("claap_id", skippedCall.claap_id)
        .single();

      if (meeting && participants.length > 0) {
        await supabaseAdmin
          .from("claap_meeting_participants")
          .delete()
          .eq("meeting_id", meeting.id);

        await supabaseAdmin
          .from("claap_meeting_participants")
          .insert(participants.map(p => ({
            meeting_id: meeting.id,
            name: p.name,
            email: p.email,
            domain: p.domain,
            is_internal: p.is_internal,
          })));
      }

      return new Response(JSON.stringify({ ok: true, status: "force_synced", meeting_id: meeting?.id }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["recording.completed", "recording.updated"].includes(eventType)) {
      return new Response(JSON.stringify({ ok: true, note: "event ignored" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = payload.data;
    const claapId = data.id;
    if (!claapId) throw new Error("Missing recording id");

    const organizerEmail = data.recorder?.email || null;
    const participants = data.meeting?.participants || [];

    // Fetch transcript
    let transcript: string | null = null;
    let transcriptMissing = false;
    const claapApiKey = Deno.env.get("CLAAP_API_KEY");

    if (claapApiKey) {
      try {
        const txResp = await fetch(
          `https://api.claap.io/v1/recordings/${claapId}/transcript?format=text`,
          { headers: { "X-Claap-Key": claapApiKey, "Content-Type": "application/json" } }
        );
        if (txResp.ok) {
          const contentType = txResp.headers.get("content-type") || "";
          if (contentType.includes("application/json")) {
            const txData = await txResp.json();
            transcript = txData.result?.transcript || txData.transcript || null;
          } else {
            transcript = await txResp.text();
          }
        } else {
          await txResp.text();
        }
      } catch (e) {
        console.error("Failed to fetch transcript:", e);
      }
    }
    if (!transcript) transcriptMissing = true;

    // Resolve config
    let internalDomains = ["5thlinefinancing.com", "5thline.co"];
    let configCompanyId: string | null = null;
    let minDurationSeconds = 300;
    let excludedTitlePatterns = [
      "5th Line Weekly", "Partners Meeting", "Joint Work",
      "All Hands", "Monthly Insights", "Quarterly Insights"
    ];
    let fallbackAdminUserId: string | null = null;
    let taskExpiryDays = 7;
    let syncAllCalls = false;

    if (organizerEmail) {
      const { data: profileData } = await supabaseAdmin
        .from("profiles")
        .select("user_id")
        .eq("email", organizerEmail)
        .maybeSingle();

      if (profileData?.user_id) {
        const { data: memberData } = await supabaseAdmin
          .from("company_members")
          .select("company_id")
          .eq("user_id", profileData.user_id)
          .maybeSingle();

        if (memberData?.company_id) {
          configCompanyId = memberData.company_id;

          const { data: configData } = await supabaseAdmin
            .from("claap_integration_config")
            .select("*")
            .eq("company_id", configCompanyId)
            .maybeSingle();

          if (configData) {
            if (configData.internal_domains?.length) internalDomains = configData.internal_domains;
            minDurationSeconds = configData.min_duration_seconds || 300;
            if (configData.excluded_title_patterns?.length) excludedTitlePatterns = configData.excluded_title_patterns;
            fallbackAdminUserId = configData.fallback_admin_user_id;
            taskExpiryDays = configData.task_expiry_days || 7;
            syncAllCalls = configData.sync_all_calls || false;
          }
        }
      }
    }

    // Classify participants
    const classifiedParticipants = participants.map((p) => {
      const domain = p.email?.split("@")[1]?.toLowerCase() || "";
      return {
        name: p.name,
        email: p.email,
        domain,
        is_internal: internalDomains.some((d) => domain === d.toLowerCase()),
      };
    });

    const hasExternalParticipant = classifiedParticipants.some((p) => !p.is_internal);
    const hasInternalParticipant = classifiedParticipants.some((p) => p.is_internal);

    // EXCLUSION FILTER
    let excluded = false;
    let exclusionReason = "";

    if (!hasExternalParticipant) {
      excluded = true;
      exclusionReason = "All participants are internal (no external participants)";
    }
    if (!excluded && !hasInternalParticipant) {
      excluded = true;
      exclusionReason = "No internal participant found on the call";
    }
    if (!excluded && data.title) {
      const tl = data.title.toLowerCase().trim();
      for (const pattern of excludedTitlePatterns) {
        if (tl.includes(pattern.toLowerCase())) {
          excluded = true;
          exclusionReason = `Title matches excluded pattern: "${pattern}"`;
          break;
        }
      }
    }
    if (!excluded && data.durationSeconds && data.durationSeconds < minDurationSeconds) {
      excluded = true;
      exclusionReason = `Duration (${data.durationSeconds}s) under minimum (${minDurationSeconds}s)`;
    }

    if (excluded) {
      await supabaseAdmin
        .from("claap_skipped_calls")
        .upsert({
          claap_id: claapId,
          company_id: configCompanyId,
          title: data.title || null,
          recording_url: data.url || data.videoUrl || null,
          duration_seconds: data.durationSeconds || null,
          organizer_email: organizerEmail,
          participants: classifiedParticipants,
          started_at: data.meeting?.startingAt || data.createdAt || null,
          skip_reason: exclusionReason,
          match_attempts: { stage: "basic_filter" },
        }, { onConflict: "claap_id" });

      return new Response(JSON.stringify({ ok: true, status: "skipped", reason: exclusionReason }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SMART MATCHING (Deal → Lender → Company → Contact)
    const matchResult = await runSmartMatching(
      supabaseAdmin,
      data.title || null,
      classifiedParticipants,
      configCompanyId,
    );

    // If not matched AND sync_all_calls is OFF → skip
    if (!matchResult.matched && !syncAllCalls) {
      await supabaseAdmin
        .from("claap_skipped_calls")
        .upsert({
          claap_id: claapId,
          company_id: configCompanyId,
          title: data.title || null,
          recording_url: data.url || data.videoUrl || null,
          duration_seconds: data.durationSeconds || null,
          organizer_email: organizerEmail,
          participants: classifiedParticipants,
          started_at: data.meeting?.startingAt || data.createdAt || null,
          skip_reason: "No matching deal, lender, company, or contact found",
          match_attempts: { stage: "smart_matching", checked: ["deals", "deal_aliases", "lenders", "crm_companies", "contacts"] },
        }, { onConflict: "claap_id" });

      return new Response(JSON.stringify({ ok: true, status: "skipped", reason: "No match found" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // MATCHED — save meeting
    const meetingRecord: Record<string, unknown> = {
      claap_id: claapId,
      title: data.title || null,
      recording_url: data.url || data.videoUrl || null,
      transcript,
      organizer_email: organizerEmail,
      duration_seconds: data.durationSeconds || null,
      started_at: data.meeting?.startingAt || data.createdAt || null,
      transcript_missing: transcriptMissing,
      no_internal_participant: !hasInternalParticipant,
      company_id: configCompanyId,
      raw_payload: payload as unknown as Record<string, unknown>,
      status: "pending_review",
      call_type: matchResult.callType || (syncAllCalls ? "Unmatched (sync all)" : null),
      match_source: matchResult.matchSource || (syncAllCalls ? "Synced via sync_all_calls setting" : null),
      matched_lender_id: matchResult.lenderId,
      matched_crm_company_id: matchResult.crmCompanyId,
      matched_contact_id: matchResult.contactId,
    };

    const { data: meeting, error: meetingError } = await supabaseAdmin
      .from("claap_meetings")
      .upsert(meetingRecord, { onConflict: "claap_id" })
      .select("id")
      .single();

    if (meetingError) throw meetingError;
    const meetingId = meeting.id;

    // Insert participants
    await supabaseAdmin
      .from("claap_meeting_participants")
      .delete()
      .eq("meeting_id", meetingId);

    if (classifiedParticipants.length > 0) {
      await supabaseAdmin
        .from("claap_meeting_participants")
        .insert(
          classifiedParticipants.map((p) => ({
            meeting_id: meetingId,
            name: p.name,
            email: p.email,
            domain: p.domain,
            is_internal: p.is_internal,
          }))
        );
    }

    // ROUTING ENGINE
    const financingReviewPattern = /^(?:(.+?)\s*<>\s*5th\s*line|5th\s*line\s*<>\s*(.+?))\s*(?:financing\s*review)?$/i;
    let extractedCompanyName: string | null = null;
    let isFinancingReview = false;

    if (data.title) {
      const match = data.title.match(financingReviewPattern);
      if (match) {
        extractedCompanyName = (match[1] || match[2])?.trim() || null;
        isFinancingReview = true;
      }
    }

    // Resolve external participants to contacts
    const externalParticipants = classifiedParticipants.filter((p) => !p.is_internal);
    const unresolvedParticipants: typeof externalParticipants = [];
    const resolvedContactIds: string[] = [];

    for (const participant of externalParticipants) {
      if (!participant.email) {
        unresolvedParticipants.push(participant);
        continue;
      }
      const { data: contact } = await supabaseAdmin
        .from("profiles")
        .select("id, user_id")
        .eq("email", participant.email)
        .maybeSingle();

      if (contact) {
        resolvedContactIds.push(contact.id);
        await supabaseAdmin
          .from("claap_meeting_participants")
          .update({ contact_id: contact.id, resolved: true })
          .eq("meeting_id", meetingId)
          .eq("email", participant.email);
      } else {
        unresolvedParticipants.push(participant);
      }
    }

    // Resolve company from external domains
    const externalDomains = [...new Set(externalParticipants.map((p) => p.domain).filter(Boolean))];
    let resolvedCompanyId: string | null = null;
    let unresolvedDomains: string[] = [];

    for (const domain of externalDomains) {
      const { data: companyMatch } = await supabaseAdmin
        .from("companies")
        .select("id")
        .or(`website_url.ilike.%${domain}%`)
        .maybeSingle();

      if (companyMatch) {
        resolvedCompanyId = companyMatch.id;
        break;
      } else {
        unresolvedDomains.push(domain);
      }
    }

    if (!resolvedCompanyId && extractedCompanyName) {
      const { data: companyMatch } = await supabaseAdmin
        .from("companies")
        .select("id")
        .ilike("name", `%${extractedCompanyName}%`)
        .maybeSingle();

      if (companyMatch) {
        resolvedCompanyId = companyMatch.id;
      }
    }

    // Resolve deal
    let resolvedDealId: string | null = null;
    let multipleDealCandidates: string[] = [];

    // Use smart match deal IDs first
    if (matchResult.dealIds.length === 1 && !matchResult.ambiguous) {
      resolvedDealId = matchResult.dealIds[0];
    } else if (matchResult.dealIds.length > 1 || matchResult.ambiguous) {
      multipleDealCandidates = matchResult.dealIds;
    }

    if (!resolvedDealId && resolvedCompanyId) {
      const { data: activeDeals } = await supabaseAdmin
        .from("deals")
        .select("id")
        .eq("company_id", resolvedCompanyId)
        .or("status.is.null,status.neq.archived")
        .limit(10);

      if (activeDeals && activeDeals.length === 1) {
        resolvedDealId = activeDeals[0].id;
      } else if (activeDeals && activeDeals.length > 1 && !multipleDealCandidates.length) {
        multipleDealCandidates = activeDeals.map((d) => d.id);
      }
    }

    if (!resolvedDealId && extractedCompanyName && !multipleDealCandidates.length) {
      const { data: dealMatch } = await supabaseAdmin
        .from("deals")
        .select("id, company_id")
        .ilike("company", `%${extractedCompanyName}%`)
        .or("status.is.null,status.neq.archived")
        .limit(10);

      if (dealMatch && dealMatch.length === 1) {
        resolvedDealId = dealMatch[0].id;
        resolvedCompanyId = resolvedCompanyId || dealMatch[0].company_id;
      } else if (dealMatch && dealMatch.length > 1) {
        multipleDealCandidates = dealMatch.map((d) => d.id);
      }
    }

    // Resolve organizer
    let organizerUserId: string | null = null;
    if (organizerEmail) {
      const { data: orgProfile } = await supabaseAdmin
        .from("profiles")
        .select("user_id")
        .eq("email", organizerEmail)
        .maybeSingle();
      organizerUserId = orgProfile?.user_id || null;
    }

    const taskAssignee = organizerUserId || fallbackAdminUserId;

    // Update meeting with resolved data
    const updateData: Record<string, unknown> = {};
    if (resolvedCompanyId) updateData.company_id = resolvedCompanyId;
    if (resolvedDealId) updateData.deal_id = resolvedDealId;

    let finalStatus: string;
    const needsTasks =
      unresolvedParticipants.length > 0 ||
      unresolvedDomains.length > 0 ||
      multipleDealCandidates.length > 0 ||
      matchResult.ambiguous ||
      (isFinancingReview && !resolvedDealId);

    if (needsTasks) {
      finalStatus = "awaiting_confirmation";
    } else if (resolvedDealId || resolvedCompanyId) {
      finalStatus = "routed";
    } else {
      finalStatus = "pending_review";
    }

    updateData.status = finalStatus;

    await supabaseAdmin
      .from("claap_meetings")
      .update(updateData)
      .eq("id", meetingId);

    // Auto-insert into deal_claap_recordings when deal is resolved
    if (resolvedDealId && finalStatus === "routed") {
      const linkedBy = organizerUserId || fallbackAdminUserId || null;

      await supabaseAdmin
        .from("deal_claap_recordings")
        .upsert({
          deal_id: resolvedDealId,
          recording_id: claapId,
          recording_title: data.title || null,
          recording_url: data.url || data.videoUrl || null,
          thumbnail_url: null,
          duration_seconds: data.durationSeconds || null,
          recorder_name: data.recorder?.name || null,
          recorder_email: data.recorder?.email || null,
          linked_by: linkedBy,
          notes: `Auto-linked by Claap routing engine (${matchResult.matchType || "matched"}: ${matchResult.callType || "matched"})`,
        }, { onConflict: "deal_id,recording_id" });

      await supabaseAdmin
        .from("activity_logs")
        .insert({
          deal_id: resolvedDealId,
          activity_type: "claap_recording_linked",
          description: `Claap recording linked: ${data.title || "Untitled recording"} (${matchResult.matchType || "matched"}: ${matchResult.callType || "matched"})`,
          user_id: linkedBy,
          user_display_name: data.recorder?.name || null,
          metadata: {
            claap_id: claapId,
            recording_url: data.url || data.videoUrl || null,
            source: "claap_webhook_auto",
            match_type: matchResult.matchType,
            call_type: matchResult.callType,
            match_source: matchResult.matchSource,
            confidence: matchResult.confidence,
          },
        });

      if (transcript || data.title) {
        await supabaseAdmin
          .from("claap_transcripts")
          .upsert({
            deal_id: resolvedDealId,
            claap_meeting_id: meetingId,
            transcript_text: transcript || null,
            summary: null,
            participants: classifiedParticipants.map(p => ({ name: p.name, email: p.email, is_internal: p.is_internal })),
            duration_seconds: data.durationSeconds || null,
            recorded_at: data.meeting?.startingAt || data.createdAt || null,
            call_type: matchResult.callType || null,
            match_source: matchResult.matchSource || null,
          }, { onConflict: "claap_meeting_id" });
      }
    }

    // CREATE ROUTING TASKS
    const tasksToCreate: Array<Record<string, unknown>> = [];
    const expiresAt = new Date(Date.now() + taskExpiryDays * 24 * 60 * 60 * 1000).toISOString();

    if (unresolvedParticipants.length > 0 && taskAssignee) {
      tasksToCreate.push({
        meeting_id: meetingId,
        task_type: "confirm_contact",
        assigned_to: taskAssignee,
        expires_at: expiresAt,
        prefilled_data: {
          participants: unresolvedParticipants.map((p) => ({
            name: p.name, email: p.email, domain: p.domain,
            suggested_company: extractedCompanyName || p.domain?.split(".")[0] || "",
          })),
        },
      });
    }

    if (unresolvedDomains.length > 0 && !resolvedCompanyId && taskAssignee) {
      tasksToCreate.push({
        meeting_id: meetingId,
        task_type: "confirm_company",
        assigned_to: taskAssignee,
        expires_at: expiresAt,
        prefilled_data: {
          domains: unresolvedDomains,
          suggested_name: extractedCompanyName || unresolvedDomains[0]?.split(".")[0] || "",
        },
      });
    }

    if ((multipleDealCandidates.length > 0 || matchResult.ambiguous) && taskAssignee) {
      tasksToCreate.push({
        meeting_id: meetingId,
        task_type: "disambiguate_deal",
        assigned_to: taskAssignee,
        expires_at: expiresAt,
        prefilled_data: {
          deal_ids: multipleDealCandidates,
          company_name: extractedCompanyName,
          ambiguous: matchResult.ambiguous,
          match_source: matchResult.matchSource,
        },
      });
    }

    if (isFinancingReview && !resolvedDealId && multipleDealCandidates.length === 0 && taskAssignee) {
      tasksToCreate.push({
        meeting_id: meetingId,
        task_type: "create_deal",
        assigned_to: taskAssignee,
        expires_at: expiresAt,
        prefilled_data: {
          suggested_name: `${extractedCompanyName || "Unknown"} <> 5th Line Financing Review`,
          company_name: extractedCompanyName,
          company_id: resolvedCompanyId,
          organizer_email: organizerEmail,
          organizer_user_id: organizerUserId,
          contacts: resolvedContactIds,
        },
      });
    }

    if (tasksToCreate.length > 0) {
      await supabaseAdmin
        .from("claap_routing_tasks")
        .insert(tasksToCreate);
    }

    // Trigger AI analysis asynchronously
    if (transcript && !transcriptMissing) {
      try {
        const analyzeUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/claap-analyze-meeting`;
        fetch(analyzeUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}` },
          body: JSON.stringify({ meeting_id: meetingId }),
        }).catch((e) => console.error("Failed to trigger AI analysis:", e));
      } catch (e) {
        console.error("Failed to trigger AI analysis:", e);
      }
    }

    // ─── Approval Queue: enqueue recording-review card + trigger action-items ───
    // Every newly-synced Claap recording lands in the Approval Queue so the user
    // can confirm the suggested deal/company/contact links before they're written
    // to anything user-visible, and review AI-extracted follow-up tasks before
    // they're created.
    if (!excluded && taskAssignee) {
      // Gate: all approval-queue activity is managed by the Deal Admin Agent.
      // If the agent is disabled for the relevant company, skip both the
      // recording-review enqueue AND the action-items extraction trigger.
      let agentEnabled = false;
      try {
        let gateCompanyId: string | null = resolvedCompanyId || null;
        if (!gateCompanyId && resolvedDealId) {
          const { data: dealRow } = await supabaseAdmin
            .from("deals").select("company_id").eq("id", resolvedDealId).maybeSingle();
          gateCompanyId = dealRow?.company_id || null;
        }
        if (!gateCompanyId) {
          const { data: mem } = await supabaseAdmin
            .from("company_members").select("company_id").eq("user_id", taskAssignee).maybeSingle();
          gateCompanyId = (mem as any)?.company_id || null;
        }
        if (gateCompanyId) {
          const { data: agentRow } = await supabaseAdmin
            .from("admin_agent_settings").select("enabled").eq("company_id", gateCompanyId).maybeSingle();
          agentEnabled = agentRow?.enabled === true;
        }
      } catch (e) {
        console.error("[claap-webhook] Deal Admin Agent gate check failed:", e);
      }

      if (!agentEnabled) {
        console.log("[claap-webhook] Deal Admin Agent disabled — skipping Approval Queue enqueue + action-items extraction");
      } else {
      try {
        // Build the top-3 suggestions for Stage-1 (relationship matching).
        const candidateDealIds = resolvedDealId
          ? [resolvedDealId, ...multipleDealCandidates.filter((id) => id !== resolvedDealId)].slice(0, 3)
          : multipleDealCandidates.slice(0, 3);

        let candidateDeals: Array<{ id: string; company: string | null; company_id: string | null }> = [];
        if (candidateDealIds.length > 0) {
          const { data } = await supabaseAdmin
            .from("deals")
            .select("id, company, company_id")
            .in("id", candidateDealIds);
          candidateDeals = data || [];
        }

        const whyParts: string[] = [];
        if (matchResult.matchSource) whyParts.push(matchResult.matchSource);
        if (matchResult.callType) whyParts.push(`call type: ${matchResult.callType}`);
        const externalDomains = Array.from(new Set(
          classifiedParticipants.filter(p => !p.is_internal).map(p => p.domain).filter(Boolean)
        ));
        if (externalDomains.length > 0) whyParts.push(`attendee domains: ${externalDomains.join(", ")}`);
        if (extractedCompanyName) whyParts.push(`title mentions "${extractedCompanyName}"`);

        const dealNameForQueue = candidateDeals.find(d => d.id === resolvedDealId)?.company
          || candidateDeals[0]?.company
          || extractedCompanyName
          || null;

        const queuePayload = {
          claap_meeting_id: meetingId,
          claap_id: claapId,
          recording_title: data.title || null,
          recording_url: data.url || data.videoUrl || null,
          recorded_at: data.meeting?.startingAt || data.createdAt || null,
          duration_seconds: data.durationSeconds || null,
          attendees: classifiedParticipants.map(p => ({
            name: p.name, email: p.email, is_internal: p.is_internal,
          })),
          suggestions: {
            deals: candidateDeals.map(d => ({
              id: d.id, name: d.company, company_id: d.company_id,
              pre_selected: d.id === resolvedDealId,
            })),
            company_id: resolvedCompanyId,
            company_name: extractedCompanyName,
            contact_ids: resolvedContactIds,
          },
          confidence: matchResult.confidence,
          confidence_label: matchResult.confidence >= 75 ? "high"
            : matchResult.confidence >= 40 ? "medium" : "low",
          why: whyParts.join(" · "),
          ambiguous: matchResult.ambiguous || multipleDealCandidates.length > 1,
          stage: "matching" as const,
        };

        await supabaseAdmin
          .from("ai_action_queue")
          .insert({
            user_id: taskAssignee,
            deal_id: resolvedDealId || null,
            deal_name: dealNameForQueue,
            action_type: "claap_recording_review",
            title: `New Claap recording: ${data.title || "Untitled recording"}`,
            description: dealNameForQueue
              ? `Confirm link to ${dealNameForQueue}${queuePayload.confidence_label === "high" ? " (high confidence)" : ""}.`
              : `Choose a deal/company to link this recording to.`,
            payload: queuePayload,
            source: { provider: "claap", origin: "claap-webhook" },
          });
      } catch (e) {
        console.error("Failed to enqueue Approval Queue card for Claap recording:", e);
      }

      // Trigger action-items extraction asynchronously — this inserts a SECOND
      // approval-queue row (action_type = 'claap_action_items') once the AI is done.
      if (transcript && !transcriptMissing) {
        try {
          const extractUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/claap-extract-action-items`;
          fetch(extractUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}` },
            body: JSON.stringify({ meeting_id: meetingId, assignee_user_id: taskAssignee }),
          }).catch((e) => console.error("Failed to trigger action-items extraction:", e));
        } catch (e) {
          console.error("Failed to trigger action-items extraction:", e);
        }
      }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        meeting_id: meetingId,
        status: finalStatus,
        tasks_created: tasksToCreate.length,
        match: {
          type: matchResult.matchType,
          source: matchResult.matchSource,
          call_type: matchResult.callType,
          confidence: matchResult.confidence,
          ambiguous: matchResult.ambiguous,
        },
        resolved: {
          company: !!resolvedCompanyId,
          deal: !!resolvedDealId,
          contacts: resolvedContactIds.length,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("Claap webhook error:", error);

    try {
      await supabaseAdmin.from("claap_webhook_errors").insert({
        event_type: payload?.event || "unknown",
        payload: payload as unknown as Record<string, unknown>,
        error_message: error instanceof Error ? error.message : "Unknown error",
      });
    } catch (logErr) {
      console.error("Failed to log webhook error:", logErr);
    }

    return new Response(
      JSON.stringify({ ok: true, note: "error logged for retry" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
