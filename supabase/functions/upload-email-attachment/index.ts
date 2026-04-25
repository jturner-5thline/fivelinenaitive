import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const BUCKET = "email-attachments";
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB (matches client validator)

// Mirror the client allowlist so a malicious client can't bypass extension checks.
const ALLOWED_EXTENSIONS = new Set([
  "pdf", "doc", "docx", "txt", "rtf", "md",
  "xls", "xlsx", "csv",
  "ppt", "pptx",
  "png", "jpg", "jpeg", "gif", "webp", "svg", "heic",
  "zip",
  "eml", "msg",
]);

const BLOCKED_EXTENSIONS = new Set([
  "exe", "bat", "cmd", "sh", "msi", "dll", "app", "scr", "js", "jar", "vbs", "ps1",
]);

interface SignRequest {
  /** Original filename including extension */
  filename: string;
  /** File size in bytes (used for validation only — actual upload still enforced by Storage) */
  size: number;
  /** Optional: thread/draft id used to namespace the path */
  scope?: string;
}

interface SignResponse {
  /** Storage object path: <user_id>/<scope>/<uuid>-<sanitized-filename> */
  path: string;
  /** Fully qualified URL the client should PUT the file body to (XHR upload) */
  uploadUrl: string;
  /** Signed token returned by createSignedUploadUrl (also embedded in uploadUrl) */
  token: string;
  /** Bucket id (echoed for convenience) */
  bucket: string;
}

function sanitizeFilename(name: string): string {
  // Strip path separators and keep a conservative safe charset.
  const base = name.replace(/^.*[\\/]/, "");
  return base.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 200) || "file";
}

function getExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // ---- Authenticate the caller ----
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return jsonResponse({ error: "Missing authorization header" }, 401);
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  const userId = userData.user.id;

  // ---- Parse + validate body ----
  let payload: SignRequest;
  try {
    payload = (await req.json()) as SignRequest;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const filename = typeof payload?.filename === "string" ? payload.filename.trim() : "";
  const size = Number(payload?.size);
  const scope = typeof payload?.scope === "string" && payload.scope.trim()
    ? payload.scope.trim().replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80)
    : "drafts";

  if (!filename) {
    return jsonResponse({ error: "filename is required" }, 400);
  }
  if (!Number.isFinite(size) || size <= 0) {
    return jsonResponse({ error: "size must be a positive number" }, 400);
  }
  if (size > MAX_FILE_SIZE_BYTES) {
    return jsonResponse(
      { error: `File exceeds ${Math.round(MAX_FILE_SIZE_BYTES / 1024 / 1024)} MB limit` },
      413,
    );
  }

  const ext = getExtension(filename);
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return jsonResponse({ error: `File type ".${ext}" is not allowed` }, 400);
  }
  if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
    return jsonResponse({ error: `File type ".${ext}" is not supported` }, 400);
  }

  // ---- Issue a signed upload URL (service role required) ----
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const safeName = sanitizeFilename(filename);
  const uniqueId = crypto.randomUUID();
  // RLS-friendly path: first segment must equal auth.uid() (see migration policies)
  const objectPath = `${userId}/${scope}/${uniqueId}-${safeName}`;

  const { data: signed, error: signErr } = await adminClient.storage
    .from(BUCKET)
    .createSignedUploadUrl(objectPath);

  if (signErr || !signed) {
    console.error("createSignedUploadUrl failed", signErr);
    return jsonResponse(
      { error: signErr?.message ?? "Could not create upload URL" },
      500,
    );
  }

  // signed.signedUrl is already a fully qualified URL the client can PUT to.
  const response: SignResponse = {
    path: signed.path,
    uploadUrl: signed.signedUrl.startsWith("http")
      ? signed.signedUrl
      : `${SUPABASE_URL}${signed.signedUrl}`,
    token: signed.token,
    bucket: BUCKET,
  };

  return jsonResponse(response, 200);
});