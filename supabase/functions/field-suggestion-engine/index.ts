import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { callClaude } from "../_shared/claudeChat.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Default thresholds per field
const DEFAULT_THRESHOLDS: Record<string, number> = {
  job_title: 0.70,
  email: 0.85,
  phone_work: 0.80,
  phone_mobile: 0.80,
  company_name: 0.75,
  department: 0.70,
  seniority: 0.70,
  linkedin_url: 0.85,
  contact_type: 0.65,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { contact_id, source_type, source_id, email_data: incomingEmailData, company_id } = await req.json();
    let email_data = incomingEmailData;

    if (!contact_id || !source_type) {
      return new Response(
        JSON.stringify({ error: "contact_id and source_type are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // 1. Fetch contact record
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("*")
      .eq("id", contact_id)
      .single();

    if (contactError || !contact) {
      return new Response(
        JSON.stringify({ error: "Contact not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resolvedCompanyId = company_id || contact.org_company_id;
    if (!resolvedCompanyId) {
      return new Response(
        JSON.stringify({ error: "Could not determine company_id for contact" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load the org's active contact_type options + a domain-based heuristic
    // signal so Claude can propose a contact_type (Lender / Banker / Client /
    // Referral Source / Prospect / …). The heuristic is: if other contacts on
    // this org share the new contact's email domain, propose the most common
    // contact_type among them.
    const { data: activeTypes } = await supabase
      .from("contact_types")
      .select("name")
      .eq("company_id", resolvedCompanyId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    const allowedTypeNames: string[] = (activeTypes || [])
      .map((t: any) => String(t.name || "").trim())
      .filter(Boolean);

    let domainTypeHint: { type: string; count: number; domain: string } | null = null;
    const contactEmailForDomain = String(contact.email || "").toLowerCase().trim();
    const domainMatch = contactEmailForDomain.match(/@([^>\s]+)$/);
    const contactDomain = domainMatch ? domainMatch[1] : "";
    if (contactDomain && !contact.contact_type) {
      const { data: siblings } = await supabase
        .from("contacts")
        .select("contact_type")
        .eq("org_company_id", resolvedCompanyId)
        .ilike("email", `%@${contactDomain}`)
        .not("contact_type", "is", null)
        .neq("id", contact_id)
        .limit(50);
      const tally = new Map<string, number>();
      for (const s of siblings || []) {
        const t = String((s as any).contact_type || "").trim();
        if (!t) continue;
        tally.set(t, (tally.get(t) || 0) + 1);
      }
      let bestType = "";
      let bestCount = 0;
      for (const [t, c] of tally.entries()) {
        if (c > bestCount) { bestType = t; bestCount = c; }
      }
      if (bestType && bestCount >= 1) {
        domainTypeHint = { type: bestType, count: bestCount, domain: contactDomain };
      }
    }

    // For manual scans (or when no email payload was supplied), assemble recent
    // email + calendar activity for this contact's email so the AI has real
    // evidence to work with.
    let scanContext: { emailCount: number; eventCount: number; lookbackDays: number } | null = null;
    if (!email_data && contact.email) {
      const lookbackDays = 30;
      const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
      const contactEmail = String(contact.email).toLowerCase();

      const { data: recentEmails } = await supabase
        .from("emails")
        .select("subject, from_email, received_at, message_id")
        .ilike("from_email", contactEmail)
        .gte("received_at", since)
        .order("received_at", { ascending: false })
        .limit(15);

      const { data: recentEvents } = await supabase
        .from("calendar_events")
        .select("title, start_time, organizer_email, attendees")
        .gte("start_time", since)
        .order("start_time", { ascending: false })
        .limit(50);

      const eventsWithContact = (recentEvents || []).filter((ev: any) => {
        const arr: string[] = Array.isArray(ev.attendees) ? ev.attendees : [];
        return (
          arr.some((a) => typeof a === "string" && a.toLowerCase().includes(contactEmail)) ||
          (ev.organizer_email && String(ev.organizer_email).toLowerCase() === contactEmail)
        );
      });

      const emailLines = (recentEmails || []).map(
        (e: any) => `- [${e.received_at?.slice(0, 10)}] from ${e.from_email}: ${e.subject || "(no subject)"}`
      );
      const eventLines = eventsWithContact.map(
        (ev: any) => `- [${ev.start_time?.slice(0, 10)}] meeting "${ev.title || "(untitled)"}" organizer ${ev.organizer_email || "?"}`
      );

      scanContext = {
        emailCount: emailLines.length,
        eventCount: eventLines.length,
        lookbackDays,
      };

      if (emailLines.length || eventLines.length) {
        email_data = {
          from: contact.email,
          subject: `Activity scan (last ${lookbackDays} days)`,
          body_text: [
            "RECENT EMAILS:",
            emailLines.join("\n") || "(none)",
            "",
            "RECENT MEETINGS:",
            eventLines.join("\n") || "(none)",
          ].join("\n"),
          signature_block: "",
        };
      }
    }

    // If this is a manual scan and there is genuinely no activity to look at,
    // skip the AI call and report cleanly so the UI can show "No changes".
    if (!email_data && source_type === "manual_scan") {
      return new Response(
        JSON.stringify({
          suggestions_created: 0,
          suggestions_superseded: 0,
          suggestions: [],
          scanned_at: new Date().toISOString(),
          scan_context: scanContext,
          no_activity: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Fetch org thresholds
    const { data: thresholds } = await supabase
      .from("field_suggestion_thresholds")
      .select("field_name, min_confidence, is_enabled")
      .eq("company_id", resolvedCompanyId);

    const thresholdMap: Record<string, { min: number; enabled: boolean }> = {};
    for (const t of thresholds || []) {
      thresholdMap[t.field_name] = { min: Number(t.min_confidence), enabled: t.is_enabled };
    }

    // 3. Call AI to extract field suggestions
    const currentFields = {
      job_title: contact.job_title,
      email: contact.email,
      phone_work: contact.phone_work,
      phone_mobile: contact.phone_mobile,
      company_name: contact.full_name, // We'll use the CRM company name if available
      department: contact.department,
      seniority: contact.seniority,
      linkedin_url: contact.linkedin_url,
      contact_type: contact.contact_type,
    };

    const systemPrompt = `You are a CRM data extraction agent. Given an email or activity data and the current contact record, identify any field changes (job_title, email, phone_work, phone_mobile, department, seniority, linkedin_url, contact_type).

Return suggestions ONLY when you detect a clear change from the current value. Do not suggest values that match the current record.

For each suggestion, provide:
- field_name: one of job_title, email, phone_work, phone_mobile, department, seniority, linkedin_url, contact_type
- suggested_value: the new value detected
- confidence: 0.0-1.0 score
- source_snippet: the exact text excerpt that supports this suggestion

Be conservative. Only suggest changes with real evidence.

For contact_type, choose EXACTLY one of the allowed values listed in the user prompt (case-sensitive). Use the email signature, subject, sender domain, and the "domain hint" from other contacts on the same domain as evidence. Only propose contact_type when the current value is empty OR the evidence clearly contradicts it.`;

    const userPrompt = `Current contact record:
${JSON.stringify(currentFields, null, 2)}

Allowed contact_type values for this org: ${JSON.stringify(allowedTypeNames)}
Domain hint: ${domainTypeHint ? `${domainTypeHint.count} other contact(s) on @${domainTypeHint.domain} are tagged "${domainTypeHint.type}"` : "(no matching-domain contacts on file)"}

Source type: ${source_type}
${email_data ? `Email data:
From: ${email_data.from || ""}
Subject: ${email_data.subject || ""}
Body: ${(email_data.body_text || "").substring(0, 2000)}
Signature block: ${email_data.signature_block || ""}` : ""}

Extract any field change suggestions.`;

    let suggestions: Array<{
      field_name: string;
      suggested_value: string;
      confidence: number;
      source_snippet: string;
    }> = [];

    try {
      const result = await callClaude({
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        tools: [{
          name: "submit_field_suggestions",
          description: "Submit detected CRM field change suggestions",
          input_schema: {
            type: "object",
            properties: {
              suggestions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    field_name: {
                      type: "string",
                      enum: ["job_title", "email", "phone_work", "phone_mobile", "department", "seniority", "linkedin_url", "contact_type"],
                    },
                    suggested_value: { type: "string" },
                    confidence: { type: "number" },
                    source_snippet: { type: "string" },
                  },
                  required: ["field_name", "suggested_value", "confidence", "source_snippet"],
                },
              },
            },
            required: ["suggestions"],
          },
        }],
        toolChoice: { type: "tool", name: "submit_field_suggestions" },
        maxTokens: 2048,
      });
      if (result.toolUse?.input && Array.isArray(result.toolUse.input.suggestions)) {
        suggestions = result.toolUse.input.suggestions;
      }
    } catch (e: any) {
      const status = e?.status ?? 500;
      console.error("Claude error:", status, e?.message);
      if (status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded, please try again later" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: "AI extraction failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Process suggestions
    const created: any[] = [];
    let supersededCount = 0;

    for (const s of suggestions.slice(0, 10)) {
      // Check threshold
      const th = thresholdMap[s.field_name];
      const minConf = th?.min ?? DEFAULT_THRESHOLDS[s.field_name] ?? 0.70;
      const isEnabled = th?.enabled ?? true;

      if (!isEnabled || s.confidence < minConf) continue;

      // Check if current value already matches
      const currentVal = (currentFields as any)[s.field_name];
      if (currentVal && currentVal.toLowerCase().trim() === s.suggested_value.toLowerCase().trim()) {
        supersededCount++;
        continue;
      }

      // Compute dedupe key
      const encoder = new TextEncoder();
      const data = encoder.encode(`${contact_id}:${s.field_name}:${s.suggested_value.toLowerCase().trim()}`);
      const hashBuffer = await crypto.subtle.digest("MD5", data).catch(() => null);
      let dedupeKey: string;
      if (hashBuffer) {
        dedupeKey = Array.from(new Uint8Array(hashBuffer))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      } else {
        // Fallback: simple string key
        dedupeKey = `${contact_id}:${s.field_name}:${s.suggested_value.toLowerCase().trim()}`;
      }

      // Upsert suggestion
      const { data: upserted, error: upsertError } = await supabase
        .from("contact_field_suggestions")
        .upsert(
          {
            contact_id,
            company_id: resolvedCompanyId,
            field_name: s.field_name,
            current_value: currentVal || null,
            suggested_value: s.suggested_value,
            confidence: s.confidence,
            source_type,
            source_id: source_id || null,
            source_snippet: s.source_snippet,
            status: "pending",
            dedupe_key: dedupeKey,
          },
          { onConflict: "dedupe_key" }
        )
        .select()
        .single();

      if (upsertError) {
        console.error("Upsert error:", upsertError);
        continue;
      }

      created.push({
        id: upserted?.id,
        field_name: s.field_name,
        current_value: currentVal,
        suggested_value: s.suggested_value,
        confidence: s.confidence,
        source_snippet: s.source_snippet,
      });
    }

    return new Response(
      JSON.stringify({
        suggestions_created: created.length,
        suggestions_superseded: supersededCount,
        suggestions: created,
        scanned_at: new Date().toISOString(),
        scan_context: scanContext,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("field-suggestion-engine error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
