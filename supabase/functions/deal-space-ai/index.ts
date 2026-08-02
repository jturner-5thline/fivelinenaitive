import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import JSZip from "https://esm.sh/jszip@3.10.1";
import { anthropicFetch } from "../_shared/anthropicUsage.ts";
import { compactHistory, historyStats } from "../_shared/contextBudget.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Token budget constants (approximate char-to-token ratio ~4:1)
const MAX_CONTEXT_CHARS = 120_000; // ~30k tokens for context
const MAX_DOC_CONTENT_CHARS = 60_000;
const MAX_SINGLE_DOC_CHARS = 15_000;
const MAX_NOTE_CHARS = 3_000;
const MAX_TRANSCRIPT_CHARS = 10_000;
const MAX_ACTIVITY_SUMMARY_CHARS = 2_000;

// ─── Claude API helper ──────────────────────────────────────────────
async function callClaude(
  systemPrompt: string,
  messages: { role: string; content: string }[],
  options: { model?: string; maxTokens?: number; temperature?: number } = {}
): Promise<{ content: string; raw: any }> {
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

  const model = options.model || "claude-sonnet-4-5-20250929";
  const maxTokens = options.maxTokens || 4096;
  const temperature = options.temperature ?? 0.7;

  const anthropicMessages = messages.map(m => ({
    role: m.role === "system" ? "user" : m.role,
    content: m.content,
  }));

  const response = await anthropicFetch({ feature: "deal-space-ai" }, {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: anthropicMessages,
    }),
  });

  if (!response.ok) {
    const status = response.status;
    const errorText = await response.text();
    console.error("Claude API error:", status, errorText);
    if (status === 429) throw Object.assign(new Error("Rate limit exceeded. Please try again in a moment."), { status: 429 });
    if (status === 402) throw Object.assign(new Error("AI credits exhausted. Please add credits to continue."), { status: 402 });
    throw new Error(`Claude API error: ${status}`);
  }

  const data = await response.json();
  const content = data.content
    ?.filter((block: any) => block.type === "text")
    .map((block: any) => block.text)
    .join("\n") || "";

  return { content, raw: data };
}

// ─── Streaming Claude helper ────────────────────────────────────────
async function streamClaude(
  systemPrompt: string,
  messages: { role: string; content: string }[],
  options: { model?: string; maxTokens?: number; temperature?: number } = {}
): Promise<ReadableStream> {
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

  const model = options.model || "claude-sonnet-4-5-20250929";
  const maxTokens = options.maxTokens || 4096;
  const temperature = options.temperature ?? 0.3;

  const anthropicMessages = messages.map(m => ({
    role: m.role === "system" ? "user" : m.role,
    content: m.content,
  }));

  const response = await anthropicFetch({ feature: "deal-space-ai" }, {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      stream: true,
      system: systemPrompt,
      messages: anthropicMessages,
    }),
  });

  if (!response.ok) {
    const status = response.status;
    const errorText = await response.text();
    console.error("Claude stream error:", status, errorText);
    if (status === 429) throw Object.assign(new Error("Rate limit exceeded."), { status: 429 });
    if (status === 402) throw Object.assign(new Error("AI credits exhausted."), { status: 402 });
    throw new Error(`Claude API error: ${status}`);
  }

  return response.body!;
}

interface ExtractedContent {
  text: string;
  pages?: { pageNumber: number; content: string }[];
  sheets?: { sheetName: string; content: string }[];
  slides?: { slideNumber: number; content: string }[];
}

// ─── Canonical Memo Section Schema ───────────────────────────────────
const MEMO_SECTIONS = [
  { key: "executive_overview", heading: "Executive / Deal Overview" },
  { key: "facility_overview", heading: "Facility Overview" },
  { key: "financial_profile", heading: "Financial Profile" },
  { key: "credit_strengths", heading: "Key Credit Strengths" },
  { key: "key_risks", heading: "Key Risks & Hurdles" },
  { key: "lender_status", heading: "Lender Process & Status" },
  { key: "recommendation", heading: "Recommendation / Next Steps" },
] as const;

const RISK_SUB_SECTIONS = [
  "Financial Risks",
  "Lender Sentiment & Market Risks",
  "Operational & Strategic Risks",
];

function getMemoSectionHeadings(): string {
  return MEMO_SECTIONS.map((s, i) => `${i + 1}. ${s.heading}`).join("\n");
}

const FORMATTING_RULES = `
CRITICAL FORMATTING RULES — every response MUST follow this structure:
- Use ## for the section headings listed below and ### for sub-headings.
- Use bullet points (- ) for all lists. Use indented bullets (  - ) for sub-items.
- Use **bold** for key terms, labels, and emphasis within bullets.
- NEVER output plain paragraphs when the content has multiple items — always use headings and lists.
- Omit a section entirely if there is genuinely no data; do NOT hallucinate content.
- CURRENCY FORMATTING: Always format dollar amounts using abbreviated notation: $6MM instead of $6,000,000, $15MM instead of $15,000,000, $1.5MM instead of $1,500,000, $500K instead of $500,000. Use K for thousands, MM for millions, B for billions.
`;

const MEMO_TEMPLATE_INSTRUCTIONS = `
You MUST output your response using exactly these section headings, in this order:

## Executive / Deal Overview
A concise 2-3 sentence summary of the company, deal type, capital ask, and strategic rationale.

## Facility Overview
- **Requested Amount:** [capital ask]
- **Proposed Structure:** [deal type / term / rate if available]
- **Use of Funds:** [use of funds]
- **Collateral / Security:** [if available]

## Financial Profile
- **Revenue:** [last year → this year, growth %]
- **Gross Margins:** [%]
- **Profitability:** [status]
- **Liquidity / Cash Position:** [if available]
- **Leverage / Existing Debt:** [if available]
- **Equity Raised to Date:** [if available]

## Key Credit Strengths
- Concise bullets highlighting the strongest aspects of the credit.

## Key Risks & Hurdles
Output exactly these three sub-headings with concise bullets under each:

### Financial Risks
- e.g., High cash burn, declining revenue, thin margins, covenant risk

### Lender Sentiment & Market Risks
- e.g., Early rejections, limited lender appetite, sector headwinds, concentration risk

### Operational & Strategic Risks
- e.g., Management gaps, governance concerns, customer concentration, regulatory exposure

Pull risk data from: deal memo hurdles, analyst notes, lender pass reasons, lender feedback/notes, and deal flag notes. Be specific — cite the lender name when referencing a pass reason.

## Lender Process & Status
- **Pipeline Stage:** [current deal stage]
- **Flagged:** [Yes/No + reason if flagged]
- **Lenders Active ([count]):** [names + current substage]
- **Lenders Passed ([count]):** [names + pass reason]
- **Quotes Received:** [lender name, amount, rate, term — if any]
If lender data is missing, state "No lender engagement data available" rather than inventing data.

## Recommendation / Next Steps
Actionable bullets: what should the deal team do next based on the current state of the deal.
`;

// ─── Truncation helper ──────────────────────────────────────────────
function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.substring(0, maxChars) + `\n...[truncated, ${text.length - maxChars} chars omitted]`;
}

// ─── File extraction helpers ────────────────────────────────────────

async function extractPdfText(arrayBuffer: ArrayBuffer): Promise<ExtractedContent> {
  try {
    const uint8Array = new Uint8Array(arrayBuffer);
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const rawText = decoder.decode(uint8Array);
    const textParts: string[] = [];
    const streamMatches = rawText.matchAll(/stream\s*([\s\S]*?)endstream/g);
    for (const match of streamMatches) {
      const content = match[1];
      const readable = content.replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
      if (readable.length > 20 && !/^[\s\d\.\-\[\]\/]+$/.test(readable)) textParts.push(readable);
    }
    const textBlockMatches = rawText.matchAll(/BT\s*([\s\S]*?)ET/g);
    for (const match of textBlockMatches) {
      const tjMatches = match[1].matchAll(/\(([^)]*)\)\s*Tj/g);
      for (const tj of tjMatches) {
        const text = tj[1].replace(/\\(.)/g, '$1');
        if (text.length > 0) textParts.push(text);
      }
      // Also capture TJ array text
      const tjArrayMatches = match[1].matchAll(/\[((?:\([^)]*\)|[^\]])*)\]\s*TJ/gi);
      for (const tjArr of tjArrayMatches) {
        const innerMatches = tjArr[1].matchAll(/\(([^)]*)\)/g);
        for (const inner of innerMatches) {
          const t = inner[1].replace(/\\(.)/g, '$1');
          if (t.length > 0) textParts.push(t);
        }
      }
    }
    const plainTextMatches = rawText.matchAll(/\(([A-Za-z][A-Za-z0-9\s,.\-:;'"!?@#$%&*()]{10,})\)/g);
    for (const match of plainTextMatches) textParts.push(match[1]);
    const extractedText = textParts.join(' ').replace(/\s+/g, ' ').trim();
    if (extractedText.length < 50) return { text: "[PDF content - text extraction limited. Upload Word or text documents for better results.]" };
    return { text: extractedText };
  } catch (error) {
    console.error("PDF extraction error:", error);
    return { text: "[PDF content could not be extracted - try uploading as Word or text format]" };
  }
}

async function extractDocxText(arrayBuffer: ArrayBuffer): Promise<ExtractedContent> {
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const parts: string[] = [];
    const candidates = Object.keys(zip.files).filter((p) =>
      /^word\/(document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/i.test(p)
    );
    for (const path of candidates) {
      const f = zip.file(path);
      if (!f) continue;
      const xml = await f.async("string");
      const withBreaks = xml
        .replace(/<w:p[ >]/g, "\n<w:p ")
        .replace(/<w:br[^>]*\/>/g, "\n");
      for (const m of withBreaks.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)) {
        parts.push(
          m[1]
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'"),
        );
      }
      parts.push("\n");
    }
    const text = parts.join("").replace(/\n{3,}/g, "\n\n").trim();
    return { text: text || "" };
  } catch (error) {
    console.error("DOCX extraction error:", error);
    return { text: "[Word document content could not be extracted]" };
  }
}

async function extractExcelText(arrayBuffer: ArrayBuffer): Promise<ExtractedContent> {
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const sheets: { sheetName: string; content: string }[] = [];
    const allText: string[] = [];
    const workbookFile = zip.file("xl/workbook.xml");
    if (!workbookFile) return { text: "[Excel content could not be extracted - invalid format]" };
    const workbookXml = await workbookFile.async("string");
    const sheetMatches = workbookXml.matchAll(/<sheet[^>]*name="([^"]*)"[^>]*sheetId="(\d+)"/g);
    const sheetNames: string[] = [];
    for (const match of sheetMatches) sheetNames.push(match[1]);
    let sharedStrings: string[] = [];
    const sharedStringsFile = zip.file("xl/sharedStrings.xml");
    if (sharedStringsFile) {
      const sharedStringsXml = await sharedStringsFile.async("string");
      const stringMatches = sharedStringsXml.matchAll(/<t[^>]*>([^<]*)<\/t>/g);
      for (const match of stringMatches) sharedStrings.push(match[1]);
    }
    for (let i = 0; i < sheetNames.length; i++) {
      const sheetFile = zip.file(`xl/worksheets/sheet${i + 1}.xml`);
      if (!sheetFile) continue;
      const sheetXml = await sheetFile.async("string");
      const cellValues: string[] = [];
      const cellMatches = sheetXml.matchAll(/<c[^>]*>.*?<v>([^<]*)<\/v>.*?<\/c>/gs);
      for (const match of cellMatches) {
        const fullCell = match[0];
        const value = match[1];
        if (fullCell.includes('t="s"')) {
          const index = parseInt(value);
          if (!isNaN(index) && index < sharedStrings.length) cellValues.push(sharedStrings[index]);
        } else {
          cellValues.push(value);
        }
      }
      const inlineMatches = sheetXml.matchAll(/<is>.*?<t>([^<]*)<\/t>.*?<\/is>/gs);
      for (const match of inlineMatches) cellValues.push(match[1]);
      const sheetContent = cellValues.join(", ");
      if (sheetContent.trim()) {
        sheets.push({ sheetName: sheetNames[i] || `Sheet${i + 1}`, content: sheetContent });
        allText.push(`### Sheet: ${sheetNames[i] || `Sheet${i + 1}`}\n${sheetContent}`);
      }
    }
    if (sheets.length === 0) return { text: "[Excel file appears to be empty]" };
    return { text: allText.join("\n\n"), sheets };
  } catch (error) {
    console.error("Excel extraction error:", error);
    return { text: "[Excel content could not be extracted]" };
  }
}

