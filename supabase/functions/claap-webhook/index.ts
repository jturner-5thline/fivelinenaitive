import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Always return 200 quickly; log errors for retry
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let payload: ClaapWebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: true, note: "invalid json" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const eventType = payload.event;
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

    // Fetch transcript if available
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
          const txData = await txResp.json();
          transcript = txData.result?.transcript || null;
        }
      } catch (e) {
        console.error("Failed to fetch transcript:", e);
      }
    }
    if (!transcript) transcriptMissing = true;

    // Resolve internal domains from config
    // Try to find config for the organizer's company
    let internalDomains = ["5thlinefinancing.com", "5thline.co"];
    let configCompanyId: string | null = null;
    let minDurationSeconds = 300;
    let excludedTitlePatterns = [
      "5th Line Weekly", "Partners Meeting", "Joint Work",
      "All Hands", "Monthly Insights", "Quarterly Insights"
    ];
    let fallbackAdminUserId: string | null = null;
    let taskExpiryDays = 7;

    if (organizerEmail) {
      // Find the organizer's company
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

    // Upsert meeting record
    const meetingRecord = {
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
      status: "pending_review" as const,
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

    // ==========================================
    // EXCLUSION FILTER
    // ==========================================
    let excluded = false;
    let exclusionReason = "";

    // 1. No external participants
    if (!hasExternalParticipant) {
      excluded = true;
      exclusionReason = "All participants are internal (no external participants)";
    }

    // 2. No internal participant
    if (!excluded && !hasInternalParticipant) {
      excluded = true;
      exclusionReason = "No internal participant found on the call";
      await supabaseAdmin
        .from("claap_meetings")
        .update({ no_internal_participant: true, status: "excluded", exclusion_reason: exclusionReason })
        .eq("id", meetingId);

      return new Response(JSON.stringify({ ok: true, meeting_id: meetingId, status: "excluded", reason: exclusionReason }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Title matches excluded patterns
    if (!excluded && data.title) {
      const titleLower = data.title.toLowerCase().trim();
      for (const pattern of excludedTitlePatterns) {
        if (titleLower.includes(pattern.toLowerCase())) {
          excluded = true;
          exclusionReason = `Title matches excluded pattern: "${pattern}"`;
          break;
        }
      }
    }

    // 4. Duration under threshold
    if (!excluded && data.durationSeconds && data.durationSeconds < minDurationSeconds) {
      excluded = true;
      exclusionReason = `Duration (${data.durationSeconds}s) under minimum (${minDurationSeconds}s)`;
    }

    if (excluded) {
      await supabaseAdmin
        .from("claap_meetings")
        .update({ status: "excluded", exclusion_reason: exclusionReason })
        .eq("id", meetingId);

      return new Response(JSON.stringify({ ok: true, meeting_id: meetingId, status: "excluded", reason: exclusionReason }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ==========================================
    // ROUTING ENGINE
    // ==========================================

    // Step 1: Detect meeting intent from title
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

    // Step 2: Resolve external participants to contacts
    const externalParticipants = classifiedParticipants.filter((p) => !p.is_internal);
    const unresolvedParticipants: typeof externalParticipants = [];
    const resolvedContactIds: string[] = [];

    for (const participant of externalParticipants) {
      if (!participant.email) {
        unresolvedParticipants.push(participant);
        continue;
      }
      // Look up profiles by email
      const { data: contact } = await supabaseAdmin
        .from("profiles")
        .select("id, user_id")
        .eq("email", participant.email)
        .maybeSingle();

      if (contact) {
        resolvedContactIds.push(contact.id);
        // Mark participant as resolved
        await supabaseAdmin
          .from("claap_meeting_participants")
          .update({ contact_id: contact.id, resolved: true })
          .eq("meeting_id", meetingId)
          .eq("email", participant.email);
      } else {
        unresolvedParticipants.push(participant);
      }
    }

    // Step 3: Resolve company from external domains
    const externalDomains = [...new Set(externalParticipants.map((p) => p.domain).filter(Boolean))];
    let resolvedCompanyId: string | null = null;
    let unresolvedDomains: string[] = [];

    for (const domain of externalDomains) {
      // Try to match company by website_url containing the domain
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

    // If company name extracted from title, try matching by name
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

    // Step 4: Resolve deal
    let resolvedDealId: string | null = null;
    let multipleDealCandidates: string[] = [];

    if (resolvedCompanyId) {
      const { data: activeDeals } = await supabaseAdmin
        .from("deals")
        .select("id")
        .eq("company_id", resolvedCompanyId)
        .eq("status", "active")
        .limit(10);

      if (activeDeals && activeDeals.length === 1) {
        resolvedDealId = activeDeals[0].id;
      } else if (activeDeals && activeDeals.length > 1) {
        multipleDealCandidates = activeDeals.map((d) => d.id);
      }
    }

    // If no company resolved, try matching by deal company name
    if (!resolvedDealId && extractedCompanyName && !multipleDealCandidates.length) {
      const { data: dealMatch } = await supabaseAdmin
        .from("deals")
        .select("id, company_id")
        .ilike("company", `%${extractedCompanyName}%`)
        .eq("status", "active")
        .limit(10);

      if (dealMatch && dealMatch.length === 1) {
        resolvedDealId = dealMatch[0].id;
        resolvedCompanyId = resolvedCompanyId || dealMatch[0].company_id;
      } else if (dealMatch && dealMatch.length > 1) {
        multipleDealCandidates = dealMatch.map((d) => d.id);
      }
    }

    // Step 5: Resolve organizer (deal manager)
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

    // Determine final status
    let finalStatus: string;
    const needsTasks =
      unresolvedParticipants.length > 0 ||
      unresolvedDomains.length > 0 ||
      multipleDealCandidates.length > 0 ||
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

    // ==========================================
    // CREATE ROUTING TASKS
    // ==========================================

    const tasksToCreate: Array<Record<string, unknown>> = [];
    const expiresAt = new Date(Date.now() + taskExpiryDays * 24 * 60 * 60 * 1000).toISOString();

    // Contact confirmation tasks
    if (unresolvedParticipants.length > 0 && taskAssignee) {
      tasksToCreate.push({
        meeting_id: meetingId,
        task_type: "confirm_contact",
        assigned_to: taskAssignee,
        expires_at: expiresAt,
        prefilled_data: {
          participants: unresolvedParticipants.map((p) => ({
            name: p.name,
            email: p.email,
            domain: p.domain,
            suggested_company: extractedCompanyName || p.domain?.split(".")[0] || "",
          })),
        },
      });
    }

    // Company confirmation task
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

    // Deal disambiguation task
    if (multipleDealCandidates.length > 0 && taskAssignee) {
      tasksToCreate.push({
        meeting_id: meetingId,
        task_type: "disambiguate_deal",
        assigned_to: taskAssignee,
        expires_at: expiresAt,
        prefilled_data: {
          deal_ids: multipleDealCandidates,
          company_name: extractedCompanyName,
        },
      });
    }

    // Deal creation prompt
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

    // Trigger AI analysis asynchronously (non-blocking)
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

    return new Response(
      JSON.stringify({
        ok: true,
        meeting_id: meetingId,
        status: finalStatus,
        tasks_created: tasksToCreate.length,
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

    // Log error for retry
    try {
      await supabaseAdmin.from("claap_webhook_errors").insert({
        event_type: payload?.event || "unknown",
        payload: payload as unknown as Record<string, unknown>,
        error_message: error instanceof Error ? error.message : "Unknown error",
      });
    } catch (logErr) {
      console.error("Failed to log webhook error:", logErr);
    }

    // Return 200 to prevent Claap from retrying indefinitely
    return new Response(
      JSON.stringify({ ok: true, note: "error logged for retry" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
