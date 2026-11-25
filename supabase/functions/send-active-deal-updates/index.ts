import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { authenticateCronRequest } from "../_shared/cron-auth.ts";
import { buildFrom } from "../_shared/resendFrom.ts";
import { BATCH_WINDOW_MINUTES, RECIPIENTS, buildEmailHtml, buildSubject, isBatchReady, type DealSnapshot, type QueueRow } from "./email.ts";

const APP_URL = "https://naitive.co";
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

const TEST_RECIPIENT = "jturner@5thline.co";

// Test mode: signed-in jturner only; sends a sample email to jturner only. No DB reads/writes of the queue.
async function sendTest(req: Request): Promise<Response> {
  const auth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false },
  });
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);
  if ((user.email ?? "").toLowerCase() !== TEST_RECIPIENT) return json({ error: "Forbidden" }, 403);
  const now = new Date();
  const deals: DealSnapshot[] = [{ id: "test", company: "[TEST] Sample Deal", stage: "Final Credit Items", status: "active", notes: "<p>Test run of the Active-pipeline update email. No real deal changed.</p>" }];
  const rows: Record<string, QueueRow[]> = { test: [{ id: "t1", deal_id: "test", changed_by: null, created_at: new Date(now.getTime() - 15 * 60_000).toISOString(),
    changes: { stage: { from: "NDA / Needs List Sent", to: "Final Credit Items" }, notes: { from: "Old note", to: "Test run note" } } }] };
  const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
  const { error } = await resend.emails.send({
    from: buildFrom("Naitive Updates"), to: [TEST_RECIPIENT],
    subject: `[TEST] ${buildSubject(deals.map((d) => d.company))}`,
    html: buildEmailHtml(deals, rows, (id) => id ?? "—", () => "James Turner (test)", APP_URL),
  });
  if (error) return json({ error: JSON.stringify(error) }, 500);
  return json({ sent: true, to: TEST_RECIPIENT });
}

Deno.serve(async (req) => {
  if (new URL(req.url).searchParams.get("test") === "1") return sendTest(req);
  const denied = authenticateCronRequest(req);
  if (denied) return denied;
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { data: pending, error } = await sb.from("active_deal_update_queue")
      .select("id, deal_id, changes, changed_by, created_at").is("sent_at", null).order("created_at").limit(1000);
    if (error) throw error;
    const rows = (pending ?? []) as QueueRow[];
    if (!isBatchReady(rows[0]?.created_at ?? null, new Date())) return json({ sent: false, pending: rows.length, window_minutes: BATCH_WINDOW_MINUTES });

    const dealIds = [...new Set(rows.map((r) => r.deal_id))];
    const { data: dealData, error: dErr } = await sb.from("deals").select("id, company, stage, status, notes, pipeline_id").in("id", dealIds);
    if (dErr) throw dErr;
    const deals = (dealData ?? []) as (DealSnapshot & { pipeline_id: string | null })[];
    deals.sort((a, b) => a.company.localeCompare(b.company));

    const { data: pipes } = await sb.from("deal_pipelines").select("stages").eq("company_id", "44556c46-9127-4b12-b14e-d6fee784afcf").eq("is_default", true);
    const labels: Record<string, string> = {};
    for (const p of pipes ?? []) for (const s of (p.stages as { id: string; label: string }[] | null) ?? []) labels[s.id] = s.label;
    const stageLabel = (id: string | null) => (id ? labels[id] ?? id : "—");

    const userIds = [...new Set(rows.map((r) => r.changed_by).filter(Boolean))] as string[];
    const names: Record<string, string> = {};
    if (userIds.length) {
      const { data: profs } = await sb.from("profiles").select("id, full_name").in("id", userIds);
      for (const p of profs ?? []) if (p.full_name) names[p.id] = p.full_name;
    }

    const rowsByDeal: Record<string, QueueRow[]> = {};
    for (const r of rows) (rowsByDeal[r.deal_id] ??= []).push(r);

    if (deals.length) {
      const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
      const { error: sendErr } = await resend.emails.send({
        from: buildFrom("Naitive Updates"),
        to: RECIPIENTS,
        subject: buildSubject(deals.map((d) => d.company)),
        html: buildEmailHtml(deals, rowsByDeal, stageLabel, (u) => (u ? names[u] ?? null : null), APP_URL),
      });
      if (sendErr) throw new Error(`Email send failed: ${JSON.stringify(sendErr)}`);
    }
    const { error: uErr } = await sb.from("active_deal_update_queue").update({ sent_at: new Date().toISOString() }).in("id", rows.map((r) => r.id));
    if (uErr) throw uErr;
    return json({ sent: deals.length > 0, deals: deals.length, updates: rows.length });
  } catch (e) {
    console.error("send-active-deal-updates failed", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