async function extractPptxText(arrayBuffer: ArrayBuffer): Promise<ExtractedContent> {
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const slides: { slideNumber: number; content: string }[] = [];
    const allText: string[] = [];
    const slideFiles = Object.keys(zip.files)
      .filter(name => name.match(/ppt\/slides\/slide\d+\.xml$/))
      .sort((a, b) => {
        const numA = parseInt(a.match(/slide(\d+)/)?.[1] || "0");
        const numB = parseInt(b.match(/slide(\d+)/)?.[1] || "0");
        return numA - numB;
      });
    for (const slideFile of slideFiles) {
      const slideXml = await zip.files[slideFile].async("string");
      const textMatches = slideXml.match(/<a:t>([^<]*)<\/a:t>/g) || [];
      const slideText = textMatches.map(match => match.replace(/<\/?a:t>/g, "")).filter(text => text.trim()).join(" ");
      if (slideText.trim()) {
        const slideNum = parseInt(slideFile.match(/slide(\d+)/)?.[1] || "0");
        slides.push({ slideNumber: slideNum, content: slideText });
        allText.push(`Slide ${slideNum}: ${slideText}`);
      }
    }
    return { text: allText.join("\n\n") || "[No text found in presentation]", slides: slides.length > 0 ? slides : undefined };
  } catch (error) {
    console.error("PPTX extraction error:", error);
    return { text: "[PowerPoint content could not be extracted]" };
  }
}

async function extractContent(fileData: Blob, fileName: string): Promise<ExtractedContent> {
  const lowerName = fileName.toLowerCase();
  const arrayBuffer = await fileData.arrayBuffer();
  if (lowerName.endsWith(".txt") || lowerName.endsWith(".md") || lowerName.endsWith(".csv")) return { text: await fileData.text() };
  if (lowerName.endsWith(".pdf")) return await extractPdfText(arrayBuffer);
  if (lowerName.endsWith(".docx")) return await extractDocxText(arrayBuffer);
  if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) return await extractExcelText(arrayBuffer);
  if (lowerName.endsWith(".pptx")) return await extractPptxText(arrayBuffer);
  if (lowerName.endsWith(".json")) {
    try { const text = await fileData.text(); return { text: JSON.stringify(JSON.parse(text), null, 2) }; } catch { return { text: await fileData.text() }; }
  }
  try {
    const text = await fileData.text();
    const nonPrintable = (text.match(/[\x00-\x08\x0E-\x1F]/g) || []).length;
    if (nonPrintable / text.length > 0.1) return { text: `[Binary file: ${fileName} - content type not supported]` };
    return { text };
  } catch { return { text: `[Binary file: ${fileName}]` }; }
}

function buildEnhancedContext(docName: string, extracted: ExtractedContent): string {
  let context = `### ${docName}\n`;
  if (extracted.sheets && extracted.sheets.length > 0) {
    context += extracted.sheets.map(s => `[Sheet: ${s.sheetName}]\n${s.content}`).join("\n\n");
  } else if (extracted.slides && extracted.slides.length > 0) {
    context += extracted.slides.map(s => `[Slide ${s.slideNumber}]\n${s.content}`).join("\n\n");
  } else {
    context += extracted.text;
  }
  return context;
}

// ─── Deal context builder (shared across all actions) ───────────────

// ─── Status snapshot extraction & persistence ───────────────────────
const STATUS_SNAPSHOT_RE = /<!--STATUS_SNAPSHOT:(\{[\s\S]*?\})-->/;

async function persistStatusSnapshot(
  supabaseService: any,
  dealId: string,
  fullContent: string,
  userId: string | null,
) {
  try {
    const m = fullContent.match(STATUS_SNAPSHOT_RE);
    if (!m) return;
    let snap: any;
    try { snap = JSON.parse(m[1]); } catch { return; }
    if (!snap || typeof snap !== "object") return;

    const derived = typeof snap.derived === "string" ? snap.derived : null;
    const header = typeof snap.header === "string" ? snap.header : null;
    const mismatch = Boolean(snap.mismatch);
    const rationale = typeof snap.rationale === "string" ? snap.rationale : null;
    const signals = snap.signals && typeof snap.signals === "object" ? snap.signals : {};

    const payload = {
      derived_status: derived,
      header_status: header,
      mismatch,
      rationale,
      signals,
      updated_at: new Date().toISOString(),
      source: "ask_ai",
    };

    // Persist latest snapshot on deals + audit row. Fire-and-forget but logged.
    await Promise.all([
      supabaseService
        .from("deals")
        .update({ ai_status_snapshot: payload })
        .eq("id", dealId),
      supabaseService
        .from("deal_ai_status_snapshots")
        .insert({
          deal_id: dealId,
          header_status: header,
          derived_status: derived,
          mismatch,
          rationale,
          signals,
          source: "ask_ai",
          created_by: userId,
        }),
    ]);
  } catch (err) {
    console.error("persistStatusSnapshot failed", err);
  }
}

interface SourceRef {
  type: string;
  name: string;
  detail?: string;
}

