// detect-sales-call-deals — Deal Admin Agent
//
// Scans recently-ended 5th Line sales calls titled
//   "[COMPANY] <> 5th Line Financing Review"
// (or close separator variations), matches each event to a Claap recording
// by title (end-of-day rundown style match), drafts the "Create new deal"
// fields from the transcript via Lovable AI, and enqueues an
// `ai_action_queue` row of type `create_new_deal` for the organizer to
// review + approve in the Approval Queue.
//
// Enqueue is gated by:
//   - organizer is an allowlisted 5th Line teammate
//   - the meeting has already ENDED at least 5 minutes ago (mirrors the
//     existing auto-followup-tasks 5-min post-call trigger)
//   - no existing pending/approved queue item already exists for this
//     event (dedupe on source.nylas_event_id)
//   - Deal Admin Agent is enabled for the 5th Line workspace
//
// Triggered every 5 minutes via pg_cron.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NYLAS_API_KEY = Deno.env.get("NYLAS_API_KEY");
const NYLAS_API_URI = "https://api.us.nylas.com";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const FIFTH_LINE_COMPANY_ID = "44556c46-9127-4b12-b14e-d6fee784afcf";
const INTERNAL_DOMAIN = "@5thline.co";

// Same allowlist used by auto-followup-tasks — the six 5th Line users
// whose calendars we auto-process.
const ALLOWED_OWNER_EMAILS = new Set<string>([
  "jturner@5thline.co",
  "nheikali@5thline.co",
  "jmoffitt@5thline.co",
  "swilliams@5thline.co",
  "ppina@5thline.co",
  "ffustinoni@5thline.co",
]);

// Title patterns mirrored from sales-calls-count so detection stays in
// lockstep with the Sales Calls metric.
const TITLE_RE_DEBT =
  /^\s*(.+?)\s*(?:<>|[-–—|:/])\s*5\s*th\s+line\s+financing\s+review\s*$/i;

