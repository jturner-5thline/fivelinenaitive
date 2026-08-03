import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { shouldDefer, getQuotaStatus } from "../_shared/claap-quota.ts";

// Also count list-endpoint pulls against the daily Claap quota — every
// /v1/recordings page consumes a real API call and needs to be visible to
// the quota gate, otherwise cron jobs silently blow through the budget.
async function recordClaapListCall() {
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    await admin.rpc("claap_record_api_call", { _count: 1 });
  } catch (_) { /* best-effort */ }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Shared matching utilities (mirrored from claap-webhook) ───

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
  confidence: number;
  ambiguous: boolean;
}

interface ClassifiedParticipant {
  name: string;
  email: string;
  domain: string;
  is_internal: boolean;
}

interface StoredClaapMeeting {
  id: string;
  claap_id: string;
  title: string | null;
  recording_url: string | null;
  transcript: string | null;
  organizer_email: string | null;
  duration_seconds: number | null;
  started_at: string | null;
  company_id: string | null;
  deal_id?: string | null;
}

// ─── Confidence-scored Smart Matching ────────────────────
// Priority: Deal (high confidence) → Lender → Company → Contact
async function runSmartMatching(
  supabaseAdmin: ReturnType<typeof createClient>,
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

  // 1. DEAL MATCH (highest priority)
  if (titleNorm || externalEmails.length > 0 || externalDomains.length > 0) {
    let dealQuery = supabaseAdmin.from("deals").select("id, company, company_id").or("status.is.null,status.neq.archived").limit(500);
    if (configCompanyId) dealQuery = dealQuery.eq("company_id", configCompanyId);
    const { data: deals } = await dealQuery;

    const { data: aliases } = await supabaseAdmin.from("deal_aliases").select("deal_id, alias_normalized").limit(2000);
    const aliasMap = new Map<string, string[]>();
    if (aliases) {
      for (const a of aliases) {
        const existing = aliasMap.get(a.deal_id) || [];
        existing.push(a.alias_normalized);
        aliasMap.set(a.deal_id, existing);
      }
    }

    interface DealCandidate { id: string; name: string; score: number; source: string; }
    const candidates: DealCandidate[] = [];

    if (deals && titleNorm) {
      for (const deal of deals) {
        if (!deal.company) continue;
        const dealName = normalizeName(deal.company);
        let bestScore = 0;
        let bestSource = "";

        if (dealName.length >= 3 && titleNorm.includes(dealName)) {
          bestScore = 90;
          bestSource = `Deal name in title: "${deal.company}"`;
        }

        if (bestScore < 70 && dealName.length >= 4) {
          const dice = diceCoefficient(dealName, titleNorm);
          if (dice > 0.6) {
            bestScore = Math.max(bestScore, Math.round(dice * 85));
            bestSource = `Fuzzy deal name match: "${deal.company}" (${Math.round(dice * 100)}%)`;
          }
        }

        const dealAliases = aliasMap.get(deal.id) || [];
        for (const alias of dealAliases) {
          if (alias.length >= 3 && titleNorm.includes(alias)) {
            if (85 > bestScore) { bestScore = 85; bestSource = `Deal alias in title: "${alias}" → "${deal.company}"`; }
          }
          if (alias.length >= 4) {
            const dice = diceCoefficient(alias, titleNorm);
            if (dice > 0.55) {
              const s = Math.round(dice * 80);
              if (s > bestScore) { bestScore = s; bestSource = `Fuzzy deal alias match: "${alias}" → "${deal.company}" (${Math.round(dice * 100)}%)`; }
            }
          }
        }

        if (bestScore >= 50) candidates.push({ id: deal.id, name: deal.company, score: bestScore, source: bestSource });
      }
    }

    // Contact cross-reference for deal boosting
    if (externalEmails.length > 0 && deals) {
      const { data: contactMatches } = await supabaseAdmin.from("contacts").select("id, email, crm_company_id").in("email", externalEmails).limit(10);
      if (contactMatches && contactMatches.length > 0) {
        const { data: contactDeals } = await supabaseAdmin.from("contact_deals").select("deal_id, contact_id").in("contact_id", contactMatches.map(c => c.id));
        if (contactDeals) {
          const contactDealIds = new Set(contactDeals.map(cd => cd.deal_id));
          for (const cand of candidates) {
            if (contactDealIds.has(cand.id)) {
              cand.score = Math.min(cand.score + 15, 100);
              cand.source += " + participant contact match";
            }
          }
          if (candidates.length === 0 && contactDealIds.size === 1) {
            const dealId = [...contactDealIds][0];
            const deal = deals.find(d => d.id === dealId);
            if (deal) candidates.push({ id: dealId, name: deal.company, score: 60, source: `Contact participant linked to deal: "${deal.company}"` });
          }
        }
      }
    }

    candidates.sort((a, b) => b.score - a.score);

    if (candidates.length === 1 && candidates[0].score >= 60) {
      result.matched = true; result.matchType = "deal"; result.matchSource = candidates[0].source;
      result.dealIds = [candidates[0].id]; result.callType = "Deal Call"; result.confidence = candidates[0].score;
      return result;
    }
    if (candidates.length >= 2) {
      const top = candidates[0], second = candidates[1];
      if (top.score >= 75 && top.score - second.score >= 15) {
        result.matched = true; result.matchType = "deal"; result.matchSource = top.source;
        result.dealIds = [top.id]; result.callType = "Deal Call"; result.confidence = top.score;
        return result;
      }
      if (top.score >= 50) {
        result.matched = true; result.matchType = "deal";
        result.matchSource = `Ambiguous: ${candidates.slice(0, 3).map(c => `"${c.name}" (${c.score}%)`).join(", ")}`;
        result.dealIds = candidates.slice(0, 5).map(c => c.id);
        result.callType = "Deal Call (ambiguous)"; result.confidence = top.score; result.ambiguous = true;
        return result;
      }
    }
  }

  // 2. LENDER MATCH
  if (configCompanyId) {
    if (titleLower) {
      const { data: lenders } = await supabaseAdmin.from("master_lenders").select("id, name").eq("company_id", configCompanyId).limit(500);
      if (lenders) {
        for (const lender of lenders) {
          const ln = normalizeName(lender.name);
          if (ln.length >= 3 && titleLower.includes(ln)) {
            result.matched = true; result.matchType = "lender"; result.matchSource = `Lender name in title: "${lender.name}"`;
            result.lenderId = lender.id; result.callType = "Lender Call"; result.confidence = 75;
            const { data: dl } = await supabaseAdmin.from("deal_lenders").select("deal_id").eq("name", lender.name).limit(10);
            if (dl) result.dealIds = dl.map(d => d.deal_id);
            return result;
          }
          if (diceCoefficient(ln, normalizeName(title || "")) > 0.45) {
            result.matched = true; result.matchType = "lender"; result.matchSource = `Fuzzy lender name match: "${lender.name}"`;
            result.lenderId = lender.id; result.callType = "Lender Call"; result.confidence = 55;
            return result;
          }
        }
      }
    }
    for (const domain of externalDomains) {
      const { data: lc } = await supabaseAdmin.from("lender_contacts").select("lender_id, email").ilike("email", `%@${domain}`).limit(5);
      if (lc && lc.length > 0) {
        result.matched = true; result.matchType = "lender"; result.matchSource = `Lender contact domain match: ${domain}`;
        result.lenderId = lc[0].lender_id; result.callType = "Lender Call"; result.confidence = 65;
        return result;
      }
    }
    for (const p of externalParticipants) {
      if (!p.name) continue;
      const { data: lc } = await supabaseAdmin.from("lender_contacts").select("lender_id, name").ilike("name", `%${p.name}%`).limit(3);
      if (lc && lc.length > 0) {
        result.matched = true; result.matchType = "lender"; result.matchSource = `Lender contact name match: ${p.name}`;
        result.lenderId = lc[0].lender_id; result.callType = "Lender Call"; result.confidence = 55;
        return result;
      }
    }
  }

  // 3. COMPANY MATCH
  for (const domain of externalDomains) {
    const { data: cm } = await supabaseAdmin.from("crm_companies").select("id, name").or(`domain.ilike.%${domain}%,additional_domains.cs.{${domain}}`).limit(5);
    if (cm && cm.length > 0) {
      result.matched = true; result.matchType = "company"; result.matchSource = `Company domain match: ${domain} → ${cm[0].name}`;
      result.crmCompanyId = cm[0].id; result.callType = "Company Call"; result.confidence = 70;
      const { data: deals } = await supabaseAdmin.from("deals").select("id").or("status.is.null,status.neq.archived").ilike("company", `%${cm[0].name}%`).limit(5);
      if (deals) result.dealIds = deals.map(d => d.id);
      return result;
    }
  }

  if (titleLower) {
    const { data: allCo } = await supabaseAdmin.from("crm_companies").select("id, name").limit(500);
    if (allCo) {
      for (const co of allCo) {
        const cn = normalizeName(co.name);
        if (cn.length >= 3 && titleLower.includes(cn)) {
          result.matched = true; result.matchType = "company"; result.matchSource = `Company name in title: "${co.name}"`;
          result.crmCompanyId = co.id; result.callType = "Company Call"; result.confidence = 65;
          return result;
        }
        if (diceCoefficient(cn, normalizeName(title || "")) > 0.5) {
          result.matched = true; result.matchType = "company"; result.matchSource = `Fuzzy company name match: "${co.name}"`;
          result.crmCompanyId = co.id; result.callType = "Company Call"; result.confidence = 50;
          return result;
        }
      }
    }
  }

  // 4. CONTACT MATCH
  if (externalEmails.length > 0) {
    const { data: cm } = await supabaseAdmin.from("contacts").select("id, crm_company_id, email").in("email", externalEmails).limit(10);
    if (cm && cm.length > 0) {
      result.matched = true; result.matchType = "contact"; result.matchSource = `Contact email match: ${cm[0].email}`;
      result.contactId = cm[0].id; result.crmCompanyId = cm[0].crm_company_id || null; result.callType = "Contact Call"; result.confidence = 60;
      const { data: cd } = await supabaseAdmin.from("contact_deals").select("deal_id").eq("contact_id", cm[0].id);
      if (cd) result.dealIds = cd.map(d => d.deal_id);
      return result;
    }
  }

  return result;
}

