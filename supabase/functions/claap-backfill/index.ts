import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
  matchType: "lender" | "company" | "contact" | "deal" | null;
  matchSource: string | null;
  lenderId: string | null;
  crmCompanyId: string | null;
  contactId: string | null;
  dealIds: string[];
  callType: string | null;
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

async function fetchStoredMeetingParticipants(
  supabaseAdmin: ReturnType<typeof createClient>,
  meetingId: string,
): Promise<ClassifiedParticipant[]> {
  const { data } = await supabaseAdmin
    .from("claap_meeting_participants")
    .select("name, email, domain, is_internal")
    .eq("meeting_id", meetingId);

  return (data || []).map((participant: any) => ({
    name: participant.name || "",
    email: participant.email || "",
    domain: participant.domain || "",
    is_internal: !!participant.is_internal,
  }));
}

async function resolveDealIdFromMatchResult(
  supabaseAdmin: ReturnType<typeof createClient>,
  matchResult: MatchResult,
): Promise<string | null> {
  if (matchResult.dealIds.length === 1) {
    return matchResult.dealIds[0];
  }

  if (matchResult.dealIds.length === 0 && matchResult.crmCompanyId) {
    const { data: crmCo } = await supabaseAdmin
      .from("crm_companies")
      .select("name")
      .eq("id", matchResult.crmCompanyId)
      .single();

    if (crmCo?.name) {
      const { data: deals } = await supabaseAdmin
        .from("deals")
        .select("id")
        .eq("status", "active")
        .ilike("company", `%${crmCo.name}%`)
        .limit(2);

      if (deals && deals.length === 1) {
        return deals[0].id;
      }
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
  await supabaseAdmin
    .from("claap_meetings")
    .update({
      deal_id: resolvedDealId,
      status: "routed",
      call_type: matchResult.callType,
      match_source: matchResult.matchSource,
      matched_lender_id: matchResult.lenderId,
      matched_contact_id: matchResult.contactId,
      matched_crm_company_id: matchResult.crmCompanyId,
    })
    .eq("id", meeting.id);

  await supabaseAdmin.from("deal_claap_recordings").upsert({
    deal_id: resolvedDealId,
    recording_id: meeting.claap_id,
    recording_title: meeting.title,
    recording_url: meeting.recording_url,
    duration_seconds: meeting.duration_seconds,
    recorder_email: meeting.organizer_email,
    notes: source === "rematch"
      ? `Auto-linked by re-match (${matchResult.callType || "matched"})`
      : `Auto-linked by backfill (${matchResult.callType || "matched"})`,
  }, { onConflict: "deal_id,recording_id" });

  const { data: existingActivity } = await supabaseAdmin
    .from("activity_logs")
    .select("id")
    .eq("deal_id", resolvedDealId)
    .eq("activity_type", "claap_recording_linked")
    .contains("metadata", { claap_id: meeting.claap_id })
    .maybeSingle();

  if (!existingActivity) {
    await supabaseAdmin.from("activity_logs").insert({
      deal_id: resolvedDealId,
      activity_type: "claap_recording_linked",
      description: source === "rematch"
        ? `Claap recording linked (re-matched): ${meeting.title || "Untitled"} (${matchResult.callType || "matched"})`
        : `Claap recording linked (backfill): ${meeting.title || "Untitled"} (${matchResult.callType || "matched"})`,
      metadata: {
        claap_id: meeting.claap_id,
        recording_url: meeting.recording_url,
        source,
        call_type: matchResult.callType,
      },
    });
  }

  if (meeting.transcript || meeting.title) {
    await supabaseAdmin.from("claap_transcripts").upsert({
      deal_id: resolvedDealId,
      claap_meeting_id: meeting.id,
      transcript_text: meeting.transcript || null,
      duration_seconds: meeting.duration_seconds,
      recorded_at: meeting.started_at,
      call_type: matchResult.callType,
      match_source: matchResult.matchSource,
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
  const matchResult = await runSmartMatching(
    supabaseAdmin,
    meeting.title,
    participants,
    configCompanyId || meeting.company_id || null,
  );

  console.log(
    `Re-match result for "${meeting.title || "(no title)"}": matched=${matchResult.matched}, type=${matchResult.matchType}, source=${matchResult.matchSource}`,
  );

  if (!matchResult.matched) {
    return { rematched: false, matchResult, resolvedDealId: null };
  }

  const resolvedDealId = await resolveDealIdFromMatchResult(supabaseAdmin, matchResult);
  if (!resolvedDealId) {
    return { rematched: false, matchResult, resolvedDealId: null };
  }

  await linkMeetingToDeal(supabaseAdmin, meeting, resolvedDealId, matchResult, source);
  return { rematched: true, matchResult, resolvedDealId };
}

async function runSmartMatching(
  supabaseAdmin: ReturnType<typeof createClient>,
  title: string | null,
  participants: ClassifiedParticipant[],
  configCompanyId: string | null,
): Promise<MatchResult> {
  const result: MatchResult = {
    matched: false, matchType: null, matchSource: null,
    lenderId: null, crmCompanyId: null, contactId: null,
    dealIds: [], callType: null,
  };

  const externalParticipants = participants.filter(p => !p.is_internal);
  const externalEmails = externalParticipants.map(p => p.email).filter(Boolean);
  const externalDomains = [...new Set(externalParticipants.map(p => p.domain).filter(Boolean))];
  const titleLower = (title || "").toLowerCase();

  // 1. Contact match
  if (externalEmails.length > 0) {
    const { data: contactMatches } = await supabaseAdmin
      .from("contacts").select("id, crm_company_id, email")
      .in("email", externalEmails).limit(10);
    if (contactMatches && contactMatches.length > 0) {
      const contact = contactMatches[0];
      result.matched = true; result.matchType = "contact";
      result.matchSource = `Contact email match: ${contact.email}`;
      result.contactId = contact.id; result.crmCompanyId = contact.crm_company_id || null;
      result.callType = "Contact Call";
      const { data: contactDeals } = await supabaseAdmin
        .from("contact_deals").select("deal_id").eq("contact_id", contact.id);
      if (contactDeals) result.dealIds = contactDeals.map(cd => cd.deal_id);
      return result;
    }
  }

  // 2. Company match
  for (const domain of externalDomains) {
    const { data: companyMatches } = await supabaseAdmin
      .from("crm_companies").select("id, name")
      .or(`domain.ilike.%${domain}%,additional_domains.cs.{${domain}}`).limit(5);
    if (companyMatches && companyMatches.length > 0) {
      const company = companyMatches[0];
      result.matched = true; result.matchType = "company";
      result.matchSource = `Company domain match: ${domain} → ${company.name}`;
      result.crmCompanyId = company.id; result.callType = "Company Call";
      const { data: deals } = await supabaseAdmin
        .from("deals").select("id").eq("status", "active").ilike("company", `%${company.name}%`).limit(5);
      if (deals) result.dealIds = deals.map(d => d.id);
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
          result.matched = true; result.matchType = "company";
          result.matchSource = `Company name in title: "${co.name}"`;
          result.crmCompanyId = co.id; result.callType = "Company Call";
          return result;
        }
        if (diceCoefficient(coName, normalizeName(title || "")) > 0.5) {
          result.matched = true; result.matchType = "company";
          result.matchSource = `Fuzzy company name match: "${co.name}"`;
          result.crmCompanyId = co.id; result.callType = "Company Call";
          return result;
        }
      }
    }
  }

  // 3. Lender match
  if (configCompanyId) {
    if (titleLower) {
      const { data: lenders } = await supabaseAdmin
        .from("master_lenders").select("id, name").eq("company_id", configCompanyId).limit(500);
      if (lenders) {
        for (const lender of lenders) {
          const lenderName = normalizeName(lender.name);
          if (lenderName.length >= 3 && titleLower.includes(lenderName)) {
            result.matched = true; result.matchType = "lender";
            result.matchSource = `Lender name in title: "${lender.name}"`;
            result.lenderId = lender.id; result.callType = "Lender Call";
            const { data: dealLenders } = await supabaseAdmin
              .from("deal_lenders").select("deal_id").eq("name", lender.name).limit(10);
            if (dealLenders) result.dealIds = dealLenders.map(dl => dl.deal_id);
            return result;
          }
          if (diceCoefficient(lenderName, normalizeName(title || "")) > 0.45) {
            result.matched = true; result.matchType = "lender";
            result.matchSource = `Fuzzy lender name match: "${lender.name}"`;
            result.lenderId = lender.id; result.callType = "Lender Call";
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
        result.matched = true; result.matchType = "lender";
        result.matchSource = `Lender contact domain match: ${domain}`;
        result.lenderId = lenderContacts[0].lender_id; result.callType = "Lender Call";
        return result;
      }
    }

    for (const participant of externalParticipants) {
      if (!participant.name) continue;
      const { data: lenderContacts } = await supabaseAdmin
        .from("lender_contacts").select("lender_id, name")
        .ilike("name", `%${participant.name}%`).limit(3);
      if (lenderContacts && lenderContacts.length > 0) {
        result.matched = true; result.matchType = "lender";
        result.matchSource = `Lender contact name match: ${participant.name}`;
        result.lenderId = lenderContacts[0].lender_id; result.callType = "Lender Call";
        return result;
      }
    }
  }

  // ---- 4. Deal name match (title contains deal company name) ----
  if (titleLower) {
    let dealQuery = supabaseAdmin
      .from("deals")
      .select("id, company")
      .eq("status", "active")
      .limit(500);
    if (configCompanyId) dealQuery = dealQuery.eq("company_id", configCompanyId);

    const { data: deals } = await dealQuery;
    if (deals) {
      for (const deal of deals) {
        if (!deal.company) continue;
        const dealName = normalizeName(deal.company);
        if (dealName.length >= 3 && titleLower.includes(dealName)) {
          result.matched = true; result.matchType = "deal";
          result.matchSource = `Deal name in title: "${deal.company}"`;
          result.dealIds = [deal.id]; result.callType = "Deal Call";
          return result;
        }
        if (dealName.length >= 4 && diceCoefficient(dealName, normalizeName(title || "")) > 0.5) {
          result.matched = true; result.matchType = "deal";
          result.matchSource = `Fuzzy deal name match: "${deal.company}"`;
          result.dealIds = [deal.id]; result.callType = "Deal Call";
          return result;
        }
      }
    }
  }

  return result;
}

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
    const daysBack = body.days_back || 45;
    const batchSize = body.batch_size || 20;
    const cursor = body.cursor || null; // pagination cursor from Claap API
    const timeBudgetMs = body.time_budget_ms || 50000; // 50s default
    const rematchExistingOnly = body.rematch_existing_only === true;
    const startTime = Date.now();

    const claapApiKey = Deno.env.get("CLAAP_API_KEY");
    if (!claapApiKey) {
      return new Response(JSON.stringify({ ok: false, error: "CLAAP_API_KEY not configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve company config
    const companyId = body.company_id;
    let internalDomains = ["5thlinefinancing.com", "5thline.co"];
    let minDurationSeconds = 300;
    let excludedTitlePatterns = [
      "5th Line Weekly", "Partners Meeting", "Joint Work",
      "All Hands", "Monthly Insights", "Quarterly Insights",
    ];
    let syncAllCalls = false;
    let fallbackAdminUserId: string | null = null;
    let taskExpiryDays = 7;

    if (companyId) {
      const { data: configData } = await supabaseAdmin
        .from("claap_integration_config")
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle();

      if (configData) {
        if (configData.internal_domains?.length) internalDomains = configData.internal_domains;
        minDurationSeconds = configData.min_duration_seconds || 300;
        if (configData.excluded_title_patterns?.length) excludedTitlePatterns = configData.excluded_title_patterns;
        syncAllCalls = configData.sync_all_calls || false;
        fallbackAdminUserId = configData.fallback_admin_user_id;
        taskExpiryDays = configData.task_expiry_days || 7;
      }
    }

    let processed = 0, matched = 0, skipped = 0, alreadyExists = 0, errors = 0, rematched = 0;
    const errorDetails: Array<{ claap_id: string; title: string | null; error: string }> = [];
    const processedTitles: string[] = [];

    if (rematchExistingOnly) {
      let existingQuery = supabaseAdmin
        .from("claap_meetings")
        .select("id, claap_id, title, recording_url, transcript, organizer_email, duration_seconds, started_at, company_id, deal_id")
        .is("deal_id", null)
        .order("created_at", { ascending: false })
        .limit(Math.max(batchSize, 200));

      if (companyId) {
        existingQuery = existingQuery.eq("company_id", companyId);
      }

      const { data: existingMeetings, error: existingError } = await existingQuery;
      if (existingError) {
        throw existingError;
      }

      for (const meeting of (existingMeetings || []) as StoredClaapMeeting[]) {
        if (Date.now() - startTime > timeBudgetMs) break;

        processedTitles.push(meeting.title || "(no title)");
        console.log(`Re-matching stored meeting: "${meeting.title || "(no title)"}"`);

        try {
          const result = await rematchStoredMeeting(
            supabaseAdmin,
            meeting,
            companyId,
            "rematch",
          );

          if (result.rematched) {
            matched++;
            rematched++;
          } else {
            skipped++;
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(`Error re-matching stored meeting ${meeting.claap_id}: ${errMsg}`);
          errorDetails.push({ claap_id: meeting.claap_id, title: meeting.title, error: errMsg });
          errors++;
        }

        processed++;
      }

      return new Response(JSON.stringify({
        ok: true,
        processed,
        matched,
        rematched,
        skipped,
        already_exists: alreadyExists,
        errors,
        error_details: errorDetails,
        processed_titles: processedTitles,
        total_in_batch: existingMeetings?.length || 0,
        next_cursor: null,
        has_more: false,
        elapsed_ms: Date.now() - startTime,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch recordings from Claap API
    const sinceDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
    let apiUrl = `https://api.claap.io/v1/recordings?limit=${batchSize}&created_after=${sinceDate}`;
    if (cursor) apiUrl += `&cursor=${cursor}`;

    const claapResp = await fetch(apiUrl, {
      headers: { "X-Claap-Key": claapApiKey, "Content-Type": "application/json" },
    });

    if (!claapResp.ok) {
      const errText = await claapResp.text();
      console.error("Claap API error:", claapResp.status, errText);
      return new Response(JSON.stringify({ ok: false, error: `Claap API error: ${claapResp.status}`, detail: errText }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const claapData = await claapResp.json();
    const recordings = claapData.result?.recordings || claapData.recordings || claapData.data || [];
    const nextCursor = claapData.result?.cursor || claapData.cursor || claapData.next_cursor || null;

    console.log(`Backfill: fetched ${recordings.length} recordings from Claap API`);

    for (const recording of recordings) {
      // Check time budget
      if (Date.now() - startTime > timeBudgetMs) {
        console.log(`Time budget reached after ${processed} recordings`);
        break;
      }

      const claapId = recording.id;
      if (!claapId) { errors++; continue; }

      const title = recording.title || recording.name || recording.topic || null;
      const organizerEmail = recording.recorder?.email || recording.organizer?.email || null;
      const rawDuration = recording.duration_seconds || recording.durationSeconds || null;
      const durationSeconds = rawDuration != null ? Math.floor(Number(rawDuration)) : null;
      const recordingUrl = recording.url || recording.video_url || recording.videoUrl || null;
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
          is_internal: internalDomains.some(d => domain === d.toLowerCase()),
        } as ClassifiedParticipant;
      });

      // Dedup check
      const { data: existing } = await supabaseAdmin
        .from("claap_meetings")
        .select("id, claap_id, title, recording_url, transcript, organizer_email, duration_seconds, started_at, company_id, deal_id")
        .eq("claap_id", claapId)
        .maybeSingle();

      // Also check skipped calls
      const { data: existingSkipped } = await supabaseAdmin
        .from("claap_skipped_calls")
        .select("id")
        .eq("claap_id", claapId)
        .maybeSingle();

      if (existing && !existing.deal_id) {
        console.log(`Existing unlinked meeting found for ${claapId}; attempting re-match`);
        try {
          const rematchResult = await rematchStoredMeeting(
            supabaseAdmin,
            {
              ...(existing as StoredClaapMeeting),
              title: existing.title || title,
              recording_url: existing.recording_url || recordingUrl,
              organizer_email: existing.organizer_email || organizerEmail,
              duration_seconds: existing.duration_seconds ?? durationSeconds,
              started_at: existing.started_at || startedAt,
            },
            companyId,
            "backfill",
            classifiedParticipants,
          );

          if (rematchResult.rematched) {
            if (existingSkipped?.id) {
              await supabaseAdmin.from("claap_skipped_calls").delete().eq("id", existingSkipped.id);
            }
            matched++;
            rematched++;
            processed++;
            continue;
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(`Failed to re-match existing meeting ${claapId}: ${errMsg}`);
          errorDetails.push({ claap_id: claapId, title, error: errMsg });
          errors++;
          processed++;
          continue;
        }
      }

      if (existing) { alreadyExists++; processed++; continue; }

      if (existingSkipped) {
        console.log(`Previously skipped call found for ${claapId}; retrying current matching logic`);
      }

      try {
        console.log(`Processing: "${title}" | duration=${rawDuration} | claap_id=${claapId} | participants=${participants.length}`);

        const hasExternal = classifiedParticipants.some((p: any) => !p.is_internal);
        const hasInternal = classifiedParticipants.some((p: any) => p.is_internal);

        // Basic exclusion filters
        let excluded = false;
        let exclusionReason = "";

        if (!hasExternal) { excluded = true; exclusionReason = "All participants are internal"; }
        if (!excluded && !hasInternal) { excluded = true; exclusionReason = "No internal participant found"; }

        if (!excluded && title) {
          const titleLower = title.toLowerCase().trim();
          for (const pattern of excludedTitlePatterns) {
            if (titleLower.includes(pattern.toLowerCase())) {
              excluded = true; exclusionReason = `Title matches excluded pattern: "${pattern}"`;
              break;
            }
          }
        }

        if (!excluded && durationSeconds && durationSeconds < minDurationSeconds) {
          excluded = true; exclusionReason = `Duration (${durationSeconds}s) under minimum (${minDurationSeconds}s)`;
        }

        if (excluded) {
          console.log(`  SKIPPED: "${title}" — ${exclusionReason}`);
          await supabaseAdmin.from("claap_skipped_calls").upsert({
            claap_id: claapId,
            company_id: companyId,
            title,
            recording_url: recordingUrl,
            duration_seconds: durationSeconds,
            organizer_email: organizerEmail,
            participants: classifiedParticipants,
            started_at: startedAt,
            skip_reason: exclusionReason,
            match_attempts: { stage: "basic_filter", source: "backfill" },
          }, { onConflict: "claap_id" });
          skipped++; processed++; continue;
        }

        // Smart matching
        const matchResult = await runSmartMatching(supabaseAdmin, title, classifiedParticipants, companyId);
        console.log(`  Match result for "${title}": matched=${matchResult.matched}, type=${matchResult.matchType}, source=${matchResult.matchSource}`);

        if (!matchResult.matched && !syncAllCalls) {
          console.log(`  NO MATCH: "${title}" — skipping`);
          await supabaseAdmin.from("claap_skipped_calls").upsert({
            claap_id: claapId,
            company_id: companyId,
            title,
            recording_url: recordingUrl,
            duration_seconds: durationSeconds,
            organizer_email: organizerEmail,
            participants: classifiedParticipants,
            started_at: startedAt,
            skip_reason: "No matching lender, company, or contact found",
            match_attempts: { stage: "smart_matching", source: "backfill" },
          }, { onConflict: "claap_id" });
          skipped++; processed++; continue;
        }

        // Fetch transcript
        let transcript: string | null = null;
        try {
          const txResp = await fetch(
            `https://api.claap.io/v1/recordings/${claapId}/transcript?format=text`,
            { headers: { "X-Claap-Key": claapApiKey, "Content-Type": "application/json" } },
          );
          if (txResp.ok) {
            const contentType = txResp.headers.get("content-type") || "";
            if (contentType.includes("application/json")) {
              const txData = await txResp.json();
              transcript = txData.result?.transcript || txData.transcript || null;
            } else {
              // Plain text response
              transcript = await txResp.text();
            }
          } else {
            await txResp.text(); // consume body
          }
        } catch (e) {
          console.error(`Failed to fetch transcript for ${claapId}:`, e instanceof Error ? e.message : e);
        }

        // Save meeting
        const meetingRecord: Record<string, unknown> = {
          claap_id: claapId,
          title,
          recording_url: recordingUrl,
          transcript,
          organizer_email: organizerEmail,
          duration_seconds: durationSeconds,
          started_at: startedAt,
          transcript_missing: !transcript,
          company_id: companyId,
          status: "pending_review",
          call_type: matchResult.callType || (syncAllCalls ? "Unmatched (sync all)" : null),
          match_source: matchResult.matchSource || (syncAllCalls ? "Synced via backfill (sync all)" : null),
          matched_lender_id: matchResult.lenderId,
          matched_crm_company_id: matchResult.crmCompanyId,
          matched_contact_id: matchResult.contactId,
        };

        const { data: meeting, error: meetingError } = await supabaseAdmin
          .from("claap_meetings")
          .upsert(meetingRecord, { onConflict: "claap_id" })
          .select("id")
          .single();

        if (meetingError) {
          const errMsg = `Meeting insert error for "${title}": ${meetingError.message} (code: ${meetingError.code})`;
          console.error(errMsg);
          errorDetails.push({ claap_id: claapId, title, error: errMsg });
          errors++; processed++; continue;
        }
        const meetingId = meeting.id;

        // Insert participants
        if (classifiedParticipants.length > 0) {
          await supabaseAdmin.from("claap_meeting_participants").insert(
            classifiedParticipants.map((p: any) => ({
              meeting_id: meetingId, name: p.name, email: p.email, domain: p.domain, is_internal: p.is_internal,
            })),
          );
        }

        const resolvedDealId = await resolveDealIdFromMatchResult(supabaseAdmin, matchResult);

        if (resolvedDealId) {
          await linkMeetingToDeal(
            supabaseAdmin,
            {
              id: meetingId,
              claap_id: claapId,
              title,
              recording_url: recordingUrl,
              transcript,
              organizer_email: organizerEmail,
              duration_seconds: durationSeconds,
              started_at: startedAt,
              company_id: companyId,
            },
            resolvedDealId,
            matchResult,
            "backfill",
          );

          if (transcript || title) {
            await supabaseAdmin.from("claap_transcripts").upsert({
              deal_id: resolvedDealId,
              claap_meeting_id: meetingId,
              transcript_text: transcript || null,
              participants: classifiedParticipants.map((p: any) => ({ name: p.name, email: p.email, is_internal: p.is_internal })),
              duration_seconds: durationSeconds,
              recorded_at: startedAt,
              call_type: matchResult.callType,
              match_source: matchResult.matchSource,
            }, { onConflict: "claap_meeting_id" });
          }

          if (existingSkipped?.id) {
            await supabaseAdmin.from("claap_skipped_calls").delete().eq("id", existingSkipped.id);
          }
        }

        matched++; processed++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`Error processing recording ${claapId}: ${errMsg}`);
        errorDetails.push({ claap_id: claapId, title: recording.title || recording.name || null, error: errMsg });
        errors++; processed++;
      }
    }

    const hasMore = nextCursor && processed >= recordings.length && (Date.now() - startTime < timeBudgetMs);

    return new Response(JSON.stringify({
      ok: true,
      processed,
      matched,
        rematched,
      skipped,
      already_exists: alreadyExists,
      errors,
      error_details: errorDetails,
      processed_titles: processedTitles,
      total_in_batch: recordings.length,
      next_cursor: nextCursor || null,
      has_more: !!nextCursor,
      elapsed_ms: Date.now() - startTime,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Claap backfill error:", error);
    return new Response(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