async function buildDealContext(supabase: any, dealId: string, opts?: { includeDocContent?: boolean; supabaseService?: any; scope?: string; includeDataRoom?: boolean }) {
  const [
    dealResult, writeupResult, lendersResult, milestonesResult,
    activityResult, memoResult, dealSpaceDocsResult, dataRoomDocsResult, flagNotesResult,
    notesResult, outstandingResult, transcriptsResult, checklistResult,
  ] = await Promise.all([
    supabase.from("deals").select("company, value, stage, status, deal_type, business_model, contact, contact_info, company_url, deal_owner, manager, referred_by, engagement_type, exclusivity, created_at, updated_at, is_flagged, flag_notes, notes, pre_signing_hours, post_signing_hours, retainer_fee, milestone_fee, success_fee_percent, total_fee, ai_custom_instructions").eq("id", dealId).single(),
    supabase.from("deal_writeups").select("company_name, description, industry, location, year_founded, headcount, capital_ask, use_of_funds, deal_type, b2b_b2c, revenue_type, billing_model, gross_margins, profitability, last_year_revenue, this_year_revenue, total_equity_raised, sponsorship, collateral_available, existing_debt_details, accounting_system, company_url, linkedin_url, data_room_url, company_highlights, key_items, financial_years, financial_comments").eq("deal_id", dealId).single(),
    supabase.from("deal_lenders").select("id, name, stage, substage, tracking_status, quote_amount, quote_rate, quote_term, notes, pass_reason").eq("deal_id", dealId).order("created_at", { ascending: false }).limit(30),
    supabase.from("deal_milestones").select("title, completed, due_date, completed_at").eq("deal_id", dealId).order("position").limit(20),
    supabase.from("activity_logs").select("activity_type, description, user_display_name, created_at").eq("deal_id", dealId).order("created_at", { ascending: false }).limit(30),
    supabase.from("deal_memos").select("narrative, highlights, hurdles, analyst_notes, lender_notes, other_notes").eq("deal_id", dealId).single(),
    supabase.from("deal_space_documents").select("id, name, file_path, content_type, size_bytes, created_at, extracted_text, extraction_status").eq("deal_id", dealId),
    supabase.from("deal_attachments").select("id, name, file_path, content_type, category, size_bytes, created_at, extracted_text, extraction_status").eq("deal_id", dealId),
    supabase.from("deal_flag_notes").select("note, created_at").eq("deal_id", dealId).order("created_at", { ascending: false }).limit(10),
    // New: deal space notes
    supabase.from("deal_space_notes").select("id, title, content, created_at, linked_lender_id").eq("deal_id", dealId).order("created_at", { ascending: false }).limit(20),
    // New: outstanding items
    supabase.from("outstanding_items").select("description, status, priority, due_date, notes, assigned_to, lender_id").eq("deal_id", dealId).order("position").limit(30),
    // New: CLAAP transcripts
    supabase.from("claap_transcripts").select("id, summary, transcript_text, recorded_at, call_type, participants, duration_seconds").eq("deal_id", dealId).order("recorded_at", { ascending: false }).limit(5),
    // New: checklist items
    supabase.from("deal_checklist_items").select("name, category, is_required").eq("deal_id", dealId).limit(30),
  ]);

  const deal = dealResult.data;
  const writeup = writeupResult.data;
  const lenders = lendersResult.data || [];
  const milestones = milestonesResult.data || [];
  const activities = activityResult.data || [];
  const memo = memoResult.data;
  // Honor per-deal "Remove from Deal Space" exclusions so that
  // detached files do not bleed into Ask AI for this specific deal.
  const { data: exclusionsRaw } = await supabase
    .from("deal_document_exclusions")
    .select("document_source, document_id")
    .eq("deal_id", dealId);
  const excludedKeys = new Set<string>(
    (exclusionsRaw || []).map((r: any) => `${r.document_source}:${r.document_id}`)
  );
  const dealSpaceDocs = (dealSpaceDocsResult.data || []).filter(
    (d: any) => !excludedKeys.has(`deal_space:${d.id}`)
  );
  const dataRoomDocs = (dataRoomDocsResult.data || []).filter(
    (d: any) => !excludedKeys.has(`data_room:${d.id}`)
  );
  const flagNotes = flagNotesResult.data || [];
  const notes = notesResult.data || [];
  const outstandingItems = outstandingResult.data || [];
  const transcripts = transcriptsResult.data || [];
  const checklistItems = checklistResult.data || [];

  // Fetch contact names from master_lenders for lender contact resolution
  let lenderContactMap: Record<string, string> = {};
  if (lenders.length > 0) {
    const lenderNames = lenders.map((l: any) => l.name).filter(Boolean);
    if (lenderNames.length > 0) {
      const { data: masterLenders } = await supabase
        .from("master_lenders")
        .select("name, contact_name")
        .in("name", lenderNames);
      if (masterLenders) {
        for (const ml of masterLenders) {
          if (ml.contact_name) lenderContactMap[ml.name] = ml.contact_name;
        }
      }
    }
  }

  // Track sources used
  const sourcesUsed: SourceRef[] = [];

  const fmt = (val: number | null | undefined) => val != null ? `$${val.toLocaleString()}` : 'N/A';
  const fmtDate = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString() : 'N/A';

  // ── Deal info block ──
  let dealInfo = '';
  if (deal) {
    sourcesUsed.push({ type: 'deal_record', name: 'Deal Record' });
    dealInfo = `
**DEAL INFORMATION:**
- Company: ${deal.company || 'N/A'}
- Deal Value: ${fmt(deal.value)}
- Stage: ${deal.stage || 'N/A'}
- Status: ${deal.status || 'N/A'}
- Deal Type: ${deal.deal_type || 'Not specified'}
- Business Model: ${deal.business_model || 'Not specified'}
- Contact: ${deal.contact || 'N/A'} / ${deal.contact_info || 'N/A'}
- Company URL: ${deal.company_url || 'N/A'}
- Deal Owner: ${deal.deal_owner || 'N/A'}
- Manager: ${deal.manager || 'N/A'}
- Referred By: ${deal.referred_by || 'N/A'}
- Engagement: ${deal.engagement_type || 'N/A'} | Exclusivity: ${deal.exclusivity || 'N/A'}
- Created: ${fmtDate(deal.created_at)} | Updated: ${fmtDate(deal.updated_at)}
- Flagged: ${deal.is_flagged ? 'Yes' : 'No'}${deal.flag_notes ? ` — ${deal.flag_notes}` : ''}
- Notes: ${deal.notes || 'None'}
- Fees: Retainer ${fmt(deal.retainer_fee)} | Milestone ${fmt(deal.milestone_fee)} | Success ${deal.success_fee_percent != null ? `${deal.success_fee_percent}%` : 'N/A'} | Total ${fmt(deal.total_fee)}
`;
  }

  // ── Write-up block ──
  let writeupInfo = '';
  if (writeup) {
    sourcesUsed.push({ type: 'deal_writeup', name: 'Deal Write-Up' });
    writeupInfo = `
**DEAL WRITE-UP:**
- Company: ${writeup.company_name || 'N/A'} | Industry: ${writeup.industry || 'N/A'} | Location: ${writeup.location || 'N/A'}
- Founded: ${writeup.year_founded || 'N/A'} | Headcount: ${writeup.headcount || 'N/A'}
- Description: ${writeup.description || 'None'}
- Capital Ask: ${writeup.capital_ask || 'N/A'} | Use of Funds: ${writeup.use_of_funds || 'N/A'}
- Deal Type: ${writeup.deal_type || 'N/A'} | B2B/B2C: ${writeup.b2b_b2c || 'N/A'}
- Revenue Type: ${writeup.revenue_type || 'N/A'} | Billing: ${writeup.billing_model || 'N/A'}
- Gross Margins: ${writeup.gross_margins || 'N/A'} | Profitability: ${writeup.profitability || 'N/A'}
- Last Year Revenue: ${writeup.last_year_revenue || 'N/A'} | This Year Revenue: ${writeup.this_year_revenue || 'N/A'}
- Total Equity Raised: ${writeup.total_equity_raised || 'N/A'}
- Sponsorship: ${writeup.sponsorship || 'N/A'}
- Collateral: ${writeup.collateral_available || 'N/A'}
- Existing Debt: ${writeup.existing_debt_details || 'None'}
${writeup.company_highlights ? `- Highlights: ${JSON.stringify(writeup.company_highlights)}` : ''}
${writeup.financial_years ? `- Financial Years: ${JSON.stringify(writeup.financial_years)}` : ''}
${writeup.financial_comments ? `- Financial Comments: ${JSON.stringify(writeup.financial_comments)}` : ''}
`;
  }

  // ── Memo block ──
  let memoInfo = '';
  if (memo) {
    sourcesUsed.push({ type: 'deal_memo', name: 'Deal Memo' });
    memoInfo = `
**DEAL MEMO:**
${memo.narrative ? `- Narrative: ${truncate(memo.narrative, 3000)}` : ''}
${memo.highlights ? `- Highlights: ${truncate(memo.highlights, 2000)}` : ''}
${memo.hurdles ? `- Hurdles: ${truncate(memo.hurdles, 2000)}` : ''}
${memo.analyst_notes ? `- Analyst Notes: ${truncate(memo.analyst_notes, 2000)}` : ''}
${memo.lender_notes ? `- Lender Notes: ${truncate(memo.lender_notes, 2000)}` : ''}
${memo.other_notes ? `- Other Notes: ${truncate(memo.other_notes, 2000)}` : ''}
`;
  }

  // ── Flag notes block ──
  let flagNotesInfo = '';
  if (flagNotes.length > 0) {
    sourcesUsed.push({ type: 'flag_notes', name: 'Flag Notes' });
    flagNotesInfo = `
**FLAG NOTES:**
${flagNotes.map((n: any) => `- [${fmtDate(n.created_at)}] ${n.note}`).join('\n')}
`;
  }

  // ── Lenders block ──
  let lendersInfo = '';
  const activeLenders = lenders.filter((l: any) => l.stage !== 'Passed' && l.tracking_status !== 'passed');
  const passedLenders = lenders.filter((l: any) => l.stage === 'Passed' || l.tracking_status === 'passed');
  if (lenders.length > 0) {
    sourcesUsed.push({ type: 'lenders', name: `Lenders (${lenders.length})` });
    lendersInfo = `
**LENDERS (${lenders.length} total — ${activeLenders.length} active, ${passedLenders.length} passed):**
${lenders.map((l: any, i: number) => `${i + 1}. ${l.name}
   - Contact: ${lenderContactMap[l.name] || 'N/A'}
   - Stage: ${l.stage || 'N/A'}${l.substage ? ` / ${l.substage}` : ''}
   - Status: ${l.tracking_status || 'Active'}
   ${l.quote_amount ? `- Quote: ${fmt(l.quote_amount)}${l.quote_rate ? ` @ ${l.quote_rate}%` : ''}${l.quote_term ? ` / ${l.quote_term}` : ''}` : ''}
   ${l.notes ? `- Notes: ${truncate(l.notes, 500)}` : ''}
   ${l.pass_reason ? `- PASS REASON: ${l.pass_reason}` : ''}`).join('\n')}
`;
  }

  // ── Milestones block ──
  let milestonesInfo = '';
  if (milestones.length > 0) {
    sourcesUsed.push({ type: 'milestones', name: `Milestones (${milestones.length})` });
    const completed = milestones.filter((m: any) => m.completed).length;
    milestonesInfo = `
**MILESTONES (${completed}/${milestones.length} completed):**
${milestones.map((m: any, i: number) => `${i + 1}. ${m.completed ? '✓' : '○'} ${m.title}${m.due_date ? ` (Due: ${fmtDate(m.due_date)})` : ''}`).join('\n')}
`;
  }

  // ── Activity block (summarized for token budget) ──
  let activityInfo = '';
  if (activities.length > 0) {
    sourcesUsed.push({ type: 'activity', name: `Recent Activity (${activities.length})` });
    // Show recent 10 in detail, summarize older
    const recent = activities.slice(0, 10);
    const older = activities.slice(10);
    activityInfo = `
**RECENT ACTIVITY (last ${activities.length}):**
${recent.map((a: any) => `- [${fmtDate(a.created_at)}] ${a.activity_type}: ${a.description}${a.user_display_name ? ` (${a.user_display_name})` : ''}`).join('\n')}`;
    if (older.length > 0) {
      const typeCounts: Record<string, number> = {};
      for (const a of older) {
        typeCounts[a.activity_type] = (typeCounts[a.activity_type] || 0) + 1;
      }
      activityInfo += `\n  [+ ${older.length} older: ${Object.entries(typeCounts).map(([t, c]) => `${c}× ${t}`).join(', ')}]`;
    }
    activityInfo = truncate(activityInfo, MAX_ACTIVITY_SUMMARY_CHARS);
  }

  // ── Deal space notes (NEW) ──
  let notesInfo = '';
  if (notes.length > 0) {
    sourcesUsed.push({ type: 'notes', name: `Deal Notes (${notes.length})` });
    notesInfo = `
**DEAL NOTES (${notes.length}):**
${notes.map((n: any) => `- **${n.title || 'Untitled'}** [${fmtDate(n.created_at)}]: ${truncate(n.content || '', MAX_NOTE_CHARS)}`).join('\n')}
`;
  }

  // ── Outstanding items (NEW) ──
  let outstandingInfo = '';
  if (outstandingItems.length > 0) {
    sourcesUsed.push({ type: 'outstanding_items', name: `Outstanding Items (${outstandingItems.length})` });
    const pending = outstandingItems.filter((i: any) => i.status !== 'completed');
    const done = outstandingItems.filter((i: any) => i.status === 'completed');
    outstandingInfo = `
**OUTSTANDING ITEMS (${pending.length} pending, ${done.length} completed):**
${pending.map((i: any) => `- [${i.priority}] ${i.description}${i.status !== 'pending' ? ` (${i.status})` : ''}${i.due_date ? ` — Due: ${fmtDate(i.due_date)}` : ''}${i.notes ? ` — ${truncate(i.notes, 200)}` : ''}`).join('\n')}
${done.length > 0 ? `  [+ ${done.length} completed items]` : ''}
`;
  }

  // ── CLAAP transcripts (NEW) ──
  let transcriptsInfo = '';
  if (transcripts.length > 0) {
    sourcesUsed.push({ type: 'transcripts', name: `Call Transcripts (${transcripts.length})` });
    transcriptsInfo = `
**CALL TRANSCRIPTS (${transcripts.length}):**
${transcripts.map((t: any) => {
      const duration = t.duration_seconds ? `${Math.round(t.duration_seconds / 60)}min` : '';
      const header = `- **${t.call_type || 'Call'}** [${fmtDate(t.recorded_at)}]${duration ? ` (${duration})` : ''}`;
      const summary = t.summary ? `\n  Summary: ${truncate(t.summary, 1500)}` : '';
      const transcript = t.transcript_text ? `\n  Transcript excerpt: ${truncate(t.transcript_text, MAX_TRANSCRIPT_CHARS)}` : '';
      return header + summary + transcript;
    }).join('\n')}
`;
  }

  // ── Checklist items (NEW) ──
  let checklistInfo = '';
  if (checklistItems.length > 0) {
    sourcesUsed.push({ type: 'checklist', name: `Checklist Items (${checklistItems.length})` });
    const byCategory = checklistItems.reduce((acc: Record<string, string[]>, i: any) => {
      const cat = i.category || 'General';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(`${i.is_required ? '●' : '○'} ${i.name}`);
      return acc;
    }, {});
    checklistInfo = `
**CHECKLIST / REQUIRED ITEMS:**
${Object.entries(byCategory).map(([cat, items]) => `  ${cat}:\n${(items as string[]).map(i => `    ${i}`).join('\n')}`).join('\n')}
`;
  }

  // ── Document inventory ──
  let docInventory = '';
  if (dealSpaceDocs.length > 0) {
    docInventory += `**Deal Space Documents (${dealSpaceDocs.length}):**\n` + dealSpaceDocs.map((d: any) => `- ${d.name}`).join('\n') + '\n\n';
  }
  if (dataRoomDocs.length > 0) {
    const byCategory = dataRoomDocs.reduce((acc: Record<string, string[]>, d: any) => {
      const cat = d.category || 'Uncategorized';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(d.name);
      return acc;
    }, {});
    docInventory += `**Data Room Documents (${dataRoomDocs.length}):**\n`;
    for (const [category, files] of Object.entries(byCategory)) {
      docInventory += `  ${category}:\n${(files as string[]).map(f => `    - ${f}`).join('\n')}\n`;
    }
  }
  if (!docInventory) docInventory = 'No documents uploaded yet.';

  // ── Fetch actual document content if requested (limited to avoid CPU timeout) ──
  let docContentBlock = '';
  if (opts?.includeDocContent) {
    const includeDataRoom = opts.includeDataRoom !== false;
    const allDocs: any[] = [
      ...dealSpaceDocs.map((d: any) => ({ ...d, _origin: 'deal_space' })),
      ...(includeDataRoom ? dataRoomDocs.map((d: any) => ({ ...d, _origin: 'data_room' })) : []),
    ];
    let docsToFetch = allDocs;
    if (opts.scope === 'financial') {
      const { data: financialFiles } = await supabase
        .from('deal_space_financials')
        .select('id, name, file_path, content_type, extracted_text')
        .eq('deal_id', dealId);
      docsToFetch = (financialFiles || []).map((f: any) => ({ ...f, _origin: 'deal_space' }));
    } else if (opts.scope === 'transcripts') {
      docsToFetch = allDocs.filter((d: any) => {
        const name = (d.name || '').toLowerCase();
        const ct = (d.content_type || '').toLowerCase();
        return name.includes('transcript') || name.includes('call') || name.includes('meeting') ||
               ct.includes('text/') || name.endsWith('.txt') || name.endsWith('.md');
      });
    }

    // Use pre-extracted text from the database (populated by deal-document-extract).
    // This lets us inject PDF/DOCX/XLSX content without runtime CPU pressure.
    const docsWithText = docsToFetch.filter((d: any) => d.extracted_text && d.extracted_text.length > 50);

    // Inline fallback for plain-text files (.txt/.md/.csv) that have no
    // extracted_text yet — read them synchronously from storage so the AI can
    // answer immediately, even if the upload-time extraction job hasn't run.
    // Bounded by a 30s wall-clock budget across all fallback reads to avoid
    // hanging the request; whatever was retrieved within the budget is used
    // and the rest is reported as "partial".
    const PLAIN_TEXT_RE = /\.(txt|md|csv|log)$/i;
    const plainTextPending = docsToFetch.filter((d: any) =>
      (!d.extracted_text || d.extracted_text.length < 50) &&
      PLAIN_TEXT_RE.test(d.name || '')
    );
    let partialExtraction = false;
    if (plainTextPending.length > 0 && opts.supabaseService) {
      const TIMEOUT_MS = 30_000;
      const deadline = Date.now() + TIMEOUT_MS;
      for (const doc of plainTextPending) {
        if (Date.now() >= deadline) { partialExtraction = true; break; }
        try {
          const bucket = doc._origin === 'data_room' ? 'deal-attachments' : 'deal-space';
          const remaining = Math.max(1000, deadline - Date.now());
          const dl: any = await Promise.race([
            opts.supabaseService.storage.from(bucket).download(doc.file_path),
            new Promise((resolve) => setTimeout(() => resolve({ data: null, error: { message: 'timeout' } }), remaining)),
          ]);
          if (!dl?.data) { partialExtraction = true; continue; }
          const text = await dl.data.text();
          if (text && text.trim().length > 0) {
            doc.extracted_text = text.length > 200_000 ? text.slice(0, 200_000) + '\n...[truncated]' : text;
            docsWithText.push(doc);
            // Persist for next time (fire-and-forget; ignore errors).
            const table = doc._origin === 'data_room' ? 'deal_attachments' : 'deal_space_documents';
            opts.supabaseService.from(table).update({
              extracted_text: doc.extracted_text,
              extraction_status: 'success',
              extracted_at: new Date().toISOString(),
            }).eq('id', doc.id).then(() => {}, () => {});
          }
        } catch (err) {
          console.warn('[deal-space-ai] inline txt extract failed:', err);
          partialExtraction = true;
        }
      }
    }

    const chunks: string[] = [];
    let totalChars = 0;
    for (const doc of docsWithText) {
      if (totalChars >= MAX_DOC_CONTENT_CHARS) break;
      const remaining = MAX_DOC_CONTENT_CHARS - totalChars;
      const slice = truncate(doc.extracted_text, Math.min(MAX_SINGLE_DOC_CHARS, remaining));
      const origin = doc._origin === 'data_room' ? 'Data Room' : 'Deal Space';
      chunks.push(`### ${doc.name}  _(${origin})_\n${slice}`);
      totalChars += slice.length;
      sourcesUsed.push({ type: 'document_content', name: doc.name });
    }
    if (chunks.length > 0) {
      docContentBlock = `\n**DOCUMENT CONTENT (${chunks.length} file${chunks.length === 1 ? '' : 's'} from knowledge base):**\n\n${chunks.join('\n\n---\n\n')}`;
    }
    const pendingCount = docsToFetch.length - docsWithText.length;
    if (pendingCount > 0) {
      docContentBlock += `\n[${pendingCount} additional document${pendingCount === 1 ? '' : 's'} attached but text not yet extracted — they will become searchable shortly after upload.]`;
    }
    if (partialExtraction) {
      docContentBlock += `\nNote: document processing was partial — some content may be missing.`;
    }
  }

  const fullContext = [
    dealInfo, writeupInfo, memoInfo, flagNotesInfo, lendersInfo, 
    milestonesInfo, outstandingInfo, notesInfo, transcriptsInfo, 
    checklistInfo, activityInfo
  ].filter(Boolean).join('\n');

  return {
    fullContext: truncate(fullContext, MAX_CONTEXT_CHARS),
    docInventory,
    docContentBlock,
    deal,
    writeup,
    lenders,
    activeLenders,
    passedLenders,
    memo,
    milestones,
    activities,
    dealSpaceDocs,
    dataRoomDocs,
    notes,
    outstandingItems,
    transcripts,
    checklistItems,
    sourcesUsed,
  };
}