// ─── Helper functions ────────────────────────────────────

async function fetchStoredMeetingParticipants(
  supabaseAdmin: ReturnType<typeof createClient>,
  meetingId: string,
): Promise<ClassifiedParticipant[]> {
  const { data } = await supabaseAdmin
    .from("claap_meeting_participants")
    .select("name, email, domain, is_internal")
    .eq("meeting_id", meetingId);

  return (data || []).map((p: any) => ({
    name: p.name || "", email: p.email || "",
    domain: p.domain || "", is_internal: !!p.is_internal,
  }));
}

async function resolveDealIdFromMatchResult(
  supabaseAdmin: ReturnType<typeof createClient>,
  matchResult: MatchResult,
): Promise<string | null> {
  // Don't auto-resolve ambiguous matches
  if (matchResult.ambiguous) return null;

  if (matchResult.dealIds.length === 1) return matchResult.dealIds[0];

  if (matchResult.dealIds.length === 0 && matchResult.crmCompanyId) {
    const { data: crmCo } = await supabaseAdmin.from("crm_companies").select("name").eq("id", matchResult.crmCompanyId).single();
    if (crmCo?.name) {
      const { data: deals } = await supabaseAdmin.from("deals").select("id").or("status.is.null,status.neq.archived").ilike("company", `%${crmCo.name}%`).limit(2);
      if (deals && deals.length === 1) return deals[0].id;
    }
  }
  return null;
}

