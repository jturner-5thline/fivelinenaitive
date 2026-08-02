import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { anthropicFetch } from "../_shared/anthropicUsage.ts";

/**
 * classify-file
 * ──────────────────────────────────────────────────────────────────
 * Classifies an uploaded VDR file using Anthropic Claude.
 *  1. Auth + ownership check via JWT.
 *  2. Loads vdr_documents row + downloads file from `vdr-files` bucket.
 *  3. Uploads the file to Anthropic /v1/files (or sends inline for images).
 *  4. Calls /v1/messages with the strict-JSON system prompt.
 *  5. Validates + post-processes (confidence + sensitivity rules).
 *  6. Upserts into file_ai_classifications.
 *  7. If confidence ≥ 0.9 and the user hasn't overridden, moves the file
 *     into the matching category folder (folder_path).
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ALLOWED_CATEGORIES = [
  "materials", "financials", "agreements", "kpis_metrics", "other", "uncategorized",
] as const;
type Category = (typeof ALLOWED_CATEGORIES)[number];

const ALLOWED_SENSITIVITY = ["low", "medium", "high"] as const;

const MODEL = "claude-sonnet-4-5-20250929";

/** Map AI category → user-visible category name in `data_room_checklist_categories` */
function categoryDisplayName(cat: Category | null | undefined): string {
  switch (cat) {
    case "materials": return "Materials";
    case "financials": return "Financials";
    case "agreements": return "Agreements";
    case "kpis_metrics": return "KPIs & Metrics";
    case "other": return "Other";
    default: return ""; // uncategorized → root
  }
}

const SYSTEM_PROMPT = `You are a file-classification agent for a deal management platform.
Your job is to analyze each uploaded file and return strict JSON only.

Primary goals:
1. Identify what the file is.
2. Classify it into one platform category.
3. Map it to the most likely checklist/data-room purpose.
4. Extract useful metadata for downstream workflow automation.
5. Flag whether the document appears safe for external sharing.

Allowed platform categories:
- materials
- financials
- agreements
- kpis_metrics
- other
- uncategorized

Checklist target examples:
- pitch_deck
- financial_model
- monthly_ytd_pnl_bs_cf
- historical_monthly_pnl_bs
- cap_table
- ar_ap_aging
- inventory_report
- tax_returns
- customer_list
- lease_agreements
- bank_statements
- sample_customer_contract
- purchase_orders_invoices
- debt_schedule
- none

Rules:
- Prefer the file contents over the filename when they conflict.
- Use the filename as a secondary signal.
- If confidence is below 0.75, set category to "uncategorized" unless contents are clearly determinative.
- Mark external_share_recommended = false for sensitive internal-only materials such as detailed models, bank statements, tax returns, cap tables, internal memos, and files containing passwords, SSNs, account numbers, or personal identifiers.
- Return one best checklist_target plus optional alternate_targets.
- Normalize dates to YYYY-MM-DD when possible.
- Extract company names, lender names, periods covered, and document type when visible.
- Never invent facts not supported by the file.
- Output valid JSON matching the schema exactly. No markdown, no commentary.

JSON schema:
{
  "filename": "string",
  "detected_document_type": "string",
  "category": "materials|financials|agreements|kpis_metrics|other|uncategorized",
  "checklist_target": "string",
  "alternate_targets": ["string"],
  "external_share_recommended": true,
  "confidence": 0.0,
  "sensitivity": "low|medium|high",
  "entities": {
    "company_names": ["string"],
    "counterparties": ["string"],
    "periods_covered": ["string"],
    "dates_found": ["string"]
  },
  "summary": "string",
  "reasoning_short": "string",
  "flags": ["string"]
}`;

function buildUserPrompt(ctx: {
  dealName: string;
  companyName: string;
  dealStage: string;
  sourceFolder: string;
  checklistItems: string[];
  existingClassified: string[];
  filename: string;
}): string {
  return `Analyze this uploaded file for a deal workflow.

Context:
- Deal name: ${ctx.dealName || "Unknown"}
- Borrower/company: ${ctx.companyName || "Unknown"}
- Current deal stage: ${ctx.dealStage || "Unknown"}
- Internal folder uploaded into: ${ctx.sourceFolder || "uncategorized"}
- Existing checklist items for this deal:
${ctx.checklistItems.map((c) => `  • ${c}`).join("\n") || "  (none)"}
- Existing already-classified files:
${ctx.existingClassified.map((c) => `  • ${c}`).join("\n") || "  (none)"}
- Filename of the attached document: ${ctx.filename}

Tasks:
1. Determine the document type.
2. Classify the file into one category.
3. Map it to the most likely checklist target.
4. Extract useful metadata.
5. Assess whether this should remain internal only or could be shared to the external data room.

Return strict JSON only.`;
}

