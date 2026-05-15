import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ExportBody {
  deal_id: string;
  document_id: string;
  filename: string;
  pdf_base64: string;          // base64-encoded PDF body
  push_to_drive?: boolean;     // optional Google Drive upload
}

function base64ToUint8Array(b64: string): Uint8Array {
  const clean = b64.replace(/^data:application\/pdf;base64,/, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pushToGoogleDrive(filename: string, pdfBytes: Uint8Array): Promise<{ ok: boolean; error?: string; file_id?: string; web_view_link?: string }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const GOOGLE_DRIVE_API_KEY = Deno.env.get("GOOGLE_DRIVE_API_KEY");
  if (!LOVABLE_API_KEY || !GOOGLE_DRIVE_API_KEY) {
    return { ok: false, error: "Google Drive not connected" };
  }

  // Multipart upload via gateway
  const boundary = "----lovable-boundary-" + Math.random().toString(36).slice(2);
  const metadata = JSON.stringify({ name: filename, mimeType: "application/pdf" });
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--`);
  const merged = new Uint8Array(head.length + pdfBytes.length + tail.length);
  merged.set(head, 0);
  merged.set(pdfBytes, head.length);
  merged.set(tail, head.length + pdfBytes.length);

  try {
    const res = await fetch(
      "https://connector-gateway.lovable.dev/google_drive/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": GOOGLE_DRIVE_API_KEY,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body: merged,
      },
    );
    if (!res.ok) {
      return { ok: false, error: `Drive upload failed: ${res.status} ${await res.text()}` };
    }
    const data = await res.json();
    return { ok: true, file_id: data.id, web_view_link: data.webViewLink };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // 5th Line proprietary action — hard gate by company-account email domain.
    {
      const callerEmail = String(user.email || "").toLowerCase();
      const isFifthLine = callerEmail.endsWith("@5thline.co") || callerEmail.endsWith("@naitive.co");
      if (!isFifthLine) {
        return new Response(JSON.stringify({ error: "Forbidden: 5th Line proprietary action" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = (await req.json()) as ExportBody;
    if (!body?.deal_id || !body?.document_id || !body?.filename || !body?.pdf_base64) {
      return new Response(JSON.stringify({ error: "deal_id, document_id, filename, pdf_base64 required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pdfBytes = base64ToUint8Array(body.pdf_base64);
    const safeName = body.filename.replace(/[^\w.\-]+/g, "_");
    const filePath = `${user.id}/${body.deal_id}/${Date.now()}-${safeName}`;

    // 1) Upload to deal-attachments bucket
    const { error: uploadErr } = await supabase.storage
      .from("deal-attachments")
      .upload(filePath, pdfBytes, { contentType: "application/pdf", upsert: false });
    if (uploadErr) throw uploadErr;

    // 2) Create deal_attachments row (Data Room)
    const { data: attachment, error: attachErr } = await supabase
      .from("deal_attachments")
      .insert({
        user_id: user.id,
        deal_id: body.deal_id,
        name: safeName.endsWith(".pdf") ? safeName : `${safeName}.pdf`,
        file_path: filePath,
        content_type: "application/pdf",
        size_bytes: pdfBytes.byteLength,
        category: "materials",
      })
      .select()
      .single();
    if (attachErr) throw attachErr;

    // 3) Update ai_styled_documents row with export metadata
    await supabase
      .from("ai_styled_documents")
      .update({
        status: "exported",
        exported_attachment_id: attachment.id,
        exported_at: new Date().toISOString(),
      })
      .eq("id", body.document_id)
      .eq("user_id", user.id);

    // 4) Optional: push to Google Drive
    let drive: { ok: boolean; error?: string; file_id?: string; web_view_link?: string } | null = null;
    if (body.push_to_drive) {
      drive = await pushToGoogleDrive(safeName.endsWith(".pdf") ? safeName : `${safeName}.pdf`, pdfBytes);
    }

    return new Response(JSON.stringify({
      ok: true,
      attachment_id: attachment.id,
      file_path: filePath,
      drive,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[branded-doc-export] error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
