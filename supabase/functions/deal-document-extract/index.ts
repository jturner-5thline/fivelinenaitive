import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_STORE_CHARS = 200_000; // hard cap on what we persist per file
const EXTRACT_TIMEOUT_MS = 30_000; // 30s ceiling per document

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label}_timeout`)), ms)),
  ]);
}

// ── Extraction helpers (mirror deal-space-ai but kept local) ──
async function extractPdfText(arrayBuffer: ArrayBuffer): Promise<string> {
  try {
    const decoder = new TextDecoder("utf-8", { fatal: false });
    const rawText = decoder.decode(new Uint8Array(arrayBuffer));
    const parts: string[] = [];
    for (const m of rawText.matchAll(/BT\s*([\s\S]*?)ET/g)) {
      for (const tj of m[1].matchAll(/\(([^)]*)\)\s*Tj/g)) {
        parts.push(tj[1].replace(/\\(.)/g, "$1"));
      }
      for (const tjArr of m[1].matchAll(/\[((?:\([^)]*\)|[^\]])*)\]\s*TJ/gi)) {
        for (const inner of tjArr[1].matchAll(/\(([^)]*)\)/g)) {
          parts.push(inner[1].replace(/\\(.)/g, "$1"));
        }
      }
    }
    for (const m of rawText.matchAll(/\(([A-Za-z][A-Za-z0-9\s,.\-:;'"!?@#$%&*()]{10,})\)/g)) {
      parts.push(m[1]);
    }
    const text = parts.join(" ").replace(/\s+/g, " ").trim();
    return text.length > 50 ? text : "";
  } catch (err) {
    console.error("PDF extraction error:", err);
    return "";
  }
}

async function extractDocxText(arrayBuffer: ArrayBuffer): Promise<string> {
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const parts: string[] = [];
    // Main document + headers/footers/footnotes/endnotes
    const candidates = Object.keys(zip.files).filter((p) =>
      /^word\/(document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/i.test(p)
    );
    for (const path of candidates) {
      const f = zip.file(path);
      if (!f) continue;
      const xml = await f.async("string");
      // Insert paragraph breaks
      const withBreaks = xml
        .replace(/<w:p[ >]/g, "\n<w:p ")
        .replace(/<w:br[^>]*\/>/g, "\n");
      // Pull all <w:t>...</w:t> contents
      for (const m of withBreaks.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)) {
        const txt = m[1]
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'");
        parts.push(txt);
      }
      parts.push("\n");
    }
    return parts.join("").replace(/\n{3,}/g, "\n\n").trim();
  } catch (err) {
    console.error("DOCX extraction error:", err);
    return "";
  }
}

async function extractExcelText(arrayBuffer: ArrayBuffer): Promise<string> {
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const wb = zip.file("xl/workbook.xml");
    if (!wb) return "";
    const wbXml = await wb.async("string");
    const sheetNames: string[] = [];
    for (const m of wbXml.matchAll(/<sheet[^>]*name="([^"]*)"/g)) sheetNames.push(m[1]);
    let shared: string[] = [];
    const ssFile = zip.file("xl/sharedStrings.xml");
    if (ssFile) {
      const ssXml = await ssFile.async("string");
      for (const m of ssXml.matchAll(/<t[^>]*>([^<]*)<\/t>/g)) shared.push(m[1]);
    }
    const out: string[] = [];
    for (let i = 0; i < sheetNames.length; i++) {
      const sf = zip.file(`xl/worksheets/sheet${i + 1}.xml`);
      if (!sf) continue;
      const xml = await sf.async("string");
      const cells: string[] = [];
      for (const m of xml.matchAll(/<c[^>]*>.*?<v>([^<]*)<\/v>.*?<\/c>/gs)) {
        if (m[0].includes('t="s"')) {
          const idx = parseInt(m[1]);
          if (!isNaN(idx) && idx < shared.length) cells.push(shared[idx]);
        } else cells.push(m[1]);
      }
      if (cells.length) out.push(`### Sheet: ${sheetNames[i]}\n${cells.join(", ")}`);
    }
    return out.join("\n\n");
  } catch (err) {
    console.error("Excel extraction error:", err);
    return "";
  }
}