async function linkMeetingToDeal(
  supabaseAdmin: ReturnType<typeof createClient>,
  meeting: StoredClaapMeeting,
  resolvedDealId: string,
  matchResult: MatchResult,
  source: "backfill" | "rematch",
) {
  const matchCandidates = matchResult.ambiguous
    ? matchResult.dealIds.map((id, i) => ({ deal_id: id, rank: i + 1 }))
    : null;

  await supabaseAdmin.from("claap_meetings").update({
    deal_id: resolvedDealId, status: "routed",
    call_type: matchResult.callType, match_source: matchResult.matchSource,
    matched_lender_id: matchResult.lenderId, matched_contact_id: matchResult.contactId,
    matched_crm_company_id: matchResult.crmCompanyId,
    match_method: "auto",
    match_confidence: matchResult.confidence,
    match_reason: matchResult.matchSource,
    match_candidates: matchCandidates,
    match_status: matchResult.ambiguous ? "needs_review" : "matched",
    matched_at: new Date().toISOString(),
  }).eq("id", meeting.id);

  // Audit trail
  await supabaseAdmin.from("claap_match_audit").insert({
    meeting_id: meeting.id,
    action: source === "rematch" ? "auto_rematch" : "auto_match",
    previous_deal_id: meeting.deal_id || null,
    new_deal_id: resolvedDealId,
    previous_status: meeting.deal_id ? "matched" : "unmatched",
    new_status: matchResult.ambiguous ? "needs_review" : "matched",
    match_method: "auto",
    match_confidence: matchResult.confidence,
    match_reason: matchResult.matchSource,
  });

  await supabaseAdmin.from("deal_claap_recordings").upsert({
    deal_id: resolvedDealId, recording_id: meeting.claap_id,
    recording_title: meeting.title, recording_url: meeting.recording_url,
    duration_seconds: meeting.duration_seconds, recorder_email: meeting.organizer_email,
    notes: `Auto-linked by ${source} (${matchResult.matchType || "matched"}: ${matchResult.callType || "matched"})`,
  }, { onConflict: "deal_id,recording_id" });

  const { data: existingActivity } = await supabaseAdmin.from("activity_logs").select("id")
    .eq("deal_id", resolvedDealId).eq("activity_type", "claap_recording_linked")
    .contains("metadata", { claap_id: meeting.claap_id }).maybeSingle();

  if (!existingActivity) {
    await supabaseAdmin.from("activity_logs").insert({
      deal_id: resolvedDealId, activity_type: "claap_recording_linked",
      description: `Claap recording linked (${source}): ${meeting.title || "Untitled"} (${matchResult.matchType || "matched"}: ${matchResult.callType || "matched"})`,
      metadata: {
        claap_id: meeting.claap_id, recording_url: meeting.recording_url,
        source, match_type: matchResult.matchType, call_type: matchResult.callType,
        match_source: matchResult.matchSource, confidence: matchResult.confidence,
      },
    });
  }

  if (meeting.transcript || meeting.title) {
    await supabaseAdmin.from("claap_transcripts").upsert({
      deal_id: resolvedDealId, claap_meeting_id: meeting.id,
      transcript_text: meeting.transcript || null, duration_seconds: meeting.duration_seconds,
      recorded_at: meeting.started_at, call_type: matchResult.callType, match_source: matchResult.matchSource,
    }, { onConflict: "claap_meeting_id" });
  }
}

