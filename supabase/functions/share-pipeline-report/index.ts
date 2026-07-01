import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { buildFrom } from '../_shared/resendFrom.ts';
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Payload {
  to: string[];
  cc?: string[];
  subject: string;
  body: string; // plain text, newlines preserved
  bodyHtml?: string; // optional pre-rendered HTML from rich text editor
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function toHtml(body: string): string {
  const safe = escapeHtml(body);
  const html = safe
    .split(/\n\n+/)
    .map((p) => `<p style="margin:0 0 12px 0;white-space:pre-wrap;">${p}</p>`) // preserve single newlines
    .join("");
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;color:#0f172a;line-height:1.55;">${html}</body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    // Prefer the connector-managed key (RESEND_API_KEY_1); fall back to the
    // legacy RESEND_API_KEY secret. Matches the pattern used by
    // notify-comment-mentions and avoids stale/rotated-key failures.
    // The connector-managed RESEND_API_KEY_1 is a Lovable-proxy key (prefix
    // `lovc_`) that must be sent as `X-Connection-Api-Key` to the proxy — it
    // is NOT a real Resend key and cannot be passed to the Resend SDK. So we
    // only accept a native `re_...` key here. Fall back to the connector key
    // ONLY if the legacy key isn't present, purely so the missing-key branch
    // returns a clearer error to the client.
    const legacyKey = Deno.env.get("RESEND_API_KEY");
    const RESEND_API_KEY = legacyKey && legacyKey.startsWith("re_")
      ? legacyKey
      : undefined;
    const key1 = Deno.env.get("RESEND_API_KEY_1");
    console.log("[share-pipeline-report] key debug", {
      hasKey1: !!key1,
      key1Prefix: key1?.slice(0, 6) ?? null,
      hasLegacy: !!legacyKey,
      legacyPrefix: legacyKey?.slice(0, 6) ?? null,
      usingLegacy: !!RESEND_API_KEY,
    });
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") || "";
    const sb = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await sb.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = (await req.json()) as Payload;
    const to = (payload.to || []).map((s) => s.trim()).filter(Boolean);
    const cc = (payload.cc || []).map((s) => s.trim()).filter(Boolean);
    const subject = (payload.subject || "").trim();
    const body = payload.body || "";
    const bodyHtmlInput = (payload.bodyHtml || "").trim();
    if (to.length === 0) {
      return new Response(JSON.stringify({ error: "Missing recipients" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!subject) {
      return new Response(JSON.stringify({ error: "Missing subject" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resend = new Resend(RESEND_API_KEY);
    const fromName = user.user_metadata?.full_name || user.email || "Naitive";
    const fromEmail = buildFrom("Naitive");

    const html = bodyHtmlInput
      ? `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;color:#0f172a;line-height:1.55;">${bodyHtmlInput}</body></html>`
      : toHtml(body);

    const sent = await resend.emails.send({
      from: fromEmail,
      to,
      cc: cc.length > 0 ? cc : undefined,
      reply_to: user.email || undefined,
      subject,
      html,
      text: body,
      headers: { "X-Sent-By": fromName },
    });

    if ((sent as any)?.error) {
      return new Response(JSON.stringify({ error: (sent as any).error?.message || "Send failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, id: (sent as any)?.data?.id ?? null }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("share-pipeline-report error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