async function extractContent(blob: Blob, name: string): Promise<string> {
  const lower = name.toLowerCase();
  const buf = await blob.arrayBuffer();
  if (lower.endsWith(".txt") || lower.endsWith(".md") || lower.endsWith(".csv")) return await blob.text();
  if (lower.endsWith(".pdf")) return await extractPdfText(buf);
  if (lower.endsWith(".docx")) return await extractDocxText(buf);
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return await extractExcelText(buf);
  if (lower.endsWith(".json")) {
    try { return JSON.stringify(JSON.parse(await blob.text()), null, 2); } catch { return await blob.text(); }
  }
  try {
    const text = await blob.text();
    const np = (text.match(/[\x00-\x08\x0E-\x1F]/g) || []).length;
    if (np / Math.max(text.length, 1) > 0.1) return "";
    return text;
  } catch {
    return "";
  }
}

interface DocRow {
  id: string;
  name: string;
  file_path: string;
  size_bytes: number | null;
  source: "deal_space" | "data_room";
}

async function processOne(supabaseService: any, doc: DocRow): Promise<{ ok: boolean; chars: number; error?: string }> {
  try {
    const bucket = doc.source === "deal_space" ? "deal-space" : "deal-attachments";
    const table = doc.source === "deal_space" ? "deal_space_documents" : "deal_attachments";

    // Skip very large binaries (> 5MB) to stay within compute budget
    if (doc.size_bytes && doc.size_bytes > 5_000_000) {
      await supabaseService.from(table).update({
        extraction_status: "skipped_too_large",
        extracted_at: new Date().toISOString(),
      }).eq("id", doc.id);
      return { ok: false, chars: 0, error: "too_large" };
    }

    const { data: blob, error: dlErr } = await supabaseService.storage.from(bucket).download(doc.file_path);
    if (dlErr || !blob) {
      await supabaseService.from(table).update({
        extraction_status: "failed",
        extraction_error: dlErr?.message || "download_failed",
        extracted_at: new Date().toISOString(),
      }).eq("id", doc.id);
      return { ok: false, chars: 0, error: dlErr?.message };
    }

    let text = "";
    let timedOut = false;
    try {
      text = await withTimeout(extractContent(blob, doc.name), EXTRACT_TIMEOUT_MS, "extract");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("timeout")) {
        timedOut = true;
        // Best-effort: capture whatever raw text we can decode for plain-text-like files.
        try {
          const raw = await blob.text();
          text = raw || "";
        } catch { /* ignore */ }
      } else {
        throw err;
      }
    }
    if (text.length > MAX_STORE_CHARS) text = text.slice(0, MAX_STORE_CHARS) + "\n...[truncated]";
    if (timedOut && text) text += "\nNote: document processing was partial — some content may be missing.";

    await supabaseService.from(table).update({
      extracted_text: text || null,
      extraction_status: timedOut ? "partial" : (text ? "success" : "empty"),
      extraction_error: timedOut ? "timeout_30s" : null,
      extracted_at: new Date().toISOString(),
    }).eq("id", doc.id);

    return { ok: !!text, chars: text.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Extract error for ${doc.name}:`, msg);
    return { ok: false, chars: 0, error: msg };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const service = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const { documentId, source, dealId, backfill } = body as {
      documentId?: string;
      source?: "deal_space" | "data_room";
      dealId?: string;
      backfill?: boolean;
    };

    // Single-document mode (called right after upload)
    if (documentId && source) {
      const table = source === "deal_space" ? "deal_space_documents" : "deal_attachments";
      const { data: row, error } = await userClient
        .from(table)
        .select("id, name, file_path, size_bytes, deal_id")
        .eq("id", documentId)
        .maybeSingle();
      if (error || !row) {
        return new Response(JSON.stringify({ error: "Document not found or no access" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const result = await processOne(service, { ...row, source } as DocRow);
      return new Response(JSON.stringify({ documentId, ...result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Backfill mode for a deal — process anything pending/failed
    if (backfill && dealId) {
      const [dsRes, daRes] = await Promise.all([
        userClient.from("deal_space_documents")
          .select("id, name, file_path, size_bytes")
          .eq("deal_id", dealId)
          .or("extracted_text.is.null,extraction_status.eq.pending")
          .limit(20),
        userClient.from("deal_attachments")
          .select("id, name, file_path, size_bytes")
          .eq("deal_id", dealId)
          .or("extracted_text.is.null,extraction_status.eq.pending")
          .limit(20),
      ]);
      const queue: DocRow[] = [
        ...((dsRes.data || []) as any[]).map((r) => ({ ...r, source: "deal_space" as const })),
        ...((daRes.data || []) as any[]).map((r) => ({ ...r, source: "data_room" as const })),
      ];
      const results: any[] = [];
      for (const d of queue) results.push({ id: d.id, name: d.name, ...(await processOne(service, d)) });
      return new Response(JSON.stringify({ processed: results.length, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Provide {documentId, source} or {backfill:true, dealId}" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("deal-document-extract error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});