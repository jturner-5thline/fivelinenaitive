/**
 * confirm-meeting-slot
 * --------------------
 * Public endpoint that backs the /schedule/confirm page. Validates a slot
 * token, books the meeting on the proposer's Google Calendar via Nylas
 * (with the recipient as an attendee), marks the slot accepted, and
 * expires all sibling slots for the same thread to prevent double-
 * booking.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const NYLAS_API_KEY = Deno.env.get("NYLAS_API_KEY");
const NYLAS_API_URI = "https://api.us.nylas.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function ok(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface Body {
  token?: string;
  /** GET-style lookup (no booking) — used to render the confirm page. */
  action?: "lookup" | "confirm";
  /** Optional attendee email override (if recipient wants to add a +1). */
  attendee_email?: string;
  attendee_name?: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({} as Body));
    const token = (body.token || "").trim();
    const action = body.action || "confirm";
    if (!token) return ok({ error: "token required" }, 400);

    // Service-role client (public route — no JWT required).
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: slot, error: lookupErr } = await admin
      .from("proposed_meeting_slots")
      .select("*")
      .eq("token", token)
      .maybeSingle();
    if (lookupErr) return ok({ error: lookupErr.message }, 500);
    if (!slot) return ok({ error: "not_found" }, 404);

    const now = Date.now();
    const expired = slot.expires_at && new Date(slot.expires_at).getTime() < now;
    const inPast = new Date(slot.slot_start).getTime() < now;

    if (action === "lookup") {
      return ok({
        slot: {
          slot_start: slot.slot_start,
          slot_end: slot.slot_end,
          status: slot.status,
          subject: slot.subject,
          recipient_email: slot.recipient_email,
          recipient_name: slot.recipient_name,
          timezone: slot.timezone,
          expired,
          in_past: inPast,
        },
      });
    }

    if (slot.status !== "proposed") {
      return ok({ error: "no_longer_available", status: slot.status }, 409);
    }
    if (expired) return ok({ error: "expired" }, 409);
    if (inPast) return ok({ error: "in_past" }, 409);

    // Look up Nylas grant for the proposing user.
    const { data: tok } = await admin
      .from("gmail_tokens")
      .select("grant_id, email")
      .eq("user_id", slot.user_id)
      .maybeSingle();
    if (!tok?.grant_id) return ok({ error: "calendar_not_connected" }, 500);
    if (!NYLAS_API_KEY) return ok({ error: "nylas_not_configured" }, 500);

    const attendeeEmail = (body.attendee_email || slot.recipient_email || "").trim();
    const attendeeName = body.attendee_name || slot.recipient_name || null;

    const participants: Array<{ email: string; name?: string }> = [];
    if (attendeeEmail) {
      participants.push({ email: attendeeEmail, name: attendeeName || undefined });
    }
    if (tok.email) participants.push({ email: tok.email });

    const title = slot.subject?.trim()
      ? slot.subject.replace(/^(re|fwd?):\s*/i, "")
      : "Meeting";

    const tz = slot.timezone || "UTC";
    const startUnix = Math.floor(new Date(slot.slot_start).getTime() / 1000);
    const endUnix = Math.floor(new Date(slot.slot_end).getTime() / 1000);

    const createUrl = new URL(`${NYLAS_API_URI}/v3/grants/${tok.grant_id}/events`);
    createUrl.searchParams.set("calendar_id", "primary");
    createUrl.searchParams.set("notify_participants", "true");

    const payload = {
      title,
      when: {
        start_time: startUnix,
        end_time: endUnix,
        start_timezone: tz,
        end_timezone: tz,
      },
      participants,
      conferencing: { provider: "Google Meet", autocreate: {} },
    };

    const createResp = await fetch(createUrl.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NYLAS_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
    const createData = await createResp.json().catch(() => ({}));
    if (!createResp.ok) {
      console.error("[confirm-meeting-slot] nylas error", createResp.status, createData);
      return ok({ error: createData?.message || `nylas_${createResp.status}` }, 502);
    }

    const eventId = createData?.data?.id || null;

    // Mark this slot accepted, expire siblings.
    await admin.from("proposed_meeting_slots").update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
      accepted_by_email: attendeeEmail || null,
      google_event_id: eventId,
    }).eq("id", slot.id);

    if (slot.thread_id) {
      await admin.from("proposed_meeting_slots").update({ status: "expired" })
        .eq("thread_id", slot.thread_id)
        .eq("user_id", slot.user_id)
        .eq("status", "proposed")
        .neq("id", slot.id);
    }

    return ok({
      success: true,
      slot: {
        slot_start: slot.slot_start,
        slot_end: slot.slot_end,
        timezone: tz,
        subject: title,
        recipient_email: attendeeEmail,
        google_event_id: eventId,
      },
    });
  } catch (e) {
    console.error("[confirm-meeting-slot] error", e);
    return ok({ error: (e as Error).message || "unexpected" }, 500);
  }
});