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

async function runSmartMatching(
  supabaseAdmin: ReturnType<typeof createClient>,
  title: string | null,
  participants: Array<{ name: string; email: string; domain: string; is_internal: boolean }>,
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

    let processed = 0, matched = 0, skipped = 0, alreadyExists = 0, errors = 0;
    const errorDetails: Array<{ claap_id: string; title: string | null; error: string }> = [];
    const processedTitles: string[] = [];

    console.log(`Backfill: fetched ${recordings.length} recordings from Claap API`);

    for (const recording of recordings) {
      // Check time budget
      if (Date.now() - startTime > timeBudgetMs) {
        console.log(`Time budget reached after ${processed} recordings`);
        break;
      }

      const claapId = recording.id;
      if (!claapId) { errors++; continue; }

      // Dedup check
      const { data: existing } = await supabaseAdmin
        .from("claap_meetings")
        .select("id")
        .eq("claap_id", claapId)
        .maybeSingle();

      if (existing) { alreadyExists++; processed++; continue; }

      // Also check skipped calls
      const { data: existingSkipped } = await supabaseAdmin
        .from("claap_skipped_calls")
        .select("id")
        .eq("claap_id", claapId)
        .maybeSingle();

      if (existingSkipped) { alreadyExists++; processed++; continue; }

      try {
        const title = recording.title || recording.name || recording.topic || null;
        const organizerEmail = recording.recorder?.email || recording.organizer?.email || null;
        const rawDuration = recording.duration_seconds || recording.durationSeconds || null;
        const durationSeconds = rawDuration != null ? Math.floor(Number(rawDuration)) : null;
        const recordingUrl = recording.url || recording.video_url || recording.videoUrl || null;
        const startedAt = recording.meeting?.startingAt || recording.started_at || recording.created_at || recording.createdAt || null;
        const participants = recording.meeting?.participants || recording.participants || [];

        processedTitles.push(title || "(no title)");
        console.log(`Processing: "${title}" | duration=${rawDuration} | claap_id=${claapId} | participants=${participants.length}`);

        // Classify participants
        const classifiedParticipants = participants.map((p: any) => {
          const email = p.email || "";
          const domain = email.split("@")[1]?.toLowerCase() || "";
          return {
            name: p.name || "",
            email,
            domain,
            is_internal: internalDomains.some(d => domain === d.toLowerCase()),
          };
        });

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

        if (!matchResult.matched && !syncAllCalls) {
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
            const txData = await txResp.json();
            transcript = txData.result?.transcript || null;
          }
        } catch (e) {
          console.error(`Failed to fetch transcript for ${claapId}:`, e);
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

        if (meetingError) { console.error("Meeting insert error:", meetingError); errors++; processed++; continue; }
        const meetingId = meeting.id;

        // Insert participants
        if (classifiedParticipants.length > 0) {
          await supabaseAdmin.from("claap_meeting_participants").insert(
            classifiedParticipants.map((p: any) => ({
              meeting_id: meetingId, name: p.name, email: p.email, domain: p.domain, is_internal: p.is_internal,
            })),
          );
        }

        // Resolve deal
        let resolvedDealId: string | null = null;
        if (matchResult.dealIds.length === 1) {
          resolvedDealId = matchResult.dealIds[0];
        } else if (matchResult.dealIds.length === 0 && matchResult.crmCompanyId) {
          // Try to find deal by company name
          const { data: crmCo } = await supabaseAdmin
            .from("crm_companies").select("name").eq("id", matchResult.crmCompanyId).single();
          if (crmCo) {
            const { data: deals } = await supabaseAdmin
              .from("deals").select("id").eq("status", "active").ilike("company", `%${crmCo.name}%`).limit(2);
            if (deals && deals.length === 1) resolvedDealId = deals[0].id;
          }
        }

        if (resolvedDealId) {
          await supabaseAdmin.from("claap_meetings").update({ deal_id: resolvedDealId, status: "routed" }).eq("id", meetingId);

          // Link to deal recordings
          await supabaseAdmin.from("deal_claap_recordings").upsert({
            deal_id: resolvedDealId,
            recording_id: claapId,
            recording_title: title,
            recording_url: recordingUrl,
            duration_seconds: durationSeconds,
            recorder_name: recording.recorder?.name || null,
            recorder_email: organizerEmail,
            notes: `Auto-linked by backfill (${matchResult.callType || "matched"})`,
          }, { onConflict: "deal_id,recording_id" });

          // Activity log
          await supabaseAdmin.from("activity_logs").insert({
            deal_id: resolvedDealId,
            activity_type: "claap_recording_linked",
            description: `Claap recording linked (backfill): ${title || "Untitled"} (${matchResult.callType || "matched"})`,
            metadata: { claap_id: claapId, recording_url: recordingUrl, source: "backfill", call_type: matchResult.callType },
          });

          // Store transcript for AI copilot
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
        }

        matched++; processed++;
      } catch (err) {
        console.error(`Error processing recording ${claapId}:`, err);
        errors++; processed++;
      }
    }

    const hasMore = nextCursor && processed >= recordings.length && (Date.now() - startTime < timeBudgetMs);

    return new Response(JSON.stringify({
      ok: true,
      processed,
      matched,
      skipped,
      already_exists: alreadyExists,
      errors,
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