/** Best-effort JSON parser — strips ```json fences if present. */
function parseStrictJson(text: string): any | null {
  if (!text) return null;
  let body = text.trim();
  // Strip code fences
  body = body.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  // Find first { ... last } if model added prose
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start >= 0 && end > start) {
    body = body.slice(start, end + 1);
  }
  try {
    return JSON.parse(body);
  } catch (_) {
    return null;
  }
}

function clampCategory(c: any): Category {
  return ALLOWED_CATEGORIES.includes(c) ? c : "uncategorized";
}

function clampSensitivity(s: any): "low" | "medium" | "high" {
  return ALLOWED_SENSITIVITY.includes(s) ? s : "medium";
}

/** Apply confidence + sensitivity post-processing rules. */
function postProcess(parsed: any): {
  category: Category;
  checklist_target: string;
  alternate_targets: string[];
  external_share_recommended: boolean;
  confidence: number;
  sensitivity: "low" | "medium" | "high";
  entities: Record<string, unknown>;
  summary: string;
  reasoning_short: string;
  flags: string[];
  detected_document_type: string;
} {
  const confidenceRaw = Number(parsed?.confidence);
  const confidence = isFinite(confidenceRaw)
    ? Math.max(0, Math.min(1, confidenceRaw))
    : 0;

  let category = clampCategory(parsed?.category);
  const sensitivity = clampSensitivity(parsed?.sensitivity);

  // Rule: low confidence → uncategorized + needs_review
  const flags: string[] = Array.isArray(parsed?.flags)
    ? parsed.flags.map(String).filter(Boolean)
    : [];

  if (confidence < 0.75) {
    category = "uncategorized";
    if (!flags.includes("needs_review")) flags.push("needs_review");
  } else if (confidence < 0.9) {
    if (!flags.includes("needs_confirmation")) flags.push("needs_confirmation");
  }

  let externalShare = parsed?.external_share_recommended === true;
  // Rule: high sensitivity → never auto-share
  if (sensitivity === "high") externalShare = false;

  const checklistTarget = String(parsed?.checklist_target || "none") || "none";

  return {
    category,
    checklist_target: checklistTarget,
    alternate_targets: Array.isArray(parsed?.alternate_targets)
      ? parsed.alternate_targets.map(String).filter(Boolean).slice(0, 5)
      : [],
    external_share_recommended: externalShare,
    confidence,
    sensitivity,
    entities: parsed?.entities && typeof parsed.entities === "object" ? parsed.entities : {},
    summary: String(parsed?.summary || "").slice(0, 2000),
    reasoning_short: String(parsed?.reasoning_short || "").slice(0, 1000),
    flags,
    detected_document_type: String(parsed?.detected_document_type || "").slice(0, 200),
  };
}

function inferMimeType(filename: string, fileType: string | null): string {
  if (fileType && fileType.includes("/")) return fileType;
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  switch (ext) {
    case "pdf": return "application/pdf";
    case "png": return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "gif": return "image/gif";
    case "webp": return "image/webp";
    case "txt": return "text/plain";
    case "csv": return "text/csv";
    case "json": return "application/json";
    case "xlsx": return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "xls": return "application/vnd.ms-excel";
    case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "doc": return "application/msword";
    case "pptx": return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case "ppt": return "application/vnd.ms-powerpoint";
    default: return "application/octet-stream";
  }
}