const LOOKBACK_MINUTES = 60; // 5 min cron with a comfortable retry margin
const MIN_POST_CALL_MINUTES = 5; // only trigger 5+ min AFTER call ends

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeTitleForMatch(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractEndMs(when: any): number | null {
  if (!when) return null;
  if (typeof when.end_time === "number") return when.end_time * 1000;
  if (typeof when.end_date === "string") {
    const d = new Date(when.end_date + "T23:59:59Z");
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  return null;
}
function extractStartMs(when: any): number | null {
  if (!when) return null;
  if (typeof when.start_time === "number") return when.start_time * 1000;
  if (typeof when.start_date === "string") {
    const d = new Date(when.start_date + "T00:00:00Z");
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Missing SUPABASE_URL / SERVICE_ROLE" }, 500);
  if (!NYLAS_API_KEY) return json({ error: "NYLAS_API_KEY not configured" }, 500);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Gate: Deal Admin Agent must be enabled for the 5th Line workspace.
  const { data: agentSettings } = await admin
    .from("admin_agent_settings")
    .select("enabled")
    .eq("company_id", FIFTH_LINE_COMPANY_ID)
    .maybeSingle();
  if (agentSettings && agentSettings.enabled === false) {
    return json({ ok: true, skipped: "admin_agent_disabled" });
  }

  // Optional override for on-demand backfill / testing.
  let overrideLookbackMin = LOOKBACK_MINUTES;
  try {
    if (req.method === "POST") {
      const body = await req.clone().json().catch(() => null);
      if (body && Number.isFinite(body.lookback_minutes)) {
        overrideLookbackMin = Math.max(5, Math.min(24 * 60, Number(body.lookback_minutes)));
      }
    }
  } catch (_) { /* ignore */ }

  const nowMs = Date.now();
  const windowStartMs = nowMs - overrideLookbackMin * 60_000;
  const cutoffEndMs = nowMs - MIN_POST_CALL_MINUTES * 60_000;

  // Load Nylas grants for allowlisted 5th Line users.
  const { data: tokens, error: tokErr } = await admin
    .from("gmail_tokens")
    .select("user_id, grant_id, email_address")
    .not("grant_id", "is", null)
    .neq("grant_id", "demo-seed");
  if (tokErr) return json({ error: tokErr.message }, 500);

  const results: any[] = [];

  for (const tok of tokens || []) {
    const ownerEmail = (tok.email_address || "").toLowerCase();
    if (!ALLOWED_OWNER_EMAILS.has(ownerEmail)) continue;

    try {
      const startUnix = Math.floor(windowStartMs / 1000);
      const endUnix = Math.floor(nowMs / 1000);
      const url = new URL(`${NYLAS_API_URI}/v3/grants/${tok.grant_id}/events`);
      url.searchParams.set("calendar_id", "primary");
      url.searchParams.set("start", String(startUnix));
      url.searchParams.set("end", String(endUnix));
      url.searchParams.set("limit", "50");
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${NYLAS_API_KEY}`, Accept: "application/json" },
      });
      if (!res.ok) {
        results.push({ user: ownerEmail, error: `Nylas ${res.status}` });
        continue;
      }
      const body = await res.json();
      const events: any[] = body?.data || [];

      for (const ev of events) {
        try {
          if (ev.status === "cancelled") continue;
          const title: string = ev?.title || "";
          const m = TITLE_RE_DEBT.exec(title);
          if (!m) continue;
          const company = (m[1] || "").trim();
          if (!company || company.toLowerCase() === "5th line") continue;

          // Only process this event on the calendar of its actual host /
          // organizer. Nylas returns the same event on every attendee's
          // calendar, so without this guard the queue item would be
          // duplicated (or assigned to the wrong teammate) whenever
          // multiple 5th Line teammates were on the call.
          const organizerEmailRaw: string =
            (ev?.organizer?.email || ev?.organizer_email || "").toLowerCase();
          if (!organizerEmailRaw) {
            // Fall back to the calendar owner if Nylas didn't return an
            // organizer (rare — e.g. imported events).
          } else if (organizerEmailRaw !== ownerEmail) {
            continue;
          }
          const hostEmail = organizerEmailRaw || ownerEmail;

          // External attendees from the calendar event = the client contacts.
          // Nylas v3 returns them under `participants`; each has { email, name, status }.
          const participants: any[] = Array.isArray(ev?.participants) ? ev.participants : [];
          const externalAttendees = participants
            .map((p) => ({
              email: String(p?.email || "").toLowerCase().trim(),
              name: String(p?.name || "").trim(),
            }))
            .filter((p) =>
              p.email &&
              !p.email.endsWith(INTERNAL_DOMAIN) &&
              p.email !== hostEmail &&
              !ALLOWED_OWNER_EMAILS.has(p.email),
            );
          const primaryExternal = externalAttendees[0] || null;
          const additionalExternalEmails = externalAttendees
            .slice(1)
            .map((p) => p.email)
            .filter(Boolean);

          const endMs = extractEndMs(ev.when);
          if (endMs == null) continue;
          // Only events that ended already AND ended ≥5 min ago.
          if (endMs > cutoffEndMs) continue;
          if (endMs < windowStartMs) continue;

          // Dedupe on nylas_event_id in ai_action_queue.source. If an item
          // already exists AND already has a Claap match, skip. If it exists
          // but was queued before the recording synced, we'll re-draft and
          // UPDATE it in place so the user sees fresh AI-drafted fields the
          // moment Claap syncs.
          const { data: existing } = await admin
            .from("ai_action_queue")
            .select("id, status, source")
            .eq("action_type", "create_new_deal")
            .filter("source->>nylas_event_id", "eq", ev.id)
            .in("status", ["pending", "approved"])
            .limit(1)
            .maybeSingle();
          if (existing?.id && existing.status === "approved") {
            results.push({ nylas_event_id: ev.id, skipped: "already_approved" });
            continue;
          }
          const existingHasClaap = !!(existing?.source && (existing.source as any).claap_meeting_id);
          if (existing?.id && existingHasClaap) {
            results.push({ nylas_event_id: ev.id, skipped: "already_queued_with_claap" });
            continue;
          }

          // Find the matched Claap recording by title. End-of-day rundown
          // logic is title-based, so we normalize both sides and require a
          // company-name substring hit within a 4-day window around the
          // event start.
          const startMs = extractStartMs(ev.when) ?? endMs;
          const winStart = new Date(startMs - 2 * 24 * 60 * 60_000).toISOString();
          const winEnd = new Date(startMs + 2 * 24 * 60 * 60_000).toISOString();
          const { data: candidates } = await admin
            .from("claap_meetings")
            .select("id, claap_id, title, transcript, ai_summary, key_decisions, next_steps, organizer_email, started_at")
            .gte("started_at", winStart)
            .lte("started_at", winEnd)
            .limit(50);

          const evNorm = normalizeTitleForMatch(title);
          const companyNorm = normalizeTitleForMatch(company);
          let claap: any = null;
          for (const c of candidates || []) {
            const cn = normalizeTitleForMatch(c.title || "");
            if (!cn) continue;
            if (cn === evNorm || cn.includes(companyNorm) || evNorm.includes(cn)) {
              claap = c;
              break;
            }
          }

          // Fallback: also scan claap_recordings (the local mirror). Match by
          // title OR by started_at proximity (±30 min) to the calendar event.
          if (!claap) {
            const { data: recs } = await admin
              .from("claap_recordings")
              .select("id, external_id, title, summary, action_items, key_takeaways, synthesized_note, started_at, ended_at")
              .gte("started_at", winStart)
              .lte("started_at", winEnd)
              .limit(50);
            for (const r of recs || []) {
              const cn = normalizeTitleForMatch(r.title || "");
              const startClose = r.started_at
                ? Math.abs(new Date(r.started_at).getTime() - startMs) <= 30 * 60_000
                : false;
              if (
                (cn && (cn === evNorm || cn.includes(companyNorm) || evNorm.includes(cn))) ||
                startClose
              ) {
                claap = {
                  id: r.id,
                  claap_id: r.external_id,
                  title: r.title,
                  transcript: "",
                  ai_summary: r.summary || r.synthesized_note || "",
                  key_decisions: Array.isArray(r.key_takeaways) ? r.key_takeaways : [],
                  next_steps: Array.isArray(r.action_items) ? r.action_items : [],
                };
                break;
              }
            }
          }

          // Draft the create-deal fields via Lovable AI when a transcript
          // is available; otherwise fall back to bare defaults.
          const drafted = await draftDealFields({
            company,
            eventTitle: title,
            organizerEmail: ownerEmail,
            transcript: claap?.transcript || "",
            aiSummary: claap?.ai_summary || "",
            keyDecisions: Array.isArray(claap?.key_decisions) ? claap.key_decisions : [],
            nextSteps: Array.isArray(claap?.next_steps) ? claap.next_steps : [],
          });

          // Resolve the assignee = event host / organizer (the 5th Line
          // teammate who owns the calendar event). Because we already
          // guarded above that ownerEmail === organizer, tok.user_id IS
          // the host's user_id.
          const assignedTo = tok.user_id;

          const payload = {
            // Fields consumed by CreateDealDialog `initialValues`.
            dealName: drafted.dealName || company,
            dealAmount: drafted.dealAmount || "",
            // Client contact auto-fills from the external attendees on the
            // [COMPANY] <> 5th Line Financing Review calendar event.
            // Attendee data always wins over AI-drafted names/emails because
            // it's authoritative (came from the actual invite).
            contactName: primaryExternal?.name || drafted.contactName || "",
            contactInfo: primaryExternal?.email || drafted.contactInfo || "",
            additionalContactEmails: additionalExternalEmails,
            dealStatusNote:
              drafted.dealStatusNote ||
              `Auto-drafted from Claap recording of "${title}".`,
            narrative: drafted.narrative || "",
            referralName: drafted.referralName || "",
            referralEmail: drafted.referralEmail || "",
            dealClass: "standard" as const,
            // Assignment metadata for the queue row.
            assigned_to: assignedTo,
          };

          const source = {
            origin: "admin_agent",
            trigger: "post_sales_call",
            nylas_event_id: ev.id,
            event_title: title,
            event_start: new Date(startMs).toISOString(),
            event_end: new Date(endMs).toISOString(),
            organizer_email: hostEmail,
            external_attendees: externalAttendees,
            claap_meeting_id: claap?.id ?? null,
            claap_id: claap?.claap_id ?? null,
            claap_matched_by: claap ? "title" : null,
            company_name: company,
          };

          const evidence: any[] = [];
          if (claap?.id) {
            evidence.push({
              kind: "claap_recording",
              label: claap.title || "Claap recording",
              ref_id: claap.id,
              snippet: (claap.ai_summary || "").slice(0, 400) || undefined,
            });
          }
          evidence.push({
            kind: "calendar_event",
            label: title,
            ref_id: ev.id,
          });

          const commonFields = {
            title: `Create new deal for ${company}`,
            description: claap
              ? `Sales call "${title}" ended ${new Date(endMs).toLocaleString()}. Pre-filled from the matched Claap recording — review and edit before approving.`
              : `Sales call "${title}" ended ${new Date(endMs).toLocaleString()}. No matched Claap recording yet — review and complete the details before approving.`,
            payload,
            source,
            evidence,
            rationale: claap
              ? "The call title matches the 5th Line Financing Review pattern and was linked to a Claap recording. Fields were drafted from the transcript."
              : "The call title matches the 5th Line Financing Review pattern. No transcript was available yet, so only defaults are pre-filled.",
            new_values: payload,
          };

          if (existing?.id) {
            // Update in place so the user sees drafted fields instantly once
            // Claap syncs — no duplicate queue row.
            const { error: updErr } = await admin
              .from("ai_action_queue")
              .update({ ...commonFields, updated_at: new Date().toISOString() })
              .eq("id", existing.id);
            if (updErr) {
              results.push({ nylas_event_id: ev.id, error: updErr.message });
              continue;
            }
            results.push({
              nylas_event_id: ev.id,
              queue_id: existing.id,
              company,
              claap_meeting_id: claap?.id ?? null,
              updated: true,
            });
            continue;
          }

          const { data: inserted, error: insErr } = await admin
            .from("ai_action_queue")
            .insert({
              user_id: assignedTo,
              assigned_to: assignedTo,
              deal_id: null,
              deal_name: company,
              action_type: "create_new_deal",
              ...commonFields,
              old_values: {},
              target_object_type: "deal",
              target_object_id: null,
              priority: "normal",
              risk_level: "medium",
              expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
            })
            .select("id")
            .single();
          if (insErr) {
            results.push({ nylas_event_id: ev.id, error: insErr.message });
            continue;
          }
          results.push({
            nylas_event_id: ev.id,
            queue_id: inserted.id,
            company,
            claap_meeting_id: claap?.id ?? null,
          });
        } catch (err) {
          results.push({ nylas_event_id: ev?.id, error: (err as Error).message });
        }
      }
    } catch (err) {
      results.push({ user: ownerEmail, error: (err as Error).message });
    }
  }

  return json({ ok: true, scanned_users: (tokens || []).length, results });
});

// ─────────────────────────────────────────────────────────────────────────
// Lovable AI — draft the create-deal fields from the transcript
// ─────────────────────────────────────────────────────────────────────────
interface DraftedFields {
  dealName?: string;
  dealAmount?: string;
  contactName?: string;
  contactInfo?: string;
  dealStatusNote?: string;
  narrative?: string;
  referralName?: string;
  referralEmail?: string;
}

async function draftDealFields(args: {
  company: string;
  eventTitle: string;
  organizerEmail: string;
  transcript: string;
  aiSummary: string;
  keyDecisions: string[];
  nextSteps: string[];
}): Promise<DraftedFields> {
  const fallback: DraftedFields = { dealName: args.company };
  if (!LOVABLE_API_KEY) return fallback;
  if (!args.transcript && !args.aiSummary) return fallback;

  const transcriptExcerpt = (args.transcript || "").slice(0, 12000);
  const system =
    "You are the Deal Admin Agent for a debt-advisory firm (5th Line). " +
    "Given a sales-call transcript, extract the fields needed to create a new deal " +
    "in the Active Pipeline. Return STRICT JSON only, no prose. Unknown fields must be empty strings. " +
    "Do not invent numbers — if the amount isn't clearly stated, leave dealAmount empty.";
  const user =
    `Company: ${args.company}\nCall title: ${args.eventTitle}\n` +
    (args.aiSummary ? `Summary:\n${args.aiSummary}\n\n` : "") +
    (args.keyDecisions.length ? `Key decisions:\n- ${args.keyDecisions.join("\n- ")}\n\n` : "") +
    (args.nextSteps.length ? `Next steps:\n- ${args.nextSteps.join("\n- ")}\n\n` : "") +
    (transcriptExcerpt ? `Transcript excerpt:\n${transcriptExcerpt}\n` : "") +
    `\nReturn JSON with keys: dealName, dealAmount, contactName, contactInfo, dealStatusNote, narrative, referralName, referralEmail.\n` +
    `dealAmount should be a plain number string (e.g. "2500000") with no $ or commas. contactInfo is the primary client email. dealStatusNote is a one-sentence current-state summary. narrative is 2–4 sentences on the business + capital need.`;

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": LOVABLE_API_KEY,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!resp.ok) {
      console.warn("[detect-sales-call-deals] AI draft failed", resp.status, await resp.text());
      return fallback;
    }
    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(text) as DraftedFields;
    return {
      dealName: parsed.dealName || args.company,
      dealAmount: (parsed.dealAmount || "").replace(/[^0-9]/g, ""),
      contactName: parsed.contactName || "",
      contactInfo: parsed.contactInfo || "",
      dealStatusNote: parsed.dealStatusNote || "",
      narrative: parsed.narrative || "",
      referralName: parsed.referralName || "",
      referralEmail: parsed.referralEmail || "",
    };
  } catch (e) {
    console.warn("[detect-sales-call-deals] AI draft threw", (e as Error).message);
    return fallback;
  }
}