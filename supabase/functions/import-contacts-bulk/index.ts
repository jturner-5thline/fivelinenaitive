// Bulk contact import. Accepts an array of pre-mapped contact rows and inserts
// them with the service-role client to skip per-row RLS overhead. The caller
// must be authenticated; we verify they belong to the supplied org_company_id.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "Missing Authorization" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
  const userId = userData.user.id;

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const { org_company_id, rows } = body ?? {};
  if (!org_company_id || !Array.isArray(rows)) return json({ error: "org_company_id and rows[] required" }, 400);
  if (rows.length === 0) return json({ inserted: 0, failed: 0, errors: [] });
  if (rows.length > 20000) return json({ error: "Max 20000 rows per request" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE);

  // Verify the user actually belongs to this workspace.
  const { data: membership } = await admin
    .from("company_members")
    .select("id")
    .eq("company_id", org_company_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!membership) return json({ error: "Not a member of this workspace" }, 403);

  // Normalize: force org_company_id + created_by server-side so the caller can't impersonate.
  const prepared = rows
    .filter((r: any) => r && typeof r.email === "string" && r.email.trim())
    .map((r: any) => ({
      ...r,
      email: String(r.email).trim(),
      full_name: r.full_name || [r.first_name, r.last_name].filter(Boolean).join(" ") || null,
      org_company_id,
      created_by: userId,
    }));

  let inserted = 0;
  let failed = 0;
  const errors: string[] = [];

  const BATCH = 1000;
  const CONCURRENCY = 8;

  const chunks: any[][] = [];
  for (let i = 0; i < prepared.length; i += BATCH) chunks.push(prepared.slice(i, i + BATCH));

  const runChunk = async (chunk: any[]) => {
    const { error } = await admin.from("contacts").insert(chunk);
    if (!error) { inserted += chunk.length; return; }
    // On batch failure, split & retry to isolate bad rows. Avoid per-row spam.
    if (chunk.length === 1) {
      failed++;
      if (errors.length < 10) errors.push(`${chunk[0].email}: ${error.message}`);
      return;
    }
    const mid = Math.floor(chunk.length / 2);
    await runChunk(chunk.slice(0, mid));
    await runChunk(chunk.slice(mid));
  };

  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    await Promise.all(chunks.slice(i, i + CONCURRENCY).map(runChunk));
  }

  return json({ inserted, failed, errors });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}