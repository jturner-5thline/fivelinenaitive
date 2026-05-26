/**
 * create-proposed-slots
 * ---------------------
 * Bulk-insert proposed meeting slots for an email thread. Returns the
 * inserted rows including their public booking tokens so the client can
 * embed `/schedule/confirm?token=…` links in the outgoing draft.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

interface SlotInput { start: string; end: string }
interface Body {
  thread_id?: string | null;
  recipient_email?: string | null;
  recipient_name?: string | null;
  subject?: string | null;
  deal_id?: string | null;
  timezone?: string | null;
  duration_minutes?: number | null;
  slots: SlotInput[];
}

function ok(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return ok({ error: "Unauthorized" }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: authErr } = await supabase.auth.getClaims(token);
    if (authErr || !claims?.claims?.sub) return ok({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({} as Body));
    if (!Array.isArray(body.slots) || body.slots.length === 0) {
      return ok({ error: "slots required" }, 400);
    }
    if (body.slots.length > 20) return ok({ error: "Too many slots (max 20)" }, 400);

    const rows = body.slots
      .filter((s) => s?.start && s?.end)
      .map((s) => ({
        user_id: userId,
        thread_id: body.thread_id ?? null,
        recipient_email: body.recipient_email ?? null,
        recipient_name: body.recipient_name ?? null,
        subject: body.subject ?? null,
        deal_id: body.deal_id ?? null,
        timezone: body.timezone ?? null,
        duration_minutes: body.duration_minutes ?? null,
        slot_start: new Date(s.start).toISOString(),
        slot_end: new Date(s.end).toISOString(),
      }));
    if (rows.length === 0) return ok({ error: "no valid slots" }, 400);

    const { data, error } = await supabase
      .from("proposed_meeting_slots")
      .insert(rows)
      .select("id, token, slot_start, slot_end");

    if (error) return ok({ error: error.message }, 500);
    return ok({ slots: data });
  } catch (e) {
    console.error("[create-proposed-slots] error", e);
    return ok({ error: (e as Error).message || "unexpected" }, 500);
  }
});