/** Whether Claude can read this file directly (PDF or image). */
function isClaudeReadable(mimeType: string): "document" | "image" | null {
  if (mimeType === "application/pdf") return "document";
  if (mimeType.startsWith("image/")) return "image";
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Auth ────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResp({ success: false, error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseUser = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return jsonResp({ success: false, error: "Unauthorized" }, 401);
    }

    // ── Body ────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const documentId = String(body?.document_id || "");
    if (!documentId) return jsonResp({ success: false, error: "document_id required" }, 400);

    // ── Load doc + verify access ────────────────────────────
    const { data: doc, error: docErr } = await supabase
      .from("vdr_documents")
      .select("id, deal_id, company_id, filename, file_path, file_type, folder_path, shared_to_dataroom")
      .eq("id", documentId)
      .single();

    if (docErr || !doc) return jsonResp({ success: false, error: "Document not found" }, 404);
    if (!doc.file_path) return jsonResp({ success: false, error: "Folder, not a file" }, 400);

    // verify membership
    if (doc.company_id) {
      const { data: isMember } = await supabase
        .rpc("is_company_member", { _user_id: user.id, _company_id: doc.company_id });
      if (!isMember) return jsonResp({ success: false, error: "Forbidden" }, 403);
    }

    // ── Mark processing (upsert by document_id) ─────────────
    await supabase.from("file_ai_classifications").upsert({
      document_id: doc.id,
      deal_id: doc.deal_id,
      company_id: doc.company_id,
      filename: doc.filename,
      status: "processing",
      error_message: null,
    }, { onConflict: "document_id" });

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      await markFailed(supabase, doc.id, "AI service is not configured");
      return jsonResp({ success: false, error: "AI service is not configured" }, 500);
    }

    // ── Download from storage ───────────────────────────────
    const { data: blob, error: dlErr } = await supabase.storage
      .from("vdr-files").download(doc.file_path);
    if (dlErr || !blob) {
      await markFailed(supabase, doc.id, "Failed to download file from storage");
      return jsonResp({ success: false, error: "Failed to download file" }, 500);
    }

    const mimeType = inferMimeType(doc.filename, doc.file_type);
    const readableKind = isClaudeReadable(mimeType);

    // ── Build context ───────────────────────────────────────
    const { data: deal } = await supabase
      .from("deals")
      .select("company, stage")
      .eq("id", doc.deal_id)
      .single();

    // Existing classifications for context
    const { data: existing } = await supabase
      .from("file_ai_classifications")
      .select("filename, detected_document_type, category, checklist_target")
      .eq("deal_id", doc.deal_id)
      .neq("document_id", doc.id)
      .eq("status", "complete")
      .limit(20);

    // Get checklist items from the deal's matching default config
    const { data: outstanding } = await supabase
      .from("outstanding_items")
      .select("description")
      .eq("deal_id", doc.deal_id)
      .limit(50);
    const checklistItems = (outstanding || [])
      .map((o: any) => o.description as string).filter(Boolean);

    const sourceFolder = (doc.folder_path || "/").replace(/^\/+|\/+$/g, "") || "uncategorized";
    const userPrompt = buildUserPrompt({
      dealName: deal?.company || "",
      companyName: deal?.company || "",
      dealStage: deal?.stage || "",
      sourceFolder,
      checklistItems,
      existingClassified: (existing || []).map((e: any) =>
        `${e.filename} → ${e.category}/${e.checklist_target || "none"}`
      ),
      filename: doc.filename,
    });

    // ── Build Anthropic message content ─────────────────────
    let userContent: any[];

    if (readableKind) {
      // Use Files API for PDFs/images so the model can read it.
      const arrayBuf = await blob.arrayBuffer();
      // 32MB Anthropic file size limit
      if (arrayBuf.byteLength > 30 * 1024 * 1024) {
        await markFailed(supabase, doc.id, "File too large for AI analysis (>30MB)");
        return jsonResp({ success: false, error: "File too large" }, 413);
      }

      const form = new FormData();
      form.append("file", new Blob([arrayBuf], { type: mimeType }), doc.filename);

      const fileResp = await fetch("https://api.anthropic.com/v1/files", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "files-api-2025-04-14",
        },
        body: form,
      });
      if (!fileResp.ok) {
        const errText = await fileResp.text();
        console.error("Anthropic Files upload failed:", fileResp.status, errText.slice(0, 300));
        await markFailed(supabase, doc.id, `Files API error ${fileResp.status}`);
        return jsonResp({ success: false, error: "AI file upload failed" }, 502);
      }
      const fileJson = await fileResp.json();
      const fileId = fileJson?.id;
      if (!fileId) {
        await markFailed(supabase, doc.id, "Files API returned no id");
        return jsonResp({ success: false, error: "AI file upload failed" }, 502);
      }

      userContent = [
        {
          type: readableKind, // "document" | "image"
          source: { type: "file", file_id: fileId },
        },
        { type: "text", text: userPrompt },
      ];
    } else {
      // Filename-only fallback for unsupported binary types
      userContent = [{
        type: "text",
        text: `${userPrompt}\n\n[NOTE: The file content could not be read directly (${mimeType}). Classify based on filename alone and lower confidence accordingly.]`,
      }];
    }

    // ── Call Anthropic Messages ─────────────────────────────
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 55_000);

    let msgResp: Response;
    try {
      msgResp = await anthropicFetch({ feature: "classify-file" }, {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "files-api-2025-04-14",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1500,
          temperature: 0.1,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userContent }],
        }),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const isTimeout = err instanceof Error && err.name === "AbortError";
      await markFailed(supabase, doc.id, isTimeout ? "AI request timed out" : "AI request failed");
      return jsonResp({ success: false, error: isTimeout ? "AI request timed out" : "AI request failed" }, 504);
    }
    clearTimeout(timer);

    if (!msgResp.ok) {
      const errText = await msgResp.text();
      console.error("Anthropic Messages error:", msgResp.status, errText.slice(0, 300));
      await markFailed(supabase, doc.id, `Anthropic ${msgResp.status}`);
      return jsonResp({ success: false, error: "AI request failed" }, 502);
    }

    const data = await msgResp.json();
    const responseText: string = (data.content || [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");

    const parsed = parseStrictJson(responseText);
    if (!parsed) {
      // Save raw response for debug, mark unclassified
      await supabase.from("file_ai_classifications").update({
        status: "complete",
        category: "uncategorized",
        checklist_target: "none",
        alternate_targets: [],
        confidence: 0,
        sensitivity: "medium",
        external_share_recommended: false,
        flags: ["parse_failed", "needs_review"],
        summary: "AI response could not be parsed.",
        reasoning_short: responseText.slice(0, 500),
        model: data.model || MODEL,
        raw_response: { text: responseText, usage: data.usage || null },
        attempts: 1,
      }).eq("document_id", doc.id);
      return jsonResp({ success: true, parse_failed: true });
    }

    const final = postProcess(parsed);

    await supabase.from("file_ai_classifications").update({
      status: "complete",
      detected_document_type: final.detected_document_type,
      category: final.category,
      checklist_target: final.checklist_target,
      alternate_targets: final.alternate_targets,
      external_share_recommended: final.external_share_recommended,
      confidence: final.confidence,
      sensitivity: final.sensitivity,
      entities: final.entities,
      summary: final.summary,
      reasoning_short: final.reasoning_short,
      flags: final.flags,
      model: data.model || MODEL,
      raw_response: { parsed, usage: data.usage || null },
      attempts: 1,
      error_message: null,
    }).eq("document_id", doc.id);

    // ── Auto-move when confidence ≥ 0.9 ─────────────────────
    // Only if the user hasn't already explicitly placed it in a known category folder.
    if (final.confidence >= 0.9 && final.category !== "uncategorized") {
      const targetName = categoryDisplayName(final.category);
      if (targetName) {
        // Check that the category folder actually exists for this user/company
        const { data: catRows } = await supabase
          .from("data_room_checklist_categories")
          .select("name");
        const known = new Set((catRows || []).map((c: any) => c.name as string));
        if (known.has(targetName)) {
          const newPath = `/${targetName}/`;
          if ((doc.folder_path || "/") !== newPath) {
            await supabase.from("vdr_documents")
              .update({ folder_path: newPath })
              .eq("id", doc.id);
          }
        }
      }
    }

    return jsonResp({ success: true, classification: final });
  } catch (err) {
    console.error("classify-file fatal:", err);
    return jsonResp({
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }, 500);
  }
});

async function markFailed(supabase: any, documentId: string, msg: string) {
  await supabase.from("file_ai_classifications").update({
    status: "failed", error_message: msg,
  }).eq("document_id", documentId);
}

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}