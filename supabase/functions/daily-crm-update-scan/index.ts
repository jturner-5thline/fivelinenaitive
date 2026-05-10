import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const INTERNAL_DOMAINS = new Set(["5thline.co", "naitive.co"]);

function domainOf(email?: string | null): string {
  if (!email) return "";
  const at = email.indexOf("@");
  return at < 0 ? "" : email.slice(at + 1).trim().toLowerCase();
}

/**
 * Daily CRM Update Scan.
 * Scheduled to run at 11:00 UTC (~7am ET) by pg_cron.
 * Scans 4 sources and pushes suggestions into contact_field_suggestions
 * via the existing field-suggestion-engine. Task completion auto-updates
 * contact.last_activity_date (only auto-apply path).
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const lookbackHours = 24;
  const since = new Date(Date.now() - lookbackHours * 3600_000).toISOString();
  const stats = {
    emails_scanned: 0,
    calendar_scanned: 0,
    deals_scanned: 0,
    tasks_auto_updated: 0,
    suggestions_invoked: 0,
    errors: [] as string[],
  };

  async function invokeEngine(payload: Record<string, unknown>) {
    try {
      stats.suggestions_invoked++;
      await fetch(`${supabaseUrl}/functions/v1/field-suggestion-engine`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      stats.errors.push(`engine: ${(e as Error).message}`);
    }
  }

  // ---- SOURCE 1: Email signatures (last 24h) ----
  try {
    const { data: emails } = await supabase
      .from("emails")
      .select("id, message_id, from_email, subject, body_text, received_at")
      .gte("received_at", since)
      .not("from_email", "is", null)
      .order("received_at", { ascending: false })
      .limit(500);

    const seenContact = new Set<string>();
    for (const e of emails || []) {
      const d = domainOf(e.from_email);
      if (!d || INTERNAL_DOMAINS.has(d)) continue;
      const { data: contact } = await supabase
        .from("contacts")
        .select("id, org_company_id")
        .ilike("email", e.from_email!)
        .limit(1)
        .maybeSingle();
      if (!contact || seenContact.has(contact.id)) continue;
      seenContact.add(contact.id);
      stats.emails_scanned++;
      await invokeEngine({
        contact_id: contact.id,
        company_id: contact.org_company_id,
        source_type: "email_signature",
        source_id: e.message_id || e.id,
        email_data: {
          from: e.from_email,
          subject: e.subject,
          body_text: (e.body_text || "").slice(0, 4000),
          signature_block: (e.body_text || "").slice(-1500),
        },
      });
    }
  } catch (err) {
    stats.errors.push(`email: ${(err as Error).message}`);
  }

  // ---- SOURCE 2: Calendar events (last 24h) ----
  try {
    const { data: events } = await supabase
      .from("calendar_events")
      .select("id, title, start_time, organizer_email, attendees")
      .gte("start_time", since)
      .order("start_time", { ascending: false })
      .limit(200);

    const seen = new Set<string>();
    for (const ev of events || []) {
      const attendees: string[] = Array.isArray(ev.attendees) ? ev.attendees : [];
      const candidates = [ev.organizer_email, ...attendees].filter(Boolean) as string[];
      for (const addr of candidates) {
        const d = domainOf(addr);
        if (!d || INTERNAL_DOMAINS.has(d)) continue;
        const { data: contact } = await supabase
          .from("contacts")
          .select("id, org_company_id")
          .ilike("email", addr)
          .limit(1)
          .maybeSingle();
        if (!contact || seen.has(contact.id)) continue;
        seen.add(contact.id);
        stats.calendar_scanned++;
        await invokeEngine({
          contact_id: contact.id,
          company_id: contact.org_company_id,
          source_type: "calendar_event",
          source_id: ev.id,
          email_data: {
            from: addr,
            subject: `Meeting: ${ev.title || "(untitled)"}`,
            body_text: `Meeting on ${ev.start_time} with ${candidates.join(", ")}`,
            signature_block: "",
          },
        });
      }
    }
  } catch (err) {
    stats.errors.push(`calendar: ${(err as Error).message}`);
  }

  // ---- SOURCE 3: Deal close → suggest lifecycle change ----
  try {
    const { data: deals } = await supabase
      .from("deals")
      .select("id, company, stage, status, crm_company_id, updated_at, org_company_id")
      .gte("updated_at", since)
      .or("status.eq.closed_won,status.eq.closed_lost,stage.ilike.%closed%")
      .limit(200);

    for (const d of deals || []) {
      stats.deals_scanned++;
      if (!d.crm_company_id) continue;
      const { data: primaryContact } = await supabase
        .from("contacts")
        .select("id, org_company_id, lifecycle_stage")
        .eq("crm_company_id", d.crm_company_id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!primaryContact) continue;
      const isWon = d.status === "closed_won" || /won/i.test(d.stage || "");
      const newStage = isWon ? "customer" : "closed_lost";
      if (primaryContact.lifecycle_stage === newStage) continue;

      const dedupeBasis = `${primaryContact.id}:lifecycle_stage:${newStage}`;
      const enc = new TextEncoder().encode(dedupeBasis);
      const buf = await crypto.subtle.digest("SHA-1", enc);
      const dedupe = Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      await supabase
        .from("contact_field_suggestions")
        .upsert(
          {
            contact_id: primaryContact.id,
            company_id: primaryContact.org_company_id,
            field_name: "lifecycle_stage",
            current_value: primaryContact.lifecycle_stage || null,
            suggested_value: newStage,
            confidence: 0.9,
            source_type: "deal_close",
            source_id: d.id,
            source_snippet: `Deal "${d.company}" moved to ${d.stage}`,
            status: "pending",
            dedupe_key: dedupe,
          },
          { onConflict: "dedupe_key" },
        );
    }
  } catch (err) {
    stats.errors.push(`deals: ${(err as Error).message}`);
  }

  // ---- SOURCE 4: Task completion → AUTO-update contact.last_activity_date ----
  try {
    const { data: tasks } = await supabase
      .from("tasks")
      .select("id, contact_id, completed_at")
      .eq("status", "complete")
      .gte("completed_at", since)
      .not("contact_id", "is", null)
      .limit(500);

    const byContact = new Map<string, string>();
    for (const t of tasks || []) {
      if (!t.contact_id || !t.completed_at) continue;
      const prev = byContact.get(t.contact_id);
      if (!prev || t.completed_at > prev) byContact.set(t.contact_id, t.completed_at);
    }
    for (const [contactId, ts] of byContact) {
      const { error } = await supabase
        .from("contacts")
        .update({ last_activity_date: ts })
        .eq("id", contactId)
        .or(`last_activity_date.is.null,last_activity_date.lt.${ts}`);
      if (!error) stats.tasks_auto_updated++;
    }
  } catch (err) {
    stats.errors.push(`tasks: ${(err as Error).message}`);
  }

  return new Response(
    JSON.stringify({ ok: true, ranAt: new Date().toISOString(), stats }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});