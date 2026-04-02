import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import mammoth from "https://esm.sh/mammoth@1.6.0";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Claude API helper ──────────────────────────────────────────────
async function callClaude(
  systemPrompt: string,
  messages: { role: string; content: string }[],
  options: { model?: string; maxTokens?: number; temperature?: number } = {}
): Promise<{ content: string; raw: any }> {
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

  const model = options.model || "claude-sonnet-4-20250514";
  const maxTokens = options.maxTokens || 4096;
  const temperature = options.temperature ?? 0.7;

  const anthropicMessages = messages.map(m => ({
    role: m.role === "system" ? "user" : m.role,
    content: m.content,
  }));

  const response = await fetch("https://api.anthropic.com/v1/messages", {
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

// ─── Reusable prompt fragments ──────────────────────────────────────

const FORMATTING_RULES = `
CRITICAL FORMATTING RULES — every response MUST follow this structure:
- Use ## for the section headings listed below and ### for sub-headings.
- Use bullet points (- ) for all lists. Use indented bullets (  - ) for sub-items.
- Use **bold** for key terms, labels, and emphasis within bullets.
- NEVER output plain paragraphs when the content has multiple items — always use headings and lists.
- Omit a section entirely if there is genuinely no data; do NOT hallucinate content.
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

// ─── File extraction helpers (unchanged) ────────────────────────────

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
    const result = await mammoth.extractRawText({ arrayBuffer });
    return { text: result.value || "" };
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

async function buildDealContext(supabase: any, dealId: string) {
  const [
    dealResult, writeupResult, lendersResult, milestonesResult,
    activityResult, memoResult, dealSpaceDocsResult, dataRoomDocsResult, flagNotesResult,
  ] = await Promise.all([
    supabase.from("deals").select("company, value, stage, status, deal_type, business_model, contact, contact_info, company_url, deal_owner, manager, referred_by, engagement_type, exclusivity, created_at, updated_at, is_flagged, flag_notes, notes, pre_signing_hours, post_signing_hours, retainer_fee, milestone_fee, success_fee_percent, total_fee").eq("id", dealId).single(),
    supabase.from("deal_writeups").select("company_name, description, industry, location, year_founded, headcount, capital_ask, use_of_funds, deal_type, b2b_b2c, revenue_type, billing_model, gross_margins, profitability, last_year_revenue, this_year_revenue, total_equity_raised, sponsorship, collateral_available, existing_debt_details, accounting_system, company_url, linkedin_url, data_room_url, company_highlights, key_items, financial_years, financial_comments").eq("deal_id", dealId).single(),
    supabase.from("deal_lenders").select("name, stage, substage, tracking_status, quote_amount, quote_rate, quote_term, notes, pass_reason").eq("deal_id", dealId).order("created_at", { ascending: false }).limit(30),
    supabase.from("deal_milestones").select("title, completed, due_date, completed_at").eq("deal_id", dealId).order("position").limit(20),
    supabase.from("activity_logs").select("activity_type, description, user_display_name, created_at").eq("deal_id", dealId).order("created_at", { ascending: false }).limit(20),
    supabase.from("deal_memos").select("narrative, highlights, hurdles, analyst_notes, lender_notes, other_notes").eq("deal_id", dealId).single(),
    supabase.from("deal_space_documents").select("id, name, content_type, size_bytes, created_at").eq("deal_id", dealId),
    supabase.from("deal_attachments").select("id, name, content_type, category, size_bytes, created_at").eq("deal_id", dealId),
    supabase.from("deal_flag_notes").select("note, created_at").eq("deal_id", dealId).order("created_at", { ascending: false }).limit(10),
  ]);

  const deal = dealResult.data;
  const writeup = writeupResult.data;
  const lenders = lendersResult.data || [];
  const milestones = milestonesResult.data || [];
  const activities = activityResult.data || [];
  const memo = memoResult.data;
  const dealSpaceDocs = dealSpaceDocsResult.data || [];
  const dataRoomDocs = dataRoomDocsResult.data || [];
  const flagNotes = flagNotesResult.data || [];

  const fmt = (val: number | null | undefined) => val != null ? `$${val.toLocaleString()}` : 'N/A';
  const fmtDate = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString() : 'N/A';

  // ── Deal info block ──
  let dealInfo = '';
  if (deal) {
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
    memoInfo = `
**DEAL MEMO:**
${memo.narrative ? `- Narrative: ${memo.narrative}` : ''}
${memo.highlights ? `- Highlights: ${memo.highlights}` : ''}
${memo.hurdles ? `- Hurdles: ${memo.hurdles}` : ''}
${memo.analyst_notes ? `- Analyst Notes: ${memo.analyst_notes}` : ''}
${memo.lender_notes ? `- Lender Notes: ${memo.lender_notes}` : ''}
${memo.other_notes ? `- Other Notes: ${memo.other_notes}` : ''}
`;
  }

  // ── Flag notes block ──
  let flagNotesInfo = '';
  if (flagNotes.length > 0) {
    flagNotesInfo = `
**FLAG NOTES:**
${flagNotes.map((n: any) => `- [${fmtDate(n.created_at)}] ${n.note}`).join('\n')}
`;
  }

  // ── Lenders block (structured for risk extraction) ──
  let lendersInfo = '';
  const activeLenders = lenders.filter((l: any) => l.stage !== 'Passed' && l.tracking_status !== 'passed');
  const passedLenders = lenders.filter((l: any) => l.stage === 'Passed' || l.tracking_status === 'passed');
  if (lenders.length > 0) {
    lendersInfo = `
**LENDERS (${lenders.length} total — ${activeLenders.length} active, ${passedLenders.length} passed):**
${lenders.map((l: any, i: number) => `${i + 1}. ${l.name}
   - Stage: ${l.stage || 'N/A'}${l.substage ? ` / ${l.substage}` : ''}
   - Status: ${l.tracking_status || 'Active'}
   ${l.quote_amount ? `- Quote: ${fmt(l.quote_amount)}${l.quote_rate ? ` @ ${l.quote_rate}%` : ''}${l.quote_term ? ` / ${l.quote_term}` : ''}` : ''}
   ${l.notes ? `- Notes: ${l.notes}` : ''}
   ${l.pass_reason ? `- PASS REASON: ${l.pass_reason}` : ''}`).join('\n')}
`;
  }

  // ── Milestones block ──
  let milestonesInfo = '';
  if (milestones.length > 0) {
    const completed = milestones.filter((m: any) => m.completed).length;
    milestonesInfo = `
**MILESTONES (${completed}/${milestones.length} completed):**
${milestones.map((m: any, i: number) => `${i + 1}. ${m.completed ? '✓' : '○'} ${m.title}${m.due_date ? ` (Due: ${fmtDate(m.due_date)})` : ''}`).join('\n')}
`;
  }

  // ── Activity block ──
  let activityInfo = '';
  if (activities.length > 0) {
    activityInfo = `
**RECENT ACTIVITY (last ${activities.length}):**
${activities.map((a: any) => `- [${fmtDate(a.created_at)}] ${a.activity_type}: ${a.description}${a.user_display_name ? ` (${a.user_display_name})` : ''}`).join('\n')}
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

  const fullContext = [dealInfo, writeupInfo, memoInfo, flagNotesInfo, lendersInfo, milestonesInfo, activityInfo].filter(Boolean).join('\n');

  return {
    fullContext,
    docInventory,
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
  };
}

// ─── Output validation / normalization ──────────────────────────────

function validateAndNormalizeMemo(raw: string): { content: string; sections: Record<string, string> } {
  const sections: Record<string, string> = {};
  let normalized = raw;

  // Normalize heading variations
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

  // Normalize headings in the output
  for (const [alias, canonical] of Object.entries(headingAliases)) {
    const regex = new RegExp(`^##\\s*${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'gmi');
    normalized = normalized.replace(regex, `## ${canonical}`);
  }

  // Extract each section's content
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
    // ── Authentication ──────────────────────────────────────────────
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

    // User-scoped client for RLS-enforced data access
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

    // Service client only for storage file downloads (not for data queries)
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

    const { messages, dealId, action, sectionKey, documentId, scope } = await req.json();

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
    const ctx = await buildDealContext(supabase, dealId);

    // ── Scope-aware document filtering ──────────────────────────────
    const activeScope = scope || 'all';
    let scopedDocInventory = ctx.docInventory;
    let scopeInstruction = '';

    if (activeScope === 'financial') {
      // Only include financial model files from deal_space_financials
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
- You MUST only reference data from these financial model files: ${financialNames.join(', ')}
- Do NOT use data from transcripts, notes, or other non-financial documents.
- If asked about data not in these files, clearly state it is not available in the selected scope.
- For EVERY financial figure you cite, include the source: file name, sheet name, and cell/row reference if available.
`;
    } else if (activeScope === 'transcripts') {
      // Only include transcript-like documents
      const allDocs = [...ctx.dealSpaceDocs, ...ctx.dataRoomDocs];
      const transcriptDocs = allDocs.filter((d: any) => {
        const name = (d.name || '').toLowerCase();
        return name.includes('transcript') || name.includes('call') || name.includes('meeting') ||
               name.includes('interview') || name.endsWith('.txt') || name.endsWith('.md');
      });

      scopedDocInventory = transcriptDocs.length > 0
        ? `**Transcripts Only (${transcriptDocs.length}):**\n` + transcriptDocs.map((d: any) => `- ${d.name}`).join('\n')
        : 'No transcript documents found.';

      scopeInstruction = `
SCOPE RESTRICTION: The user has selected "Transcripts Only" scope.
- You MUST only reference data from transcript/meeting documents.
- Do NOT use data from financial models, spreadsheets, or other non-transcript documents.
- If asked about data not in transcripts, clearly state it is not available in the selected scope.
`;
    }

    const systemPrompt = `You are a senior deal analyst AI assistant with complete knowledge of this deal. Your responses must follow a structured, lender-ready memo format.

${ctx.fullContext}

**DOCUMENT INVENTORY (Scope: ${activeScope === 'all' ? 'All Documents' : activeScope === 'financial' ? 'Financial Models Only' : activeScope === 'transcripts' ? 'Transcripts Only' : 'Custom'}):**
${scopedDocInventory}

${scopeInstruction}

Instructions:
- You have FULL access to all deal information above — not just documents.
- Answer questions using the appropriate data from deal info, write-up, memo, lenders, milestones, and activity.
- When generating overviews, proposals, or memos, ALWAYS use the standardized section framework:
${getMemoSectionHeadings()}

${FORMATTING_RULES}

- CRITICAL: For ANY financial figure, metric, or data point you cite, ALWAYS include a source citation in the format: *(Source: [filename] → [sheet/section] → [row/cell if known])*
- For the "Key Risks & Hurdles" section, ALWAYS break into three sub-headings:
  ### Financial Risks
  ### Lender Sentiment & Market Risks
  ### Operational & Strategic Risks
  Pull from: memo hurdles, analyst notes, lender pass reasons, lender notes, flag notes.

- For "Lender Process & Status", ALWAYS include pipeline stage, flagged status, active vs passed count with names.
- If information isn't available, say so clearly. NEVER hallucinate data.
- When the user asks for a "memo", "overview", "write-up", or "summary", produce the FULL standardized memo using all 7 sections.
- For shorter queries, respond concisely but still use headings and bullets.
`;

    const claudeResult = await callClaude(systemPrompt, messages);
    const rawContent = claudeResult.content || "I couldn't generate a response.";
    
    // Normalize any memo-style output
    const { content } = validateAndNormalizeMemo(rawContent);

    const allDocs = [...ctx.dealSpaceDocs, ...ctx.dataRoomDocs];
    const sources: string[] = [];
    for (const d of allDocs) {
      if (content.toLowerCase().includes(d.name.toLowerCase())) sources.push(d.name);
    }

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

    // Pull from ALL deal-scoped sources in parallel
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

    // Build source chunks with metadata for citation
    const sourceChunks: { source_type: string; source_id: string; source_name: string; location?: string; content: string }[] = [];

    // 1. Extract content from uploaded documents
    for (const doc of allUploadedDocs) {
      try {
        const bucket = documents.find(d => d.id === doc.id) || financials.find(d => d.id === doc.id) ? "deal-space" : "deal-attachments";
        const { data: fileData, error: downloadError } = await supabaseService.storage.from(bucket).download(doc.file_path);
        if (downloadError) continue;
        const extracted = await extractContent(fileData, doc.name);
        if (extracted.text && !extracted.text.startsWith("[Binary file:")) {
          // Split into page/section chunks if available
          if (extracted.pages && extracted.pages.length > 0) {
            for (const page of extracted.pages) {
              sourceChunks.push({
                source_type: "document",
                source_id: doc.id,
                source_name: doc.name,
                location: `Page ${page.pageNumber}`,
                content: page.content.substring(0, 5000),
              });
            }
          } else if (extracted.slides && extracted.slides.length > 0) {
            for (const slide of extracted.slides) {
              sourceChunks.push({
                source_type: "document",
                source_id: doc.id,
                source_name: doc.name,
                location: `Slide ${slide.slideNumber}`,
                content: slide.content.substring(0, 5000),
              });
            }
          } else if (extracted.sheets && extracted.sheets.length > 0) {
            for (const sheet of extracted.sheets) {
              sourceChunks.push({
                source_type: "spreadsheet",
                source_id: doc.id,
                source_name: doc.name,
                location: `Sheet: ${sheet.sheetName}`,
                content: sheet.content.substring(0, 5000),
              });
            }
          } else {
            sourceChunks.push({
              source_type: "document",
              source_id: doc.id,
              source_name: doc.name,
              content: extracted.text.substring(0, 15000),
            });
          }
        }
      } catch (err) { console.error(`Error processing ${doc.name}:`, err); }
    }

    // 2. Include notes as source chunks
    for (const note of notes) {
      if (note.content && note.content.trim().length > 10) {
        sourceChunks.push({
          source_type: "note",
          source_id: note.id,
          source_name: note.title || "Untitled Note",
          content: note.content.substring(0, 5000),
        });
      }
    }

    // 3. Include memo as source chunks
    if (memo) {
      const memoSections = [
        { key: "narrative", label: "Narrative" },
        { key: "highlights", label: "Highlights" },
        { key: "hurdles", label: "Hurdles" },
        { key: "analyst_notes", label: "Analyst Notes" },
        { key: "lender_notes", label: "Lender Notes" },
        { key: "other_notes", label: "Other Notes" },
      ];
      for (const s of memoSections) {
        const val = (memo as any)[s.key];
        if (val && val.trim().length > 5) {
          sourceChunks.push({
            source_type: "memo",
            source_id: dealId,
            source_name: `Deal Memo — ${s.label}`,
            location: s.label,
            content: val.substring(0, 5000),
          });
        }
      }
    }

    // 4. Include structured deal data
    if (deal) {
      sourceChunks.push({
        source_type: "structured_data",
        source_id: dealId,
        source_name: "Deal Record",
        content: `Company: ${deal.company || 'N/A'}, Value: ${deal.value || 'N/A'}, Stage: ${deal.stage || 'N/A'}, Status: ${deal.status || 'N/A'}, Deal Type: ${deal.deal_type || 'N/A'}, Business Model: ${deal.business_model || 'N/A'}, Company URL: ${deal.company_url || 'N/A'}, Contact: ${deal.contact || 'N/A'}, Contact Info: ${deal.contact_info || 'N/A'}, Notes: ${deal.notes || 'None'}`,
      });
    }

    // 5. Include flag notes
    for (const fn of flagNotes) {
      sourceChunks.push({
        source_type: "flag_note",
        source_id: dealId,
        source_name: "Deal Flag Note",
        content: fn.note,
      });
    }

    // 6. Include lender feedback
    for (const l of lenders) {
      const parts = [`Lender: ${l.name}, Stage: ${l.stage || 'N/A'}`];
      if (l.notes) parts.push(`Notes: ${l.notes}`);
      if (l.pass_reason) parts.push(`Pass Reason: ${l.pass_reason}`);
      if (l.quote_amount) parts.push(`Quote: $${l.quote_amount}${l.quote_rate ? ` @ ${l.quote_rate}%` : ''}${l.quote_term ? ` / ${l.quote_term}` : ''}`);
      sourceChunks.push({
        source_type: "lender",
        source_id: l.name,
        source_name: `Lender: ${l.name}`,
        content: parts.join('. '),
      });
    }

    if (sourceChunks.length === 0) {
      return new Response(
        JSON.stringify({ extractedFields: [], documentCount: 0, sourceCount: 0, error: "No content found in deal space" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build combined context with source labels for citation tracing
    const combinedContent = sourceChunks.map((chunk, i) => 
      `[SOURCE_${i}] (${chunk.source_type}: "${chunk.source_name}"${chunk.location ? `, ${chunk.location}` : ''})\n${chunk.content}`
    ).join("\n\n---\n\n");

    // Build source index for the AI to reference
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
- companyName: string
- companyUrl: string
- linkedinUrl: string
- industries: array of strings
- location: string (city, state)
- yearFounded: string
- headcount: string
- dealTypes: array of strings (e.g., "Growth Capital", "Acquisition", "Refinance")
- billingModels: array of strings (e.g., "Subscription", "Transaction")
- profitability: string (e.g., "Profitable", "Pre-profit")
- grossMargins: string (e.g., "75%")
- capitalAsk: string (e.g., "$5M")
- useOfFunds: string
- existingDebtDetails: string
- accountingSystem: string
- description: string — Company overview
- companyHighlights: array of {id: string (use random), title: string, description: string}
- keyItems: array of {id: string (use random), title: string, description: string}

RULES:
- Only extract fields with clear evidence in the sources.
- ALWAYS include at least one source reference per field.
- If multiple sources support a field, include all of them.
- If sources conflict for the same field, set confidence to "medium" and include all conflicting sources.
- Prefer structured_data sources when they match, but still cite the original source (document/note) that originally contained the information.
- NEVER fabricate values not present in the sources.

SOURCE INDEX:
${sourceIndex}

Return ONLY a valid JSON array.`;

    const claudeResult = await callClaude(extractSystemPrompt, [
      { role: "user", content: `Extract deal write-up information from these deal space sources:\n\n${combinedContent.substring(0, 80000)}` },
    ]);

    if (!claudeResult.content) {
      throw new Error("Failed to extract write-up");
    }

    const aiData = await aiResponse.json();
    let extractedContent = aiData.choices?.[0]?.message?.content || "[]";
    extractedContent = extractedContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let extractedFields = [];
    try {
      extractedFields = JSON.parse(extractedContent);
      if (!Array.isArray(extractedFields)) extractedFields = [];
      
      // Enrich source references with full metadata from sourceChunks
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
        // Backwards compatibility: also set source/sourceLocation from first source
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

    // Determine which documents to process
    let docsToProcess: { id: string; name: string; file_path: string; content_type: string; bucket: string }[] = [];

    if (documentId) {
      // Single document extraction
      const { data: dsDoc } = await supabase.from("deal_space_documents").select("id, name, file_path, content_type").eq("id", documentId).single();
      if (dsDoc) {
        docsToProcess.push({ ...dsDoc, bucket: "deal-space" });
      } else {
        const { data: drDoc } = await supabase.from("deal_attachments").select("id, name, file_path, content_type").eq("id", documentId).single();
        if (drDoc) docsToProcess.push({ ...drDoc, bucket: "deal-attachments" });
      }
    } else {
      // All deal documents
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

    // Extract content from all target documents
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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Detect document type heuristically for variant-specific instructions
    const lowerNames = docContents.map(d => d.name.toLowerCase()).join(" ");
    const lowerContent = combinedDocContent.substring(0, 5000).toLowerCase();
    const isAgreement = /agreement|loan|credit|facility|covenant|lender|borrower|collateral|security interest|term sheet/.test(lowerContent) ||
                        /agreement|contract|loan/.test(lowerNames);
    const isFinancial = /revenue|ebitda|income statement|balance sheet|cash flow|p&l|profit|loss|gross margin/.test(lowerContent) ||
                        /financial|income|p&l|balance/.test(lowerNames);

    let variantInstructions = "";
    if (isAgreement) {
      variantInstructions = `This appears to be a loan agreement or customer agreement.
Focus on extracting:
- contracts.loan_agreements: lender name, facility type, commitment amount, maturity, rate, covenants, collateral
- contracts.customer_agreements: customer, value, term, renewal, termination
- risk_flags: tight covenants, unfavorable termination, concentration risk, unusual clauses
Each risk flag must include category, severity, description, and source_reference with page and text_snippet.`;
    } else if (isFinancial) {
      variantInstructions = `This appears to be a financial document.
Focus on extracting:
- financials.periods: revenue, gross_margin_percent, ebitda, ebitda_margin_percent, net_income, opex breakdown
- ARR/MRR only if explicitly labeled
- risk_flags: deteriorating revenue/margins, large OPEX changes, high leverage, weak equity
Search income statements, P&L tables, KPI sections, and management summaries thoroughly before returning null.`;
    } else {
      variantInstructions = `Classify this document and extract all applicable sections of the schema.
Prioritize: company_profile, financials, contracts, cap_table as relevant.
Create risk_flags for any concerns identified.`;
    }

    const systemPrompt = `You are an AI document analyst for a financial services platform focused on growth-stage and lower middle market companies.

Your task: Read the document(s) thoroughly and extract structured data into the JSON schema below.

RULES:
- Be precise, conservative, and grounded in the document text.
- Never invent or fabricate data that is not present.
- When ambiguous or incomplete, return null and explain in meta.uncertainty_notes.
- Numbers: use JSON numbers, not strings. Percentages: numeric without % sign.
- Dates: keep as strings. Currency fields must NOT include symbols.
- ARR/MRR: only populate if clearly labeled (do NOT derive one from the other).
- For revenue, margins, profit, OPEX: search thoroughly before returning null.
- In meta.processing_notes, include page/snippet references for key values.

${variantInstructions}

OUTPUT SCHEMA (return ONLY this JSON object, no other text):
{
  "document_metadata": {
    "document_type": "financial_pdf | pitch_deck | loan_agreement | customer_agreement | cap_table | other",
    "title": "string | null",
    "source_filename": "string | null",
    "page_count": "number | null",
    "company_name": "string | null",
    "company_legal_name": "string | null",
    "reporting_period": "string | null",
    "currency": "string | null"
  },
  "company_profile": {
    "industry": "string | null",
    "business_description": "string | null",
    "hq_location": "string | null",
    "website": "string | null",
    "founded_year": "number | null"
  },
  "financials": {
    "periods": [
      {
        "label": "string | null",
        "period_start_date": "string | null",
        "period_end_date": "string | null",
        "revenue": "number | null",
        "arr": "number | null",
        "mrr": "number | null",
        "gross_margin_percent": "number | null",
        "ebitda": "number | null",
        "ebitda_margin_percent": "number | null",
        "net_income": "number | null",
        "opex": {
          "sales_and_marketing": "number | null",
          "research_and_development": "number | null",
          "general_and_administrative": "number | null",
          "other_opex": "number | null"
        },
        "total_assets": "number | null",
        "total_liabilities": "number | null",
        "total_equity": "number | null"
      }
    ]
  },
  "cap_table": {
    "entries": [
      {
        "holder_name": "string",
        "security_type": "string | null",
        "shares_or_units": "number | null",
        "ownership_percent": "number | null",
        "class_or_series": "string | null"
      }
    ]
  },
  "contracts": {
    "loan_agreements": [
      {
        "lender_name": "string | null",
        "facility_type": "string | null",
        "commitment_amount": "number | null",
        "maturity_date": "string | null",
        "interest_rate": "string | null",
        "financial_covenants": "string | null",
        "security_or_collateral": "string | null"
      }
    ],
    "customer_agreements": [
      {
        "customer_name": "string | null",
        "contract_value": "number | null",
        "contract_term": "string | null",
        "renewal_terms": "string | null",
        "termination_rights": "string | null"
      }
    ]
  },
  "risk_flags": [
    {
      "category": "financial | covenant | concentration | legal | other",
      "severity": "low | medium | high",
      "description": "string",
      "source_reference": {
        "page": "number | null",
        "text_snippet": "string | null"
      }
    }
  ],
  "qa_support": {
    "key_points_summary": "string | null",
    "qa_ready_context": "string | null"
  },
  "meta": {
    "processing_notes": "string | null",
    "uncertainty_notes": "string | null"
  }
}`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Extract structured data from the following document(s):\n\n${combinedDocContent}` },
        ],
        temperature: 0.1,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiResponse.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const errText = await aiResponse.text();
      console.error("AI extraction error:", aiResponse.status, errText);
      throw new Error("AI extraction failed");
    }

    const aiData = await aiResponse.json();
    let rawContent = aiData.choices?.[0]?.message?.content || "{}";
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
