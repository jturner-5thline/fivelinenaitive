import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FIFTH_LINE = "44556c46-9127-4b12-b14e-d6fee784afcf";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";

  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: userRes } = await userClient.auth.getUser();
  const user = userRes?.user;
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });

  const admin = createClient(url, service);
  const { data: membership } = await admin
    .from("company_members")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("company_id", FIFTH_LINE)
    .maybeSingle();
  if (!membership) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...CORS, "Content-Type": "application/json" } });

  const { path } = await req.json();
  const { data: file, error: dlErr } = await admin.storage.from("tmp-imports").download(path);
  if (dlErr || !file) return new Response(JSON.stringify({ error: dlErr?.message ?? "download failed" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });

  const rows = (await file.text())
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [dealId, email] = l.split(",");
      return { dealId, email: (email ?? "").toLowerCase() };
    });

  const emails = [...new Set(rows.map((r) => r.email))];
  const byEmail = new Map<string, string>();
  for (let i = 0; i < emails.length; i += 500) {
    const { data } = await admin
      .from("contacts")
      .select("id, email")
      .eq("org_company_id", FIFTH_LINE)
      .in("email", emails.slice(i, i + 500));
    for (const c of data ?? []) {
      const key = String(c.email ?? "").toLowerCase();
      if (key && !byEmail.has(key)) byEmail.set(key, c.id);
    }
  }

  const dealIds = [...new Set(rows.map((r) => r.dealId))];
  for (let i = 0; i < dealIds.length; i += 200) {
    await admin.from("contact_deals").delete().in("deal_id", dealIds.slice(i, i + 200));
  }

  const inserts: { deal_id: string; contact_id: string; role: string }[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const contactId = byEmail.get(r.email);
    if (!contactId) { missing.push(r.email); continue; }
    const key = `${r.dealId}|${contactId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    inserts.push({ deal_id: r.dealId, contact_id: contactId, role: "primary" });
  }

  let inserted = 0;
  const errors: string[] = [];
  for (let i = 0; i < inserts.length; i += 500) {
    const chunk = inserts.slice(i, i + 500);
    const { error } = await admin.from("contact_deals").insert(chunk);
    if (error) errors.push(error.message);
    else inserted += chunk.length;
  }

  return new Response(JSON.stringify({ rows: rows.length, inserted, missing: missing.length, errors }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