// ─── Output validation / normalization ──────────────────────────────

function validateAndNormalizeMemo(raw: string): { content: string; sections: Record<string, string> } {
  const sections: Record<string, string> = {};
  let normalized = raw;

  const headingAliases: Record<string, string> = {
    "executive overview": "Executive / Deal Overview",
    "deal overview": "Executive / Deal Overview",
    "executive summary": "Executive / Deal Overview",
    "executive / deal overview": "Executive / Deal Overview",
    "facility overview": "Facility Overview",
    "proposed facility": "Facility Overview",
    "requested facility": "Facility Overview",
    "financial profile": "Financial Profile",
    "financial summary": "Financial Profile",
    "financials": "Financial Profile",
    "key credit strengths": "Key Credit Strengths",
    "credit strengths": "Key Credit Strengths",
    "strengths": "Key Credit Strengths",
    "key risks & hurdles": "Key Risks & Hurdles",
    "key risks and hurdles": "Key Risks & Hurdles",
    "risks & hurdles": "Key Risks & Hurdles",
    "risks and hurdles": "Key Risks & Hurdles",
    "lender process & status": "Lender Process & Status",
    "lender process and status": "Lender Process & Status",
    "lender status": "Lender Process & Status",
    "current status / lender sentiment": "Lender Process & Status",
    "lender sentiment": "Lender Process & Status",
    "recommendation / next steps": "Recommendation / Next Steps",
    "recommendation and next steps": "Recommendation / Next Steps",
    "next steps": "Recommendation / Next Steps",
    "recommendations": "Recommendation / Next Steps",
  };

  for (const [alias, canonical] of Object.entries(headingAliases)) {
    const regex = new RegExp(`^##\\s*${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'gmi');
    normalized = normalized.replace(regex, `## ${canonical}`);
  }

  for (const section of MEMO_SECTIONS) {
    const pattern = new RegExp(`## ${section.heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`, 'i');
    const match = normalized.match(pattern);
    sections[section.key] = match ? match[1].trim() : '';
  }

  return { content: normalized, sections };
}

// ─── Main server ────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

    const { messages, dealId, action, sectionKey, documentId, scope, stream, conversationId, includeDataRoom } = await req.json();

    // 5th Line proprietary actions: hard-enforce company gating server-side
    // so non-5th-Line users cannot invoke these features via direct API
    // calls. Mirrors the UI gate `canUse5thLineProprietaryActions`.
    const PROPRIETARY_ACTIONS = new Set(["extract-writeup", "generate-memo", "regenerate-section"]);
    if (action && PROPRIETARY_ACTIONS.has(action)) {
      const callerEmail = String((claimsData.claims as any)?.email || "").toLowerCase();
      const isFifthLine = callerEmail.endsWith("@5thline.co") || callerEmail.endsWith("@naitive.co");
      if (!isFifthLine) {
        return new Response(
          JSON.stringify({ error: "Forbidden: 5th Line proprietary action" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (action === "summarize") return await handleSummarize(dealId, supabaseUser, supabaseService);
    if (action === "extract-writeup") return await handleExtractWriteUp(dealId, supabaseUser, supabaseService);
    if (action === "generate-memo") return await handleGenerateMemo(dealId, supabaseUser);
    if (action === "regenerate-section") return await handleRegenerateSection(dealId, sectionKey, supabaseUser);
    if (action === "extract-document") return await handleExtractDocument(dealId, supabaseUser, supabaseService, documentId);

    // ── Chat mode (Ask AI) ──────────────────────────────────────────
    if (!dealId || !messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "dealId and messages are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = supabaseUser;
    const ctx = await buildDealContext(supabase, dealId, {
      includeDocContent: true,
      supabaseService,
      scope: scope || 'all',
      includeDataRoom: includeDataRoom !== false,
    });

    // ── Scope-aware filtering ──
    const activeScope = scope || 'all';
    let scopedDocInventory = ctx.docInventory;
    let scopeInstruction = '';

    if (activeScope === 'financial') {
      const { data: financialFiles } = await supabase
        .from('deal_space_financials')
        .select('name, content_type, notes, fiscal_year, fiscal_period')
        .eq('deal_id', dealId);

      const financialNames = (financialFiles || []).map((f: any) => f.name);
      scopedDocInventory = financialNames.length > 0
        ? `**Financial Models Only (${financialNames.length}):**\n` + financialNames.map((n: string) => `- ${n}`).join('\n')
        : 'No financial models ingested yet.';

      scopeInstruction = `
SCOPE RESTRICTION: The user has selected "Financial Model Only" scope.
- Only reference data from financial model files: ${financialNames.join(', ')}
- Do NOT use data from transcripts or non-financial documents.
- If asked about data not in these files, clearly state it is not available in the selected scope.
`;
    } else if (activeScope === 'transcripts') {
      scopeInstruction = `
SCOPE RESTRICTION: The user has selected "Transcripts Only" scope.
- Only reference data from transcript/meeting/call documents and CLAAP transcripts.
- Do NOT use data from financial models or spreadsheets.
- If asked about data not in transcripts, clearly state it is not available in the selected scope.
`;
    }

    // Build source labels for citation
    const sourceLabels = ctx.sourcesUsed.map((s, i) => `[${i + 1}] ${s.name}`).join(', ');

    // ── Persistent memory: load up to 10 prior exchanges (20 messages) for this deal ──
    // Used to provide cross-session context. We pull from the most recently-updated
    // conversation for the deal+user; if `conversationId` is supplied we honor that.
    let priorMemoryBlock = '';
    try {
      let memConvId: string | null = conversationId || null;
      if (!memConvId) {
        const { data: latestConv } = await supabase
          .from('deal_space_conversations')
          .select('id')
          .eq('deal_id', dealId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        memConvId = latestConv?.id || null;
      }
      if (memConvId) {
        const { data: priorMsgs } = await supabase
          .from('deal_space_messages')
          .select('role, content, created_at')
          .eq('conversation_id', memConvId)
          .order('created_at', { ascending: false })
          .limit(12);
        const ordered = (priorMsgs || []).reverse();
        // Skip prior messages that duplicate what the client sent in `messages`.
        const incomingFirst = messages?.[0]?.content || '';
        // Cap at the last 12 turns and truncate long messages before replaying.
        const filtered = compactHistory(
          ordered.filter((m: any) => m.content !== incomingFirst),
          { maxTurns: 12, maxCharsPerMessage: 800, maxTotalChars: 8000 },
        );
        if (filtered.length > 0) {
          priorMemoryBlock = `\n\n**PRIOR CONVERSATION HISTORY (last ${Math.ceil(filtered.length / 2)} exchanges, for continuity):**\n` +
            filtered.map((m: any) => `${m.role === 'user' ? 'User' : 'AI'}: ${truncate(m.content, 800)}`).join('\n');
        }
      }
    } catch (memErr) {
      console.warn('Prior memory load failed (continuing):', memErr);
    }

    // ── Custom per-deal AI instructions ──
    const customInstructions = (ctx.deal?.ai_custom_instructions || '').trim();
    const customInstructionsBlock = customInstructions
      ? `\n\n**CUSTOM INSTRUCTIONS FOR THIS DEAL (set by the deal team — follow these strictly):**\n${truncate(customInstructions, 4000)}`
      : '';

    const systemPrompt = `You are Naitive Deal AI, a deal-specific AI assistant for deal managers inside a single deal workspace.

# PRIMARY ROLE
You are the "know all" resource for the currently open deal. Answer accurately, clearly, and concisely using ONLY the information available from the active deal context below.

# RESPONSE FORMATTING — LISTS MUST BE BULLETS
ANY time the answer contains more than one item (lenders, contacts, milestones,
outstanding items, documents, dates, risks, etc.), you MUST format it as a
markdown bullet list — one item per line, each line starting with "- ".
- Never return list-style answers as comma-separated sentences or numbered paragraphs.
- Never inline multiple items into a single line.
- Group bullets under bold sub-headings when it aids scanning (e.g. **Active:**, **Passed:**).
- Keep prose intros to 1 short sentence (or none) before the bullets.

# LENDER / FUNDING SOURCE FORMATTING
When the user asks about lenders, funding sources, active lenders, who's engaged,
who's passed, or any list of lenders for this deal, ALWAYS respond as a clean
markdown bullet list. One bullet per lender, in this exact shape:

- **{Lender Name}** — {Current Status / Stage} — Notes: {notes for this deal, or "None"}

Rules:
- Pull strictly from the LENDERS block in the deal context above (this deal only).
- Status = the lender's current stage/substage as recorded on this deal.
- Notes = the per-deal notes for that lender. If empty, write "Notes: None".
- Do not invent lenders, statuses, or notes. Do not pull in lenders from other deals.
- Group sensibly when helpful (e.g., "**Active:**" then bullets, "**Passed:**" then bullets),
  but keep the bullet shape above for every individual lender.
- Keep notes readable: preserve line breaks as needed and don't truncate meaningful detail.

${customInstructionsBlock}

${ctx.fullContext}

${ctx.docContentBlock}
${priorMemoryBlock}

**DOCUMENT INVENTORY (Scope: ${activeScope === 'all' ? 'All Documents' : activeScope === 'financial' ? 'Financial Models Only' : activeScope === 'transcripts' ? 'Transcripts Only' : 'Custom'}):**
${scopedDocInventory}

${scopeInstruction}

    **AVAILABLE DATA SOURCES:** ${sourceLabels}

**RETRIEVAL SET (the ONLY valid source_ids + anchors you may cite — never fabricate):**
Each retrieval result is a JSON object: \`{source_id, type, anchor_candidates: [{kind, value, snippet}]}\`.
You MAY only emit a citation \`[src:<source_id>#<anchor>]\` where:
  • \`<source_id>\` exactly matches a \`source_id\` below, AND
  • \`<anchor>\` is built from one of that source's \`anchor_candidates\` (kind+value).
An anchor MUST only be cited if its \`snippet\` was actually used to produce the claim in that sentence. Do NOT cite an anchor you did not draw from.

\`\`\`json
${JSON.stringify(
  [
    ...(ctx.dealSpaceDocs || []).map((d: any) => ({
      source_id: `doc_${d.id}`,
      type: 'document',
      name: d.name,
      anchor_candidates: [{
        kind: 'whole',
        value: 'doc',
        snippet: String(d.extracted_text || '').slice(0, 160),
      }],
    })),
    ...(ctx.dataRoomDocs || []).map((d: any) => ({
      source_id: `doc_${d.id}`,
      type: 'document',
      name: `${d.name} (Data Room)`,
      anchor_candidates: [{
        kind: 'whole',
        value: 'doc',
        snippet: String(d.extracted_text || '').slice(0, 160),
      }],
    })),
    ...(ctx.transcripts || []).map((t: any) => ({
      source_id: `tx_${t.id}`,
      type: 'transcript',
      name: `${t.call_type || 'Call'}${t.recorded_at ? ` ${String(t.recorded_at).slice(0,10)}` : ''}`,
      anchor_candidates: [{
        kind: t.duration_seconds ? 'segment' : 'whole',
        value: t.duration_seconds ? 't0' : 'transcript',
        snippet: String(t.summary || t.transcript_text || '').slice(0, 160),
      }],
    })),
    ...(ctx.notes || []).map((n: any) => ({
      source_id: `note_${n.id}`,
      type: 'note',
      name: n.title || 'Untitled note',
      anchor_candidates: [{
        kind: 'line',
        value: 'l1',
        snippet: String(n.content || '').slice(0, 160),
      }],
    })),
    ...(ctx.lenders || []).filter((l: any) => l.id).map((l: any) => ({
      source_id: `lender_${l.id}`,
      type: 'lender',
      name: l.name,
      anchor_candidates: [{
        kind: 'row',
        value: `row_${l.id}`,
        snippet: `${l.name} — ${l.stage || 'n/a'}`,
      }],
    })),
  ].slice(0, 80),
  null,
  2,
)}
\`\`\`

# CITATION REQUIREMENT
Every factual claim drawn from a source MUST be followed by an inline citation
token of the form \`[src:<source_id>#<anchor>]\`. Anchor encoding rules:
- Document page: \`#p<page>\`  → only when anchor_candidate \`kind=page\`
- Document whole-doc: \`#whole\` → when anchor_candidate \`kind=whole\`
- Transcript timestamp: \`#t<seconds>\` → when anchor_candidate \`kind=segment\`
- Transcript whole: \`#transcript\` → when anchor_candidate \`kind=whole\`
- Note line: \`#l<line>\` → when anchor_candidate \`kind=line\`
- Structured field: \`[src:field_<table>.<column>#row_<id>]\` (kind=row)
- Lender row: \`[src:lender_<id>#row_<id>]\` (kind=row)
- Email: \`[src:email_<id>]\` (no anchor)

Composer constraints (HARD):
- Cite at the SENTENCE level. Max 3 citations per sentence.
- Every quoted string ("…") and every NUMBER (dollars, %, counts, durations) MUST carry a citation.
- Emit a citation ONLY if the cited anchor's \`snippet\` (or the underlying retrieved content for that anchor) was actually used to produce the claim. If you did not consult that anchor, do not cite it.
- NEVER fabricate a \`source_id\` or an anchor value not present in the RETRIEVAL SET. If the claim cannot be tied to a real anchor, omit the citation and tag the sentence with \`[unverified]\`.
- Do NOT cite the same source >2 times consecutively in the same paragraph.
- Citation tokens are render-only chips; do not duplicate them in the trailing \`Sources:\` line.

# AVAILABLE SOURCES (use any/all that apply to the active deal)
Deal Info, Deal Space, Notes, Activity, Write-Up / Deal Memo, Data Room / Documents, Management, Funding Sources / Lenders, and any parsed transcript or extracted document text tied to this deal.

# SCOPE RULES
- Always stay scoped to the currently open deal unless the user explicitly asks to change deals.
- Never answer from another deal unless the user explicitly switches context.
- Do not hallucinate missing information.
- If the answer is not available in the deal sources, say so clearly in one sentence.
- If sources conflict, say so clearly and summarize the conflict in one line.

# LENGTH MODIFIER PARSER (runs BEFORE composing)
Scan (a) the user's current message and (b) the persistent CUSTOM INSTRUCTIONS block above for any of the modifiers below (case-insensitive substring match). If matched, the MODE overrides the default response style. If multiple modifiers match, the LONGEST/most-specific wins (long_form > memo > two_sentences > one_sentence > tldr). Honor the cap literally.

| Trigger phrases | MODE | Hard constraint |
| --- | --- | --- |
| "in one sentence", "one-liner", "headline only" | one_sentence | Exactly 1 sentence, ≤30 words. No bullets. Sources: line still required. |
| "in two sentences", "two sentences" | two_sentences | Exactly 2 sentences, ≤60 words total. No bullets. Sources: line still required. |
| "tl;dr", "tldr", "short", "brief", "quick" | tldr | ≤3 bullets OR ≤50 words prose (pick one). Sources: line still required. |
| "long form", "detailed", "deep dive", "in depth", "full breakdown" | long_form | No length cap. Use H2/H3 sections and tables where helpful. Still cite per sentence. |
| "executive summary", "for IC", "memo style" | memo | 1 headline line + 3–5 bullets. No prose paragraphs. Sources: line still required. |

If NO modifier matches, fall back to the DEFAULT RESPONSE STYLE below.

# DEFAULT RESPONSE STYLE — short, direct Q&A
Unless the user explicitly asks for a memo, report, write-up, long summary, or email draft, EVERY response MUST be EXACTLY TWO LINES:

Line 1: \`A: <direct answer in 1–2 sentences max>\`
Line 2: \`Sources: <comma-separated source names only>\`

Bullets are FORBIDDEN by default. ONLY add a bulleted list between the A: line and the Sources: line if the user EXPLICITLY asked for a list, options, multiple items, "what to do next", a document inventory, or a readiness/gap breakdown. When bullets are warranted, use max 5 bullets, one line each.

Never end with a follow-up offer ("Would you like me to…", "Let me know if…", "Want me to draft…", "I can also…", "Should I…", etc.) UNLESS the user explicitly asked for next options or alternatives. The response must end on the Sources: line.

Never include:
- narrative introductions
- editorial conclusions ("the deal appears well-documented", "progressing well", etc.)
- bold section headers or H1/H2/H3 markdown headings
- repeated summaries or duplicated responses
- follow-up offers or "Would you like me to…" prompts (unless explicitly requested)
- generic AI filler
- per-claim *(Source: …)* inline citations (use the single Sources: line instead)
- markdown tables (unless the user explicitly asks for a table)
- more than 5 bullets (unless explicitly requested)

# YES/NO DOCUMENT EXISTENCE RULE
If the user asks whether a specific document exists, answer in EXACTLY this format:
\`A: Yes — <filename or item name> located in <source/location>.\`
OR
\`A: No — not currently on file.\`
Optional second line ONLY if directly relevant and under 20 words.
Final line: \`Sources: <source names>\`

# DOCUMENT INVENTORY RULE
If the user asks what documents we have, distinguish clearly between:
1. Files physically present in the deal space / data room
2. Items tracked as received/approved (but not physically on file)
3. Items not on file
Never imply a tracked checklist item is a physically accessible file unless it actually appears in the data room or document inventory. Prefer grouped bullets:
- Files on file: <names>
- Tracked as received/approved: <names>
- Missing / not on file: <names>

# READINESS / GAP RULE
If the user asks what is missing, what is blocking, or whether the deal is ready:
- Identify concrete blockers from notes, documents, milestones, and lender activity.
- Be explicit about what is complete vs incomplete.
- Prefer operational clarity over narrative explanation.

# TRANSCRIPT RULE
If transcripts exist: use them as factual sources, summarize clearly, do not overquote, prefer short synthesis over long transcript recap.

# NEXT STEP RULE
If the user asks what to do next, recommend the most logical next actions based on current stage, blockers, open diligence items, and lender activity. Practical, specific, max 5 bullets.

# CONTRADICTION RULE
If asked about inconsistencies, compare notes, write-up, documents, and activity. State only confirmed contradictions or ambiguities. If none, say so directly.

# RELATIONSHIP / HISTORY EXPANSION RULE
When the user asks a relationship or history question that references a sponsor,
management team member, lender, counterparty, referral source, or any named party
(e.g. "have we worked with X before?", "what's our history with Y?", "any prior
deals with this sponsor?", "do we know anyone at Z?"), expand the search scope
BEYOND the current deal to all available sources:
- Other deals where the same person, firm, lender, or sponsor appears (manager, lender list, referredBy, notes, activity, emails, transcripts).
- CRM contacts and companies, prior referrals, and partner channel records.
- Historical activity, notes, and email/transcript mentions across the workspace.

Synthesize a concise cross-deal answer. Always:
- List specific prior deals / engagements by name with stage or outcome when known.
- Name the specific people and their roles.
- If nothing is found across the workspace, say so explicitly ("No prior engagement found across the workspace.").
- Note that scope was expanded beyond this deal in the Sources line (e.g. "Sources: Cross-deal history, CRM, Activity").
Only expand scope for relationship/history questions — keep all other questions strictly scoped to the active deal.

# ANOMALY DETECTOR RULE
RUN THIS PROCEDURE BEFORE COMPOSING THE ANSWER whenever the user's question is
classified as risk, trend_change, or forecast_scenario, OR contains any of:
"weird", "unusual", "spike", "drop", "odd", "off", "wrong", "outlier",
"red flag", "anomaly".

PROCEDURE:
1. Enumerate every numeric time-series available in this deal:
   - Financial Years (annual revenue, EBITDA, gross margin, opex)
   - Monthly P&L / BS / Cash Flow (if present)
   - KPI Dashboard metrics
   - Bank statements
   - Funding Sources progression timestamps
2. For each series with >=3 data points, compute:
   - Period-over-period delta (absolute and %)
   - Trailing-mean and trailing-stdev (window = min(4, n-1))
   - Z-score for each point vs trailing window
   - Direction change (sign flip in growth rate)
3. Flag a point as an ANOMALY when ANY of:
   - |z-score| >= 2.0
   - |% change| >= 30% AND absolute change >= material ($100k or 5% of revenue)
   - Sign flip between consecutive periods on a directional metric (revenue, EBITDA, cash)
   - Ratio break: COGS/Revenue, Opex/Revenue, AR days, or Burn moves >25% vs prior period
4. For each flag, emit a structured object:
   { metric, period, value, prior_value, delta_abs, delta_pct, z, rule_triggered, source_id }
5. If a required series is MISSING, do NOT refuse — explicitly state which series
   is missing and what coverage you DO have. Offer to request the missing series
   via outstanding items.

OUTPUT CONTRACT (always include BEFORE the narrative answer, when this rule fires):
\`\`\`
Anomalies detected: <N>
- <metric> @ <period>: <value> (prior <prior_value>, Δ <delta_abs> / <delta_pct>%, z=<z>) — <rule_triggered> [src: <source_id>]
...
Series checked: <list>
Series missing: <list or "none">
\`\`\`
Then continue with the standard A: / Sources: response, or long-form if explicitly requested.

# QUANTITATIVE-GROUNDING RULE (applies whenever Anomaly Detector fires, or any risk/trend/forecast question)
- The narrative answer MUST reference flagged anomalies by metric + period (e.g. "Revenue @ Q3-2024", "EBITDA @ FY2023").
- NEVER use qualitative risk language ("high burn", "back-loaded", "deteriorating margins", "lumpy revenue", "cash crunch", "runway risk", "concentration risk", etc.) unless EITHER:
  (a) it is accompanied by a specific numeric flag from the Anomaly block (metric + period + value/delta/z), OR
  (b) it is explicitly tagged "(qualitative-only, no quantitative data available)".
- If no series produced a flag and no numeric data is available, state that directly and tag any remaining qualitative observations accordingly. Do not invent severity.

# ANOMALY TOOL CONTRACTS (conceptual — operate over the deal context already provided above)
You have two logical tools you should reason as if calling. The deal context
block above is the data source for both; do not fabricate values that aren't
in it. Always show the tool calls you "ran" in the Anomalies output block.

1) deal.timeSeries({ metric, granularity, deal_id }) -> [{ period, value, source_id }]
   - metric: "revenue" | "ebitda" | "gross_margin" | "opex" | "cogs" | "cash" | "ar_days" | "burn" | "headcount" | "<kpi_name>"
   - granularity: "annual" | "quarterly" | "monthly"
   - Returns the ordered series pulled from Financial Years, monthly P&L/BS/CF,
     KPI Dashboard, or bank statements. source_id identifies the underlying
     source (e.g. "financial_years", "kpi:<id>", "doc:<filename>").

2) deal.anomalies({ deal_id, metrics?: string[], rules?: string[] }) -> AnomalyFlag[]
   - AnomalyFlag = { metric, period, value, prior_value, delta_abs, delta_pct, z, rule_triggered, source_id }
   - rules subset of: "zscore_ge_2", "pct_change_ge_30_material", "sign_flip", "ratio_break_25"
   - When unspecified, run all four rules across every available numeric series with n>=3.

When the Anomaly Detector rule fires, prepend the Anomalies block (defined
above) with the conceptual tool calls you made, e.g.:
\`\`\`
Tools used:
- deal.timeSeries({ metric: "revenue", granularity: "annual" })
- deal.timeSeries({ metric: "ebitda", granularity: "annual" })
- deal.anomalies({ metrics: ["revenue","ebitda","gross_margin"] })
\`\`\`
If a requested series is unavailable in the deal context, report it under
"Series missing" instead of inventing data.

# SEVERITY TAGGING RULE
REQUIRED on every bullet inside answers classified as risk, process,
forecast_scenario, or consistency_check. NEVER use severity tags outside
those answer types.

Tag values (place at the START of each bullet, before any text):
🔴 High | 🟡 Medium | 🟢 Low

SEVERITY RUBRIC — assign the HIGHEST severity when multiple rules apply.

🔴 High — ANY of:
- Anomaly with |z| >= 3 OR |% change| >= 50%
- Cash runway < 6 months
- Compliance/regulatory issue with a named regulator or statute
- Lender on hold blocking close
- Outstanding item past due > 14 days that blocks IC
- Direct contradiction between two on-file sources
- Close-date slip > 30 days vs target

🟡 Medium — ANY of:
- Anomaly with 2 <= |z| < 3 OR 30% <= |% change| < 50%
- Cash runway 6–12 months
- Workstream silent 14–30 days
- Single-lender pass on a thesis-critical concern (burn, size, sector)
- Outstanding item past due 3–14 days
- Forecast vs base case variance 10–25%

🟢 Low — ANY of:
- Informational only, no action required
- Single data-point gap, not on critical path
- Variance < 10%
- General market/industry note

AT THE TOP of any risk/process/forecast/consistency answer, include a one-line
summary BEFORE the A: line (and before the Anomalies block when present):
\`Severity summary: 🔴 <N>  🟡 <N>  🟢 <N>\`
If there are zero bullets, omit the summary entirely (do not show all zeros).

# STATUS RECONCILER RULE
Run on EVERY answer. Compute an AI-derived status from current signals
(Outstanding Items, Lender stages, Activity timeline, Milestones, Anomalies,
severity tags in this answer):
- "Off Track" — any 🔴 High that blocks close, OR close_date has passed, OR no activity in 21+ days.
- "At Risk" — 2+ 🟡 Medium signals, OR primary lender stalled 14+ days, OR a critical milestone overdue.
- "On Track" — no High/Medium friction; advanced-stage lender is progressing; outstanding items current.
- "Stalled" — no inbound/outbound activity in 30+ days AND no scheduled next step.

Compare the derived status against \`deal.header.status_badge\`. If they MISMATCH,
prepend a reconciliation banner as the FIRST line of the answer (before the
Severity summary, before A:, before Anomalies). Exact format:
\`> ⚠️ Status mismatch — header says **<badge>**, signals suggest **<derived>**. Reason: <one-line rationale citing the strongest signal>.\`

If the statuses MATCH, or if there is insufficient signal to derive a status, do NOT emit a banner. Never emit more than one banner per answer.

# STATUS SNAPSHOT (machine-readable, hidden from UI)
At the VERY END of EVERY answer (after the Actions block), append a single
HTML comment carrying the derived status snapshot. The frontend hides HTML
comments; the server parses this to persist the snapshot.

Exact format (one line, no extra whitespace inside the JSON):
\`<!--STATUS_SNAPSHOT:{"derived":"On Track|At Risk|Off Track|Stalled|Unknown","header":"<deal.header.status_badge or empty>","mismatch":true|false,"rationale":"<one short sentence>","signals":{"high":<int>,"medium":<int>,"low":<int>,"stalest_activity_days":<int|null>,"primary_lender_stalled_days":<int|null>,"overdue_outstanding":<int>}}-->\`

If you cannot derive a status, use "derived":"Unknown" with mismatch:false. Always emit the comment exactly once.

# ACTION ROW RULE (REQUIRED — last block of EVERY response)
EVERY answer (including the default 2-line Q&A, long-form, drafting, and risk
answers) MUST end with an "Actions" block containing 2–3 contextual CTAs the
frontend renders as buttons.

OUTPUT CONTRACT — exactly this shape, as the FINAL block of the response:
\`\`\`
Actions:
- [<short label>](action:<type>?<key>=<value>&...)
- [<short label>](action:<type>?<key>=<value>&...)
\`\`\`

Allowed types and params (use ONLY these; URL-encode values with spaces as +):
- draft_email — opens the submission-email drafter. No params required.
- ask_followup?q=<question> — re-prompts Ask AI with the given question.
- create_task?title=<title>&due=<YYYY-MM-DD> — opens task creation modal.
- add_outstanding_item?label=<item name> — adds to outstanding items checklist.
- request_document?doc=<doc name>&owner=<who>&due=<YYYY-MM-DD> — request a specific missing document.
- send_followup?recipient=<name>&subject=<subject>&body=<short draft> — draft a follow-up email (e.g. to a quiet lender).
- update_status?from=<stage>&to=<stage>&reason=<why>&flag=<true|false> — suggest a deal status change or IC flag.
- schedule_task?title=<title>&date=<YYYY-MM-DD>&attendees=<comma list> — schedule a meeting/call.

Rules:
- 2 or 3 actions only. Never 0, 1, or 4+.
- Labels must be ≤ 5 words, action-oriented ("Draft submission email", "Ask: who's the sponsor?", "Add: bank statements", "Create task: chase lender").
- Make actions specific to the user's question and the answer just produced. Do not output generic boilerplate.
- Place the Actions block AFTER the Sources line (or after the long-form memo). Nothing comes after it.
- The block label must be exactly \`Actions:\` (case-sensitive) on its own line, followed by the bullet list.
- Do not wrap the Actions block in code fences.
- Every CTA MUST carry a PREFILLED payload (all required params populated from the deal context). Never emit a CTA with empty params when the type expects them.
- Never emit a CTA the user cannot execute given their current permissions and the available deal data.

SELECTION RULES — pick the 2–3 MOST relevant CTAs for the answer just produced:
- Answer mentions a MISSING document or data point → emit BOTH
    \`request_document?doc=<name>&owner=<who>&due=<+7d>\` AND
    \`add_outstanding_item?label=<name>\`.
- Answer mentions a LENDER who is quiet/stalled → emit
    \`send_followup?recipient=<lender>&subject=<subject>&body=<short draft>\`.
- Answer surfaces a NEW RISK → emit
    \`add_outstanding_item?label=Deal note: <risk>\` AND
    \`update_status?flag=true&reason=<risk>\` (Flag for IC).
- Answer reports a STATUS DELTA → emit
    \`update_status?from=<current>&to=<suggested>&reason=<why>\`.
- Answer summarizes an upcoming MEETING / CALL need → emit
    \`schedule_task?title=<meeting>&date=<YYYY-MM-DD>&attendees=<list>\`.
- Answer is a RECAP / explainer → emit
    \`draft_email\` (Generate Status Report for the deal lead).
When multiple rules match, prefer the 2–3 that best advance the deal RIGHT NOW.

# DRAFTING RULE
If the user asks for an email, memo, status update, or summary: produce ONLY the requested artifact, based strictly on current deal information, concise unless the user explicitly requests long-form.

# SOURCE PRIORITY
When available, prioritize: (1) explicit files / data room documents, (2) notes and activity, (3) deal record metadata, (4) write-up / summaries. If a primary source conflicts with a derived summary, trust the primary source and note the conflict.

# FORMATTING RULES
- Keep answers short by default.
- Use plain English.
- Prefer exact file names when available.
- Prefer exact statuses/stages when available.
- Never repeat the same fact twice.

# ERROR HANDLING
- If retrieval fails or a tool errors, do not pretend confidence.
- Say what could not be verified, and still answer with whatever is confirmed.

# EXAMPLES
User: What stage is this deal in?
A: This deal is in Lenders in Review and is currently On Track.
Sources: Deal Info, Activity

User: Do we have an investor deck on file?
A: Yes — tracked as received and approved, but not visible as a file in the current document inventory.
Sources: Documents, Data Room

User: What documents do we have for this deal?
A: We currently have 2 files visible in the deal space, plus additional checklist items marked received and approved.
- Files on file: Censys Call Recording.docx, lender calls.docx
- Tracked as received/approved: investor deck, financial projections, cap table, KPI dashboard, bank statements, debt schedule
- Missing / not on file: tax return
Sources: Documents, Data Room

User: What should I do next?
A: Keep lender outreach moving while confirming which collected materials are packaged for distribution.
- Confirm the lender-ready document set
- Continue current lender follow-ups
- Push for initial terms next week
Sources: Activity, Documents, Lenders

# LONG-FORM MODE (ONLY when the user explicitly asks for a memo / overview / write-up / long summary / report / full report)
- Produce the FULL standardized memo using all 7 sections:
${getMemoSectionHeadings()}
- For "Key Risks & Hurdles", break into: ### Financial Risks, ### Lender Sentiment & Market Risks, ### Operational & Strategic Risks. Pull from memo hurdles, analyst notes, lender pass reasons, lender notes, flag notes.
- For "Lender Process & Status", include pipeline stage, flagged status, and active vs passed count with names.
- In long-form mode only, cite sources inline as *(Source: [source name])* and reference Data Room / Deal Space files as "Based on [Filename] in the Data Room...".

${FORMATTING_RULES}
`;

    // ── Streaming mode ──
    if (stream) {
      try {
        const compactedMessages = compactHistory(messages);
        console.log("[deal-space-ai] history compaction", historyStats(messages, compactedMessages));
        const anthropicStream = await streamClaude(systemPrompt, compactedMessages, { temperature: 0.2 });

        // Transform Anthropic SSE into a simpler SSE format for the client
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        let assistantBuffer = "";
        const userIdForSnap = String((claimsData.claims as any)?.sub || "") || null;
        const transformStream = new TransformStream({
          transform(chunk, controller) {
            try {
              const text = decoder.decode(chunk, { stream: true });
              // Anthropic SSE lines: data: {...}
              for (const line of text.split("\n")) {
                const trimmed = line.trim();
                if (!trimmed.startsWith("data:")) continue;
                const payload = trimmed.slice(5).trim();
                if (!payload || payload === "[DONE]") continue;
                try {
                  const evt = JSON.parse(payload);
                  const delta = evt?.delta?.text || evt?.content_block?.text;
                  if (typeof delta === "string") assistantBuffer += delta;
                } catch { /* ignore non-JSON keepalive */ }
              }
            } catch { /* ignore decode errors */ }
            controller.enqueue(chunk);
          },
          flush(controller) {
            // Send sources at the end
            const sourcesEvent = `data: ${JSON.stringify({ type: 'sources', sources: ctx.sourcesUsed.map(s => s.name) })}\n\n`;
            controller.enqueue(encoder.encode(sourcesEvent));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            // Fire-and-forget snapshot persist
            persistStatusSnapshot(supabaseService, dealId, assistantBuffer, userIdForSnap);
          }
        });

        const readable = anthropicStream.pipeThrough(transformStream);

        return new Response(readable, {
          headers: {
            ...corsHeaders,
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
          },
        });
      } catch (streamErr) {
        console.error("Streaming error, falling back to non-stream:", streamErr);
        // Fall through to non-streaming
      }
    }

    // ── Non-streaming mode ──
    const claudeResult = await callClaude(systemPrompt, compactHistory(messages), { temperature: 0.2 });
    const rawContent = claudeResult.content || "I couldn't generate a response.";
    const { content } = validateAndNormalizeMemo(rawContent);

    // Build source list from what was actually referenced in the response
    const sources: string[] = ctx.sourcesUsed.map(s => s.name);

    // Persist derived status snapshot (parsed from hidden HTML comment).
    const userIdForSnap = String((claimsData.claims as any)?.sub || "") || null;
    persistStatusSnapshot(supabaseService, dealId, rawContent, userIdForSnap);

    return new Response(
      JSON.stringify({ content, sources }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Deal space AI error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "An error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ─── Generate full structured memo ──────────────────────────────────

async function handleGenerateMemo(dealId: string, supabase: any) {
  try {
    const ctx = await buildDealContext(supabase, dealId);

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

    const systemPrompt = `You are a senior credit analyst writing a lender-ready investment memo. Using ONLY the data provided below, generate a comprehensive memo following the EXACT section structure.

${ctx.fullContext}

${FORMATTING_RULES}

${MEMO_TEMPLATE_INSTRUCTIONS}

IMPORTANT: Use ONLY the data provided. If a data point is missing, write "Not available" for that line item. NEVER fabricate numbers, names, or details.`;

    const claudeResult = await callClaude(systemPrompt, [
      { role: "user", content: "Generate the full lender-ready memo for this deal using all available data." },
    ]);
    const rawContent = claudeResult.content || "";
    const { content, sections } = validateAndNormalizeMemo(rawContent);

    return new Response(
      JSON.stringify({ content, sections }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Generate memo error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Failed to generate memo" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

// ─── Regenerate a single section ────────────────────────────────────

async function handleRegenerateSection(dealId: string, sectionKey: string, supabase: any) {
  try {
    if (!sectionKey) throw new Error("sectionKey is required");
    
    const section = MEMO_SECTIONS.find(s => s.key === sectionKey);
    if (!section) throw new Error(`Unknown section: ${sectionKey}`);
    const ctx = await buildDealContext(supabase, dealId);

    let sectionSpecificInstructions = '';
    if (sectionKey === 'key_risks') {
      sectionSpecificInstructions = `
Output EXACTLY this structure:
## Key Risks & Hurdles

### Financial Risks
- Concise bullets about financial risks (burn rate, margins, liquidity, leverage, covenant risk)

### Lender Sentiment & Market Risks  
- Concise bullets about lender feedback, pass reasons (cite lender names), market conditions

### Operational & Strategic Risks
- Concise bullets about management, governance, concentration, regulatory, use-of-funds concerns

Pull from: memo hurdles ("${ctx.memo?.hurdles || 'none'}"), analyst notes ("${ctx.memo?.analyst_notes || 'none'}"), lender pass reasons and notes, flag notes.`;
    } else if (sectionKey === 'lender_status') {
      sectionSpecificInstructions = `
Output EXACTLY this structure:
## Lender Process & Status
- **Pipeline Stage:** ${ctx.deal?.stage || 'N/A'}
- **Flagged:** ${ctx.deal?.is_flagged ? 'Yes' : 'No'}${ctx.deal?.flag_notes ? ` — ${ctx.deal.flag_notes}` : ''}
- **Lenders Active (${ctx.activeLenders.length}):** ${ctx.activeLenders.map((l: any) => l.name).join(', ') || 'None'}
- **Lenders Passed (${ctx.passedLenders.length}):** ${ctx.passedLenders.map((l: any) => `${l.name}${l.pass_reason ? ` (${l.pass_reason})` : ''}`).join('; ') || 'None'}
${ctx.lenders.filter((l: any) => l.quote_amount).map((l: any) => `- **Quote from ${l.name}:** $${l.quote_amount?.toLocaleString()}${l.quote_rate ? ` @ ${l.quote_rate}%` : ''}${l.quote_term ? ` / ${l.quote_term}` : ''}`).join('\n')}`;
    } else {
      sectionSpecificInstructions = `Output ONLY the "## ${section.heading}" section with its content, following the standardized memo format.`;
    }

    const systemPrompt = `You are a senior credit analyst. Using ONLY the data below, regenerate a single section of a lender-ready memo.

${ctx.fullContext}

${FORMATTING_RULES}

${sectionSpecificInstructions}

IMPORTANT: Output ONLY this one section. Do NOT include other sections. Use ONLY real data — never fabricate.`;

    const claudeResult = await callClaude(systemPrompt, [
      { role: "user", content: `Regenerate the "${section.heading}" section for this deal.` },
    ]);
    const rawContent = claudeResult.content || "";

    return new Response(
      JSON.stringify({ sectionKey, content: rawContent.trim() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Regenerate section error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Failed to regenerate section" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

// ─── Summarize documents ────────────────────────────────────────────

async function handleSummarize(dealId: string, supabase: any, supabaseService: any) {
  try {
    const { data: documents, error: docsError } = await supabase
      .from("deal_space_documents")
      .select("id, name, file_path, content_type")
      .eq("deal_id", dealId);

    if (docsError) throw new Error("Failed to fetch documents");
    if (!documents || documents.length === 0) {
      return new Response(
        JSON.stringify({ error: "No documents to summarize" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const allContents: string[] = [];
    for (const doc of documents) {
      try {
        const { data: fileData, error: downloadError } = await supabaseService.storage.from("deal-space").download(doc.file_path);
        if (downloadError) continue;
        const extracted = await extractContent(fileData, doc.name);
        if (extracted.text && !extracted.text.startsWith("[Binary file:")) {
          allContents.push(`### ${doc.name}\n${extracted.text.substring(0, 20000)}`);
        }
      } catch (err) { console.error(`Error processing ${doc.name}:`, err); }
    }

    if (allContents.length === 0) {
      return new Response(
        JSON.stringify({ error: "Could not extract content from documents" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const combinedContent = allContents.join("\n\n---\n\n");
    const summarizeSystemPrompt = `You are an expert deal analyst. Summarize the documents using the standardized memo structure:

## Executive / Deal Overview
2-3 paragraph overview.

## Financial Profile
Key financial figures and metrics.

## Key Risks & Hurdles
### Financial Risks
### Lender Sentiment & Market Risks
### Operational & Strategic Risks

## Key Action Items
Required next steps or pending items.

Be concise but thorough. Only include sections with relevant content.`;

    const claudeResult = await callClaude(summarizeSystemPrompt, [
      { role: "user", content: `Summarize these deal documents:\n\n${combinedContent}` },
    ]);
    const summary = claudeResult.content || "Could not generate summary.";

    const keyPointsMatch = summary.match(/## Key (?:Action Items|Points)\n([\s\S]*?)(?=\n##|$)/);
    const keyPoints: string[] = [];
    if (keyPointsMatch) {
      const points = keyPointsMatch[1].match(/^[-•]\s*(.+)$/gm);
      if (points) keyPoints.push(...points.map((p: string) => p.replace(/^[-•]\s*/, '').trim()));
    }

    return new Response(
      JSON.stringify({ summary, keyPoints, documentCount: documents.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Summarization error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Summarization failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

// ─── Extract write-up fields (deal-scoped with citations) ───────────

async function handleExtractWriteUp(dealId: string, supabase: any, supabaseService: any) {
  try {
    const [docsResult, financialsResult, dataRoomResult, notesResult, memoResult, dealResult, flagNotesResult, lendersResult] = await Promise.all([
      supabase.from("deal_space_documents").select("id, name, file_path, content_type").eq("deal_id", dealId),
      supabase.from("deal_space_financials").select("id, name, file_path, content_type").eq("deal_id", dealId),
      supabase.from("deal_attachments").select("id, name, file_path, content_type, category").eq("deal_id", dealId),
      supabase.from("deal_space_notes").select("id, title, content, created_at").eq("deal_id", dealId).order("created_at", { ascending: false }).limit(20),
      supabase.from("deal_memos").select("narrative, highlights, hurdles, analyst_notes, lender_notes, other_notes").eq("deal_id", dealId).single(),
      supabase.from("deals").select("company, value, stage, status, deal_type, business_model, company_url, notes, contact, contact_info").eq("id", dealId).single(),
      supabase.from("deal_flag_notes").select("note, created_at").eq("deal_id", dealId).order("created_at", { ascending: false }).limit(10),
      supabase.from("deal_lenders").select("name, stage, substage, tracking_status, quote_amount, quote_rate, quote_term, notes, pass_reason").eq("deal_id", dealId).order("created_at", { ascending: false }).limit(30),
    ]);

    const documents = docsResult.data || [];
    const financials = financialsResult.data || [];
    const dataRoomDocs = dataRoomResult.data || [];
    const notes = notesResult.data || [];
    const memo = memoResult.data;
    const deal = dealResult.data;
    const flagNotes = flagNotesResult.data || [];
    const lenders = lendersResult.data || [];
    const allUploadedDocs = [...documents, ...financials, ...dataRoomDocs];

    const sourceChunks: { source_type: string; source_id: string; source_name: string; location?: string; content: string }[] = [];

    for (const doc of allUploadedDocs) {
      try {
        const bucket = documents.find((d: any) => d.id === doc.id) || financials.find((d: any) => d.id === doc.id) ? "deal-space" : "deal-attachments";
        const { data: fileData, error: downloadError } = await supabaseService.storage.from(bucket).download(doc.file_path);
        if (downloadError) continue;
        const extracted = await extractContent(fileData, doc.name);
        if (extracted.text && !extracted.text.startsWith("[Binary file:")) {
          if (extracted.pages && extracted.pages.length > 0) {
            for (const page of extracted.pages) {
              sourceChunks.push({ source_type: "document", source_id: doc.id, source_name: doc.name, location: `Page ${page.pageNumber}`, content: page.content.substring(0, 5000) });
            }
          } else if (extracted.slides && extracted.slides.length > 0) {
            for (const slide of extracted.slides) {
              sourceChunks.push({ source_type: "document", source_id: doc.id, source_name: doc.name, location: `Slide ${slide.slideNumber}`, content: slide.content.substring(0, 5000) });
            }
          } else if (extracted.sheets && extracted.sheets.length > 0) {
            for (const sheet of extracted.sheets) {
              sourceChunks.push({ source_type: "spreadsheet", source_id: doc.id, source_name: doc.name, location: `Sheet: ${sheet.sheetName}`, content: sheet.content.substring(0, 5000) });
            }
          } else {
            sourceChunks.push({ source_type: "document", source_id: doc.id, source_name: doc.name, content: extracted.text.substring(0, 15000) });
          }
        }
      } catch (err) { console.error(`Error processing ${doc.name}:`, err); }
    }

    for (const note of notes) {
      if (note.content && note.content.trim().length > 10) {
        sourceChunks.push({ source_type: "note", source_id: note.id, source_name: note.title || "Untitled Note", content: note.content.substring(0, 5000) });
      }
    }

    if (memo) {
      const memoSections = [
        { key: "narrative", label: "Narrative" }, { key: "highlights", label: "Highlights" },
        { key: "hurdles", label: "Hurdles" }, { key: "analyst_notes", label: "Analyst Notes" },
        { key: "lender_notes", label: "Lender Notes" }, { key: "other_notes", label: "Other Notes" },
      ];
      for (const s of memoSections) {
        const val = (memo as any)[s.key];
        if (val && val.trim().length > 5) {
          sourceChunks.push({ source_type: "memo", source_id: dealId, source_name: `Deal Memo — ${s.label}`, location: s.label, content: val.substring(0, 5000) });
        }
      }
    }

    if (deal) {
      sourceChunks.push({
        source_type: "structured_data", source_id: dealId, source_name: "Deal Record",
        content: `Company: ${deal.company || 'N/A'}, Value: ${deal.value || 'N/A'}, Stage: ${deal.stage || 'N/A'}, Status: ${deal.status || 'N/A'}, Deal Type: ${deal.deal_type || 'N/A'}, Business Model: ${deal.business_model || 'N/A'}, Company URL: ${deal.company_url || 'N/A'}, Contact: ${deal.contact || 'N/A'}, Contact Info: ${deal.contact_info || 'N/A'}, Notes: ${deal.notes || 'None'}`,
      });
    }

    for (const fn of flagNotes) {
      sourceChunks.push({ source_type: "flag_note", source_id: dealId, source_name: "Deal Flag Note", content: fn.note });
    }

    for (const l of lenders) {
      const parts = [`Lender: ${l.name}, Stage: ${l.stage || 'N/A'}`];
      if (l.notes) parts.push(`Notes: ${l.notes}`);
      if (l.pass_reason) parts.push(`Pass Reason: ${l.pass_reason}`);
      if (l.quote_amount) parts.push(`Quote: $${l.quote_amount}${l.quote_rate ? ` @ ${l.quote_rate}%` : ''}${l.quote_term ? ` / ${l.quote_term}` : ''}`);
      sourceChunks.push({ source_type: "lender", source_id: l.name, source_name: `Lender: ${l.name}`, content: parts.join('. ') });
    }

    if (sourceChunks.length === 0) {
      return new Response(
        JSON.stringify({ extractedFields: [], documentCount: 0, sourceCount: 0, error: "No content found in deal space" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const combinedContent = sourceChunks.map((chunk, i) => 
      `[SOURCE_${i}] (${chunk.source_type}: "${chunk.source_name}"${chunk.location ? `, ${chunk.location}` : ''})\n${chunk.content}`
    ).join("\n\n---\n\n");

    const sourceIndex = sourceChunks.map((chunk, i) => 
      `SOURCE_${i}: type=${chunk.source_type}, name="${chunk.source_name}"${chunk.location ? `, location="${chunk.location}"` : ''}`
    ).join("\n");

    const extractSystemPrompt = `You are an expert at extracting structured deal information from a deal space. You MUST ground every extraction in the specific source material provided. Each source is labeled with a SOURCE_ID.

Extract information and return it as a JSON array of extracted fields.

Each field MUST have:
- "field": the field name (use exact names from the list below)
- "value": the extracted value
- "confidence": "high", "medium", or "low" based on how directly the source supports the value
- "sources": an array of source references, each with:
  - "source_index": the SOURCE_N number
  - "source_type": "document", "spreadsheet", "note", "memo", "structured_data", "flag_note", or "lender"
  - "source_name": the name of the source
  - "location": page/section/sheet reference if applicable (or null)
  - "excerpt": a 1-2 sentence direct quote or paraphrase from the source that supports this value (REQUIRED)

Valid field names:
- companyName, companyUrl, linkedinUrl, industries, location, yearFounded, headcount
- dealTypes, billingModels, profitability, grossMargins, capitalAsk, useOfFunds
- existingDebtDetails, accountingSystem, description
- companyHighlights: array of {id, title, description}
- keyItems: array of {id, title, description}

RULES:
- Only extract fields with clear evidence in the sources.
- ALWAYS include at least one source reference per field.
- If multiple sources support a field, include all of them.
- If sources conflict, set confidence to "medium" and include all conflicting sources.
- NEVER fabricate values not present in the sources.

SOURCE INDEX:
${sourceIndex}

Return ONLY a valid JSON array.`;

    const claudeResult = await callClaude(extractSystemPrompt, [
      { role: "user", content: `Extract deal write-up information from these deal space sources:\n\n${combinedContent.substring(0, 80000)}` },
    ]);

    if (!claudeResult.content) throw new Error("Failed to extract write-up");

    let extractedContent = claudeResult.content || "[]";
    extractedContent = extractedContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let extractedFields = [];
    try {
      extractedFields = JSON.parse(extractedContent);
      if (!Array.isArray(extractedFields)) extractedFields = [];
      
      for (const field of extractedFields) {
        if (field.sources && Array.isArray(field.sources)) {
          for (const src of field.sources) {
            const idx = typeof src.source_index === 'number' ? src.source_index : parseInt(String(src.source_index).replace('SOURCE_', ''));
            if (!isNaN(idx) && idx >= 0 && idx < sourceChunks.length) {
              const chunk = sourceChunks[idx];
              src.source_type = src.source_type || chunk.source_type;
              src.source_name = src.source_name || chunk.source_name;
              src.source_id = chunk.source_id;
              src.location = src.location || chunk.location || null;
            }
          }
        }
        if (field.sources && field.sources.length > 0) {
          field.source = field.sources[0].source_name;
          field.sourceLocation = field.sources[0].location || null;
        }
      }
    } catch (e) {
      console.error("Failed to parse extracted data:", e, extractedContent);
      extractedFields = [];
    }

    const sourceTypes = new Set(sourceChunks.map(s => s.source_type));
    return new Response(
      JSON.stringify({
        extractedFields,
        documentCount: allUploadedDocs.length,
        sourceCount: sourceChunks.length,
        sourceTypes: Array.from(sourceTypes),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Write-up extraction error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Extraction failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

// ─── Extract structured document data (full schema) ─────────────────

async function handleExtractDocument(dealId: string, supabase: any, supabaseService: any, documentId?: string) {
  try {
    let docsToProcess: { id: string; name: string; file_path: string; content_type: string; bucket: string }[] = [];

    if (documentId) {
      const { data: dsDoc } = await supabase.from("deal_space_documents").select("id, name, file_path, content_type").eq("id", documentId).single();
      if (dsDoc) {
        docsToProcess.push({ ...dsDoc, bucket: "deal-space" });
      } else {
        const { data: drDoc } = await supabase.from("deal_attachments").select("id, name, file_path, content_type").eq("id", documentId).single();
        if (drDoc) docsToProcess.push({ ...drDoc, bucket: "deal-attachments" });
      }
    } else {
      const [dsResult, drResult] = await Promise.all([
        supabase.from("deal_space_documents").select("id, name, file_path, content_type").eq("deal_id", dealId),
        supabase.from("deal_attachments").select("id, name, file_path, content_type").eq("deal_id", dealId),
      ]);
      for (const d of (dsResult.data || [])) docsToProcess.push({ ...d, bucket: "deal-space" });
      for (const d of (drResult.data || [])) docsToProcess.push({ ...d, bucket: "deal-attachments" });
    }

    if (docsToProcess.length === 0) {
      return new Response(JSON.stringify({ error: "No documents found" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const docContents: { name: string; text: string; pageCount?: number }[] = [];
    for (const doc of docsToProcess) {
      try {
        const { data: fileData, error: downloadError } = await supabaseService.storage.from(doc.bucket).download(doc.file_path);
        if (downloadError) continue;
        const extracted = await extractContent(fileData, doc.name);
        if (extracted.text && !extracted.text.startsWith("[Binary file:")) {
          let fullText = "";
          if (extracted.sheets && extracted.sheets.length > 0) {
            fullText = extracted.sheets.map(s => `[Sheet: ${s.sheetName}]\n${s.content}`).join("\n\n");
          } else if (extracted.slides && extracted.slides.length > 0) {
            fullText = extracted.slides.map(s => `[Slide ${s.slideNumber}]\n${s.content}`).join("\n\n");
          } else if (extracted.pages && extracted.pages.length > 0) {
            fullText = extracted.pages.map(p => `[Page ${p.pageNumber}]\n${p.content}`).join("\n\n");
          } else {
            fullText = extracted.text;
          }
          docContents.push({
            name: doc.name,
            text: fullText.substring(0, 60000),
            pageCount: extracted.pages?.length || extracted.slides?.length || extracted.sheets?.length || undefined,
          });
        }
      } catch (err) {
        console.error(`Error extracting ${doc.name}:`, err);
      }
    }

    if (docContents.length === 0) {
      return new Response(JSON.stringify({ error: "Could not extract content from any documents" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const combinedDocContent = docContents.map(d => `### Document: ${d.name}\n${d.text}`).join("\n\n---\n\n");

    const lowerNames = docContents.map(d => d.name.toLowerCase()).join(" ");
    const lowerContent = combinedDocContent.substring(0, 5000).toLowerCase();
    const isAgreement = /agreement|loan|credit|facility|covenant|lender|borrower|collateral|security interest|term sheet/.test(lowerContent) ||
                        /agreement|contract|loan/.test(lowerNames);
    const isFinancial = /revenue|ebitda|income statement|balance sheet|cash flow|p&l|profit|loss|gross margin/.test(lowerContent) ||
                        /financial|income|p&l|balance/.test(lowerNames);

    let variantInstructions = "";
    if (isAgreement) {
      variantInstructions = `This appears to be a loan agreement or customer agreement. Focus on extracting contracts, risk_flags with covenants and collateral details.`;
    } else if (isFinancial) {
      variantInstructions = `This appears to be a financial document. Focus on extracting financials.periods, risk_flags for deteriorating metrics.`;
    } else {
      variantInstructions = `Classify this document and extract all applicable sections of the schema.`;
    }

    const systemPrompt = `You are an AI document analyst for a financial services platform.

Your task: Read the document(s) thoroughly and extract structured data into the JSON schema below.

RULES:
- Be precise, conservative, and grounded in the document text.
- Never invent or fabricate data that is not present.
- When ambiguous, return null and explain in meta.uncertainty_notes.
- Numbers: use JSON numbers, not strings. Percentages: numeric without % sign.

${variantInstructions}

OUTPUT SCHEMA (return ONLY this JSON object):
{
  "document_metadata": { "document_type": "string", "title": "string|null", "source_filename": "string|null", "page_count": "number|null", "company_name": "string|null", "company_legal_name": "string|null", "reporting_period": "string|null", "currency": "string|null" },
  "company_profile": { "industry": "string|null", "business_description": "string|null", "hq_location": "string|null", "website": "string|null", "founded_year": "number|null" },
  "financials": { "periods": [{ "label": "string|null", "revenue": "number|null", "arr": "number|null", "mrr": "number|null", "gross_margin_percent": "number|null", "ebitda": "number|null", "ebitda_margin_percent": "number|null", "net_income": "number|null", "opex": { "sales_and_marketing": "number|null", "research_and_development": "number|null", "general_and_administrative": "number|null", "other_opex": "number|null" }, "total_assets": "number|null", "total_liabilities": "number|null", "total_equity": "number|null" }] },
  "cap_table": { "entries": [{ "holder_name": "string", "security_type": "string|null", "shares_or_units": "number|null", "ownership_percent": "number|null", "class_or_series": "string|null" }] },
  "contracts": { "loan_agreements": [{ "lender_name": "string|null", "facility_type": "string|null", "commitment_amount": "number|null", "maturity_date": "string|null", "interest_rate": "string|null", "financial_covenants": "string|null", "security_or_collateral": "string|null" }], "customer_agreements": [{ "customer_name": "string|null", "contract_value": "number|null", "contract_term": "string|null", "renewal_terms": "string|null", "termination_rights": "string|null" }] },
  "risk_flags": [{ "category": "string", "severity": "string", "description": "string", "source_reference": { "page": "number|null", "text_snippet": "string|null" } }],
  "qa_support": { "key_points_summary": "string|null", "qa_ready_context": "string|null" },
  "meta": { "processing_notes": "string|null", "uncertainty_notes": "string|null" }
}`;

    const claudeResult = await callClaude(systemPrompt, [
      { role: "user", content: `Extract structured data from the following document(s):\n\n${combinedDocContent}` },
    ], { temperature: 0.1 });

    let rawContent = claudeResult.content || "{}";
    rawContent = rawContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let extraction;
    try {
      extraction = JSON.parse(rawContent);
    } catch (e) {
      console.error("Failed to parse extraction JSON:", e, rawContent.substring(0, 500));
      extraction = { error: "Failed to parse AI response", raw: rawContent.substring(0, 2000) };
    }

    return new Response(
      JSON.stringify({
        extraction,
        documentsProcessed: docContents.map(d => d.name),
        documentCount: docContents.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Document extraction error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Extraction failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}
