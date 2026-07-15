// Save an email attachment (term sheet / IOI / LOI) into a deal's Data
// Room under the internal-only "Terms" folder. This runs server-side with
// the service role so it can:
//   1. Read the cached email row regardless of which teammate originally
//      synced the email (the client hits an RLS wall on email_cache).
//   2. Look up the email owner's Nylas grant to download the attachment.
//   3. Upload to storage and insert the vdr_documents row on behalf of
//      the reviewer.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const NYLAS_API_KEY = Deno.env.get("NYLAS_API_KEY");
const NYLAS_API_URI = "https://api.us.nylas.com";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader) return json({ error: "missing authorization" }, 401);

  // User-scoped client — only used to identify the caller.
  const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
  const callerId = userData.user.id;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const dealId: string | undefined = body?.deal_id;
  const attachmentName: string | undefined = body?.attachment_name;
  const sourceEmailId: string | undefined = body?.source_email_id;
  if (!dealId || !attachmentName || !sourceEmailId) {
    return json(
      { error: "deal_id, attachment_name, and source_email_id are required" },
      400,
    );
  }

  // 1. Resolve the deal's company_id (required for vdr_documents).
  const { data: deal, error: dealErr } = await admin
    .from("deals")
    .select("company_id")
    .eq("id", dealId)
    .maybeSingle();
  if (dealErr || !deal?.company_id) {
    return json(
      { error: `deal lookup failed (${dealErr?.message || "no company_id"})` },
      400,
    );
  }

  // 2. Read cached email metadata (service role bypasses email_cache RLS).
  const { data: cached, error: cacheErr } = await admin
    .from("email_cache")
    .select("user_id, attachments")
    .eq("gmail_message_id", sourceEmailId)
    .limit(1)
    .maybeSingle();
  if (cacheErr) return json({ error: `email lookup failed (${cacheErr.message})` }, 500);
  if (!cached) return json({ error: `cached email ${sourceEmailId} not found` }, 404);
  const atts: any[] = Array.isArray((cached as any).attachments)
    ? (cached as any).attachments
    : [];
  const match =
    atts.find((a) => a?.filename === attachmentName) ||
    atts.find(
      (a) => (a?.filename || "").toLowerCase() === attachmentName.toLowerCase(),
    ) ||
    (atts.length === 1 ? atts[0] : null);
  if (!match?.id) {
    return json({ error: `attachment "${attachmentName}" not found on email` }, 404);
  }

  // 3. Resolve the email owner's Nylas grant.
  if (!NYLAS_API_KEY) return json({ error: "NYLAS_API_KEY not configured" }, 500);
  const ownerId = (cached as any).user_id as string | null;
  if (!ownerId) return json({ error: "cached email has no owner user_id" }, 500);
  const { data: tokenRow, error: tokenErr } = await admin
    .from("gmail_tokens")
    .select("grant_id, account_id, is_demo_seed")
    .eq("user_id", ownerId)
    .maybeSingle();
  if (tokenErr || !tokenRow) {
    return json(
      { error: `no Nylas grant for email owner (${tokenErr?.message || "no token row"})` },
      500,
    );
  }
  const grantId: string | null =
    tokenRow.is_demo_seed || tokenRow.grant_id === "demo-seed"
      ? null
      : tokenRow.grant_id || tokenRow.account_id || null;
  if (!grantId) return json({ error: "email owner has no active Nylas grant" }, 500);

  // 4. Download the attachment binary from Nylas.
  const attUrl = `${NYLAS_API_URI}/v3/grants/${grantId}/attachments/${match.id}/download?message_id=${encodeURIComponent(sourceEmailId)}`;
  const attRes = await fetch(attUrl, {
    headers: { Authorization: `Bearer ${NYLAS_API_KEY}`, Accept: "*/*" },
  });
  if (!attRes.ok) {
    const errText = await attRes.text().catch(() => "");
    return json(
      { error: `attachment download failed (${attRes.status} ${errText})` },
      500,
    );
  }
  const bytes = new Uint8Array(await attRes.arrayBuffer());
  const contentType =
    (attRes.headers.get("content-type") || match.content_type || "application/octet-stream")
      .split(";")[0]
      .trim();

  // 5. Upload to storage under Terms/.
  const folderPath = "/Terms/";
  const storagePath = `${dealId}${folderPath}${attachmentName}`;
  const { error: upErr } = await admin.storage
    .from("vdr-files")
    .upload(storagePath, bytes, { upsert: true, contentType });
  if (upErr) return json({ error: `storage upload failed (${upErr.message})` }, 500);

  // 6. Insert the vdr_documents row.
  const { data: inserted, error: insErr } = await admin
    .from("vdr_documents")
    .insert({
      deal_id: dealId,
      company_id: (deal as any).company_id,
      filename: attachmentName,
      file_path: storagePath,
      file_size: bytes.length,
      file_type: contentType || attachmentName.split(".").pop() || null,
      folder_path: folderPath,
      is_folder: false,
      source: "dataroom",
      uploaded_by: callerId,
      ingestion_status: "pending",
      shared_to_dataroom: false,
    } as any)
    .select("id")
    .single();
  if (insErr) return json({ error: `vdr_documents insert failed (${insErr.message})` }, 500);

  // 7. Fire-and-forget classification (safe to ignore failure).
  if (inserted?.id) {
    admin.functions
      .invoke("classify-file", { body: { document_id: inserted.id } })
      .catch(() => {});
  }

  return json({
    ok: true,
    document_id: inserted?.id,
    filename: attachmentName,
    folder_path: folderPath,
    storage_path: storagePath,
  });
});