async function rematchStoredMeeting(
  supabaseAdmin: ReturnType<typeof createClient>,
  meeting: StoredClaapMeeting,
  configCompanyId: string | null,
  source: "backfill" | "rematch",
  participantsOverride?: ClassifiedParticipant[],
) {
  const participants = participantsOverride || await fetchStoredMeetingParticipants(supabaseAdmin, meeting.id);
  const matchResult = await runSmartMatching(supabaseAdmin, meeting.title, participants, configCompanyId || meeting.company_id || null);

  console.log(`Re-match result for "${meeting.title || "(no title)"}": matched=${matchResult.matched}, type=${matchResult.matchType}, confidence=${matchResult.confidence}, ambiguous=${matchResult.ambiguous}`);

  if (!matchResult.matched) return { rematched: false, matchResult, resolvedDealId: null };

  const resolvedDealId = await resolveDealIdFromMatchResult(supabaseAdmin, matchResult);
  if (!resolvedDealId) return { rematched: false, matchResult, resolvedDealId: null };

  await linkMeetingToDeal(supabaseAdmin, meeting, resolvedDealId, matchResult, source);
  return { rematched: true, matchResult, resolvedDealId };
}

// ─── Main handler ────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json();
    const parsedDaysBack = Number(body.days_back);
    const daysBack = Number.isFinite(parsedDaysBack) && parsedDaysBack > 0 ? parsedDaysBack : 365;
    const parsedBatchSize = Number(body.batch_size);
    const batchSize = Number.isFinite(parsedBatchSize) && parsedBatchSize > 0
      ? Math.min(Math.floor(parsedBatchSize), 100)
      : 20;
    const cursor = typeof body.cursor === "string" && body.cursor.trim().length > 0 ? body.cursor : null;
    const timeBudgetMs = body.time_budget_ms || 50000;
    const rematchExistingOnly = body.rematch_existing_only === true;
    const startTime = Date.now();

    const claapApiKey = Deno.env.get("CLAAP_API_KEY");
    if (!claapApiKey) {
      return new Response(JSON.stringify({ ok: false, error: "CLAAP_API_KEY not configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Backfill is LOW-priority. Bail out early if quota-protect mode is on so
    // we don't burn the daily budget on historical recordings.
    const _gate = await shouldDefer("low");
    if (_gate.defer) {
      return new Response(JSON.stringify({
        ok: false, deferred: true,
        reason: _gate.quota.outOfQuota ? "out_of_quota" : "quota_protect",
        quota: _gate.quota,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const companyId = body.company_id;
    let internalDomains = ["5thlinefinancing.com", "5thline.co"];
    let minDurationSeconds = 300;
    let excludedTitlePatterns = ["5th Line Weekly", "Partners Meeting", "Joint Work", "All Hands", "Monthly Insights", "Quarterly Insights"];
    let syncAllCalls = false;

    if (companyId) {
      const { data: configData } = await supabaseAdmin.from("claap_integration_config").select("*").eq("company_id", companyId).maybeSingle();
      if (configData) {
        if (configData.internal_domains?.length) internalDomains = configData.internal_domains;
        minDurationSeconds = configData.min_duration_seconds || 300;
        if (configData.excluded_title_patterns?.length) excludedTitlePatterns = configData.excluded_title_patterns;
        syncAllCalls = configData.sync_all_calls || false;
      }
    }

    let processed = 0;
    let matched = 0;
    let skipped = 0;
    let skippedInternalOnly = 0;
    let unmatched = 0;
    let alreadyExists = 0;
    let errors = 0;
    let rematched = 0;
    let totalRecordsRetrieved = 0;
    const errorDetails: Array<{ claap_id: string; title: string | null; error: string }> = [];
    const processedTitles: string[] = [];

    console.log("Claap historical sync started", {
      companyId,
      daysBack,
      batchSize,
      cursor,
      rematchExistingOnly,
      timeBudgetMs,
      syncAllCalls,
    });

    // ─── Rematch existing only ───
    if (rematchExistingOnly) {
      let existingQuery = supabaseAdmin.from("claap_meetings")
        .select("id, claap_id, title, recording_url, transcript, organizer_email, duration_seconds, started_at, company_id, deal_id, manually_locked")
        .is("deal_id", null).eq("manually_locked", false).order("created_at", { ascending: false }).limit(Math.max(batchSize, 200));
      if (companyId) existingQuery = existingQuery.eq("company_id", companyId);

      const { data: existingMeetings, error: existingError } = await existingQuery;
      if (existingError) throw existingError;

      let skippedQuery = supabaseAdmin.from("claap_skipped_calls")
        .select("id, claap_id, title, recording_url, organizer_email, duration_seconds, started_at, company_id, participants, skip_reason")
        .eq("force_synced", false).order("created_at", { ascending: false }).limit(200);
      if (companyId) skippedQuery = skippedQuery.eq("company_id", companyId);

      const { data: skippedCalls } = await skippedQuery;

      for (const meeting of (existingMeetings || []) as StoredClaapMeeting[]) {
        if (Date.now() - startTime > timeBudgetMs) break;
        processedTitles.push(meeting.title || "(no title)");

        try {
          const result = await rematchStoredMeeting(supabaseAdmin, meeting, companyId, "rematch");
          if (result.rematched) { matched++; rematched++; } else { skipped++; }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          errorDetails.push({ claap_id: meeting.claap_id, title: meeting.title, error: errMsg });
          errors++;
        }
        processed++;
      }

      for (const sc of (skippedCalls || [])) {
        if (Date.now() - startTime > timeBudgetMs) break;

        if (sc.skip_reason && !sc.skip_reason.includes("No matching")) continue;

        const participants = (sc.participants as ClassifiedParticipant[]) || [];
        const matchResult = await runSmartMatching(supabaseAdmin, sc.title, participants, companyId);

        if (matchResult.matched && !matchResult.ambiguous) {
          const resolvedDealId = await resolveDealIdFromMatchResult(supabaseAdmin, matchResult);
          if (resolvedDealId) {
            const { data: newMeeting } = await supabaseAdmin.from("claap_meetings").upsert({
              claap_id: sc.claap_id, title: sc.title, recording_url: sc.recording_url,
              organizer_email: sc.organizer_email, duration_seconds: sc.duration_seconds,
              started_at: sc.started_at, company_id: sc.company_id, status: "routed",
              call_type: matchResult.callType, match_source: matchResult.matchSource,
              matched_lender_id: matchResult.lenderId, matched_crm_company_id: matchResult.crmCompanyId,
              matched_contact_id: matchResult.contactId, deal_id: resolvedDealId,
              match_method: "auto", match_confidence: matchResult.confidence,
              match_reason: matchResult.matchSource, match_status: "matched",
              matched_at: new Date().toISOString(),
            }, { onConflict: "claap_id" }).select("id").single();

            if (newMeeting) {
              if (participants.length > 0) {
                await supabaseAdmin.from("claap_meeting_participants").insert(
                  participants.map(p => ({ meeting_id: newMeeting.id, name: p.name, email: p.email, domain: p.domain, is_internal: p.is_internal }))
                );
              }

              await supabaseAdmin.from("deal_claap_recordings").upsert({
                deal_id: resolvedDealId, recording_id: sc.claap_id,
                recording_title: sc.title, recording_url: sc.recording_url,
                duration_seconds: sc.duration_seconds, recorder_email: sc.organizer_email,
                notes: `Auto-linked by re-match from skipped (${matchResult.matchType}: ${matchResult.callType})`,
              }, { onConflict: "deal_id,recording_id" });

              await supabaseAdmin.from("claap_skipped_calls").delete().eq("id", sc.id);

              matched++; rematched++;
            }
          }
        }
        processed++;
      }

      console.log("Claap rematch completed", {
        companyId,
        processed,
        matched,
        rematched,
        skipped,
        errors,
        elapsedMs: Date.now() - startTime,
      });

      return new Response(JSON.stringify({
        ok: true,
        processed,
        matched,
        rematched,
        skipped,
        skipped_internal_only: skippedInternalOnly,
        unmatched,
        already_exists: alreadyExists,
        errors,
        error_details: errorDetails,
        processed_titles: processedTitles,
        total_in_batch: (existingMeetings?.length || 0) + (skippedCalls?.length || 0),
        records_returned: 0,
        total_records_retrieved: totalRecordsRetrieved,
        pages_processed: 0,
        page_size: batchSize,
        next_cursor: null,
        has_more: false,
        elapsed_ms: Date.now() - startTime,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── Full backfill from Claap API ───
    const sinceDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
    const apiUrl = new URL("https://api.claap.io/v1/recordings");
    apiUrl.searchParams.set("limit", String(batchSize));
    apiUrl.searchParams.set("createdAfter", sinceDate);
    apiUrl.searchParams.set("sort", "created_desc");
    if (cursor) apiUrl.searchParams.set("cursor", cursor);

    console.log("Claap historical sync requesting page", {
      companyId,
      requestedDateWindowStart: sinceDate,
      batchSize,
      cursor,
      url: apiUrl.toString(),
    });

    const claapResp = await fetch(apiUrl.toString(), {
      headers: { "X-Claap-Key": claapApiKey, "Content-Type": "application/json" },
    });
    await recordClaapListCall();

    if (!claapResp.ok) {
      const errText = await claapResp.text();
      return new Response(JSON.stringify({ ok: false, error: `Claap API error: ${claapResp.status}`, detail: errText }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const claapData = await claapResp.json();
    const resultNode = claapData?.result && typeof claapData.result === "object" ? claapData.result : {};
    const pagination = resultNode?.pagination && typeof resultNode.pagination === "object"
      ? resultNode.pagination
      : (claapData?.pagination && typeof claapData.pagination === "object" ? claapData.pagination : {});
    const recordings = Array.isArray(resultNode?.recordings)
      ? resultNode.recordings
      : Array.isArray(claapData?.recordings)
        ? claapData.recordings
        : Array.isArray(claapData?.data)
          ? claapData.data
          : [];

    const nextCursorRaw = pagination?.nextCursor
      ?? pagination?.next_cursor
      ?? resultNode?.nextCursor
      ?? resultNode?.next_cursor
      ?? claapData?.nextCursor
      ?? claapData?.next_cursor
      ?? claapData?.cursor
      ?? null;
    const nextCursor = typeof nextCursorRaw === "string" && nextCursorRaw.trim().length > 0 ? nextCursorRaw : null;
    const totalCount = Number.isFinite(Number(pagination?.totalCount ?? pagination?.total_count))
      ? Number(pagination?.totalCount ?? pagination?.total_count)
      : null;

    totalRecordsRetrieved = recordings.length;

    console.log("Claap historical sync received page", {
      companyId,
      requestedDateWindowStart: sinceDate,
      batchSize,
      cursor,
      returnedCount: recordings.length,
      totalCount,
      nextCursor,
      hasMore: !!nextCursor,
    });

    for (const recording of recordings) {
      const claapId = recording.id;
      if (!claapId) {
        errors++;
        continue;
      }

      const title = recording.title || recording.name || recording.topic || null;
      const organizerEmail = recording.recorder?.email || recording.organizer?.email || null;
      const rawDuration = recording.duration_seconds || recording.durationSeconds || null;
      const durationSeconds = rawDuration != null ? Math.floor(Number(rawDuration)) : null;
      const recordingUrl = recording.url || recording.video_url || recording.videoUrl || recording.video?.url || null;
      const startedAt = recording.meeting?.startingAt || recording.started_at || recording.created_at || recording.createdAt || null;
      const participants = recording.meeting?.participants || recording.participants || [];

      processedTitles.push(title || "(no title)");

      const classifiedParticipants = participants.map((p: any) => {
        const email = p.email || "";
        const domain = email.split("@")[1]?.toLowerCase() || "";
        return {
          name: p.name || "",
          email,
          domain,
          is_internal: domain ? internalDomains.some(d => domain === d.toLowerCase()) : false,
        };
      });

      const identifiableParticipants = classifiedParticipants.filter((p) => !!p.email);
      const hasExternalParticipant = identifiableParticipants.some((p) => !p.is_internal);
      // Guests joining from a conference room, a dial-in, or an unshared
      // calendar have a name but no email. They are NOT internal — treating
      // them as such made real client calls (e.g. a kick-off dialed in from
      // the client's meeting room) get skipped as "all participants internal"
      // and never mirrored, so nothing could auto-link them later.
      const hasUnidentifiedParticipant = classifiedParticipants.some((p) => !p.email);
      const allIdentifiableParticipantsInternal = identifiableParticipants.length > 0
        && identifiableParticipants.every((p) => p.is_internal);

      const { data: existing } = await supabaseAdmin.from("claap_meetings")
        .select("id, claap_id, title, recording_url, transcript, organizer_email, duration_seconds, started_at, company_id, deal_id")
        .eq("claap_id", claapId).maybeSingle();

      const { data: existingSkipped } = await supabaseAdmin.from("claap_skipped_calls").select("id").eq("claap_id", claapId).maybeSingle();

      if (existing && !existing.deal_id) {
        try {
          const rematchResult = await rematchStoredMeeting(supabaseAdmin, {
            ...(existing as StoredClaapMeeting), title: existing.title || title,
            recording_url: existing.recording_url || recordingUrl,
            organizer_email: existing.organizer_email || organizerEmail,
            duration_seconds: existing.duration_seconds ?? durationSeconds,
            started_at: existing.started_at || startedAt,
          }, companyId, "backfill", classifiedParticipants);

          if (rematchResult.rematched) {
            if (existingSkipped?.id) await supabaseAdmin.from("claap_skipped_calls").delete().eq("id", existingSkipped.id);
            matched++;
            rematched++;
            processed++;
            continue;
          }
        } catch (err) {
          errorDetails.push({ claap_id: claapId, title, error: err instanceof Error ? err.message : String(err) });
          errors++;
          processed++;
          continue;
        }
      }

      if (existing) {
        alreadyExists++;
        processed++;
        continue;
      }

      try {
        let excluded = false;
        let exclusionReason = "";

        if (allIdentifiableParticipantsInternal && !hasExternalParticipant && !hasUnidentifiedParticipant) {
          excluded = true;
          exclusionReason = "All participants are internal";
          skippedInternalOnly++;
        }

        if (!excluded && title) {
          const tl = title.toLowerCase().trim();
          for (const pattern of excludedTitlePatterns) {
            if (tl.includes(pattern.toLowerCase())) {
              excluded = true;
              exclusionReason = `Title matches excluded pattern: "${pattern}"`;
              break;
            }
          }
        }

        if (!excluded && durationSeconds && durationSeconds < minDurationSeconds) {
          excluded = true;
          exclusionReason = `Duration (${durationSeconds}s) under minimum (${minDurationSeconds}s)`;
        }

        if (excluded) {
          await supabaseAdmin.from("claap_skipped_calls").upsert({
            claap_id: claapId, company_id: companyId, title, recording_url: recordingUrl,
            duration_seconds: durationSeconds, organizer_email: organizerEmail,
            participants: classifiedParticipants, started_at: startedAt,
            skip_reason: exclusionReason, match_attempts: { stage: "basic_filter", source: "backfill" },
          }, { onConflict: "claap_id" });
          skipped++;
          processed++;
          continue;
        }

        const matchResult = await runSmartMatching(supabaseAdmin, title, classifiedParticipants, companyId);

        if (!matchResult.matched && !syncAllCalls) {
          await supabaseAdmin.from("claap_skipped_calls").upsert({
            claap_id: claapId, company_id: companyId, title, recording_url: recordingUrl,
            duration_seconds: durationSeconds, organizer_email: organizerEmail,
            participants: classifiedParticipants, started_at: startedAt,
            skip_reason: "No matching deal, lender, company, or contact found",
            match_attempts: { stage: "smart_matching", source: "backfill" },
          }, { onConflict: "claap_id" });
          unmatched++;
          skipped++;
          processed++;
          continue;
        }

        let transcript: string | null = null;

        // Hydrate-once: if we already stored a transcript for this recording,
        // skip the Claap fetch entirely.
        const { data: existingRec } = await supabaseAdmin
          .from("claap_recordings")
          .select("id, hydration_complete, transcript_available")
          .eq("external_id", claapId)
          .maybeSingle();
        const alreadyHydrated = !!existingRec?.hydration_complete;

        // Also stop calling Claap if quota flipped mid-run.
        const _midQuota = await getQuotaStatus();
        const _canCall = !alreadyHydrated && !_midQuota.outOfQuota;

        try {
         if (_canCall) {
          const txResp = await fetch(`https://api.claap.io/v1/recordings/${claapId}/transcript?format=text`, {
            headers: { "X-Claap-Key": claapApiKey, "Content-Type": "application/json" },
          });
          if (txResp.ok) {
            const ct = txResp.headers.get("content-type") || "";
            if (ct.includes("application/json")) {
              const txData = await txResp.json();
              transcript = txData.result?.transcript || txData.transcript || null;
            } else {
              transcript = await txResp.text();
            }
            await supabaseAdmin.rpc("claap_record_api_call", { _count: 1 });
          } else if (txResp.status === 429) {
            await supabaseAdmin.rpc("claap_mark_rate_limited");
            await supabaseAdmin.rpc("claap_record_api_call", { _count: 1 });
            await txResp.text();
          } else {
            await txResp.text();
            await supabaseAdmin.rpc("claap_record_api_call", { _count: 1 });
          }
         }
        } catch (e) {
          console.error(`Failed to fetch transcript for ${claapId}:`, e);
        }

        const meetingRecord: Record<string, unknown> = {
          claap_id: claapId, title, recording_url: recordingUrl, transcript,
          organizer_email: organizerEmail, duration_seconds: durationSeconds,
          started_at: startedAt, transcript_missing: !transcript, company_id: companyId,
          status: "pending_review",
          call_type: matchResult.callType || (syncAllCalls ? "Unmatched (sync all)" : null),
          match_source: matchResult.matchSource || (syncAllCalls ? "Synced via backfill (sync all)" : null),
          matched_lender_id: matchResult.lenderId, matched_crm_company_id: matchResult.crmCompanyId,
          matched_contact_id: matchResult.contactId,
        };

        const { data: meeting, error: meetingError } = await supabaseAdmin.from("claap_meetings")
          .upsert(meetingRecord, { onConflict: "claap_id" }).select("id").single();

        if (meetingError) {
          errorDetails.push({ claap_id: claapId, title, error: meetingError.message });
          errors++;
          processed++;
          continue;
        }

        if (classifiedParticipants.length > 0) {
          await supabaseAdmin.from("claap_meeting_participants").insert(
            classifiedParticipants.map((p: any) => ({
              meeting_id: meeting.id, name: p.name, email: p.email, domain: p.domain, is_internal: p.is_internal,
            }))
          );
        }

        const resolvedDealId = await resolveDealIdFromMatchResult(supabaseAdmin, matchResult);

        if (resolvedDealId) {
          await linkMeetingToDeal(supabaseAdmin, {
            id: meeting.id, claap_id: claapId, title, recording_url: recordingUrl,
            transcript, organizer_email: organizerEmail, duration_seconds: durationSeconds,
            started_at: startedAt, company_id: companyId,
          }, resolvedDealId, matchResult, "backfill");

          if (transcript || title) {
            await supabaseAdmin.from("claap_transcripts").upsert({
              deal_id: resolvedDealId, claap_meeting_id: meeting.id,
              transcript_text: transcript || null,
              participants: classifiedParticipants.map((p: any) => ({ name: p.name, email: p.email, is_internal: p.is_internal })),
              duration_seconds: durationSeconds, recorded_at: startedAt,
              call_type: matchResult.callType, match_source: matchResult.matchSource,
            }, { onConflict: "claap_meeting_id" });
          }

          if (existingSkipped?.id) await supabaseAdmin.from("claap_skipped_calls").delete().eq("id", existingSkipped.id);
        }

        matched++;
        processed++;
      } catch (err) {
        errorDetails.push({ claap_id: claapId, title: recording.title || null, error: err instanceof Error ? err.message : String(err) });
        errors++;
        processed++;
      }
    }

    console.log("Claap historical sync completed page", {
      companyId,
      requestedDateWindowStart: sinceDate,
      batchSize,
      cursor,
      nextCursor,
      returnedCount: recordings.length,
      totalCount,
      processed,
      matched,
      rematched,
      unmatched,
      skipped,
      skippedInternalOnly,
      alreadyExists,
      errors,
      elapsedMs: Date.now() - startTime,
    });

    return new Response(JSON.stringify({
      ok: true,
      processed,
      matched,
      rematched,
      skipped,
      skipped_internal_only: skippedInternalOnly,
      unmatched,
      already_exists: alreadyExists,
      errors,
      error_details: errorDetails,
      processed_titles: processedTitles,
      total_in_batch: recordings.length,
      records_returned: recordings.length,
      total_records_retrieved: totalRecordsRetrieved,
      claap_total_count: totalCount,
      pages_processed: 1,
      page_size: batchSize,
      requested_date_window_start: sinceDate,
      requested_days_back: daysBack,
      next_cursor: nextCursor,
      has_more: !!nextCursor,
      elapsed_ms: Date.now() - startTime,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: unknown) {
    console.error("Claap backfill error:", error);
    return new Response(JSON.stringify({
      ok: false, error: error instanceof Error ? error.message : "Unknown error",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
