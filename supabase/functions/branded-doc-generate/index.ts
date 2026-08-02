import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { anthropicFetch } from "../_shared/anthropicUsage.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PaletteColor { name: string; hex: string; role: string }
interface StyleSpec {
  palette: PaletteColor[];
  fonts?: { heading?: string; body?: string };
  layout_notes?: string;
}

interface GenerateBody {
  deal_id: string;
  document_type: string;
  document_title?: string;
  sections: string[];
  style: StyleSpec;
  user_prompt?: string;
  current_html?: string; // for revisions
  anonymize?: boolean;
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  deal_summary_memo: "Deal Summary Memo",
  borrower_profile: "Borrower Profile",
  lender_pitch_one_pager: "Lender Pitch One-Pager",
  executive_summary: "Executive Summary",
  deal_teaser: "Deal Teaser (Anonymized)",
  term_sheet_summary: "Term Sheet Summary",
};

const SECTION_LABELS: Record<string, string> = {
  executive_summary: "Executive Summary",
  company_overview: "Company Overview",
  financial_highlights: "Financial Highlights",
  use_of_proceeds: "Use of Proceeds",
  risk_factors: "Risk Factors",
  fifth_line_commentary: "5th Line Commentary",
  next_steps: "Next Steps",
};

function paletteToVars(palette: PaletteColor[]): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const c of palette) {
    vars[`--brand-${c.role}`] = c.hex;
  }
  return vars;
}

function buildStyleBlock(style: StyleSpec): string {
  const vars = paletteToVars(style.palette || []);
  const headingFont = style.fonts?.heading || "Inter";
  const bodyFont = style.fonts?.body || "Inter";
  const cssVars = Object.entries(vars).map(([k, v]) => `${k}: ${v};`).join(" ");
  return `<style>
  .branded-doc {
    ${cssVars}
    --heading-font: '${headingFont}', system-ui, -apple-system, sans-serif;
    --body-font: '${bodyFont}', system-ui, -apple-system, sans-serif;
    font-family: var(--body-font);
    color: var(--brand-foreground, #0F172A);
    background: var(--brand-background, #FFFFFF);
    line-height: 1.55;
    font-size: 14px;
    padding: 32px;
    max-width: 880px;
    margin: 0 auto;
  }
  .branded-doc h1, .branded-doc h2, .branded-doc h3 {
    font-family: var(--heading-font);
    color: var(--brand-primary, #1E2952);
    margin: 0 0 12px 0;
    line-height: 1.2;
  }
  .branded-doc h1 { font-size: 28px; border-bottom: 3px solid var(--brand-accent, #4338CA); padding-bottom: 8px; margin-bottom: 24px; }
  .branded-doc h2 { font-size: 20px; margin-top: 24px; }
  .branded-doc h3 { font-size: 16px; color: var(--brand-accent, #4338CA); margin-top: 16px; }
  .branded-doc p { margin: 0 0 12px 0; }
  .branded-doc .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 16px 0; }
  .branded-doc .kpi { background: var(--brand-surface, #F8FAFC); border-left: 3px solid var(--brand-accent, #4338CA); padding: 12px; border-radius: 4px; }
  .branded-doc .kpi-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--brand-muted, #64748B); }
  .branded-doc .kpi-value { font-size: 18px; font-weight: 700; color: var(--brand-primary, #1E2952); margin-top: 4px; }
  .branded-doc table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  .branded-doc th { background: var(--brand-primary, #1E2952); color: #fff; padding: 8px 10px; text-align: left; font-size: 12px; }
  .branded-doc td { padding: 8px 10px; border-bottom: 1px solid #E2E8F0; font-size: 13px; }
  .branded-doc ul, .branded-doc ol { margin: 0 0 12px 20px; padding: 0; }
  .branded-doc li { margin-bottom: 4px; }
  .branded-doc .doc-header { margin-bottom: 24px; }
  .branded-doc .doc-meta { color: var(--brand-muted, #64748B); font-size: 12px; }
</style>`;
}

async function fetchDealContext(supabase: any, dealId: string) {
  const [{ data: deal }, { data: writeup }, { data: lenders }, { data: company }] = await Promise.all([
    supabase.from("deals").select("*").eq("id", dealId).maybeSingle(),
    supabase.from("deal_write_ups").select("*").eq("deal_id", dealId).maybeSingle(),
    supabase.from("deal_lenders").select("lender_name, stage, last_contact_date, notes").eq("deal_id", dealId).limit(50),
    supabase.from("companies").select("*").eq("id", "00000000-0000-0000-0000-000000000000").maybeSingle().then(() => ({ data: null })).catch(() => ({ data: null })),
  ]);

  return { deal, writeup, lenders: lenders || [], company };
}

function summarizeContext(ctx: any, anonymize: boolean): string {
  const { deal, writeup, lenders } = ctx;
  const companyName = anonymize ? "Project [Anonymized]" : (deal?.company || writeup?.company_name || "Subject Company");
  const parts: string[] = [];
  parts.push(`COMPANY: ${companyName}`);
  if (deal?.value) parts.push(`CAPITAL ASK: $${Number(deal.value).toLocaleString()}`);
  if (deal?.deal_types?.length) parts.push(`DEAL TYPE: ${deal.deal_types.join(", ")}`);
  if (deal?.status) parts.push(`STATUS: ${deal.status}`);
  if (deal?.narrative) parts.push(`NARRATIVE:\n${deal.narrative}`);
  if (writeup) {
    if (!anonymize) {
      if (writeup.company_url) parts.push(`URL: ${writeup.company_url}`);
      if (writeup.location) parts.push(`LOCATION: ${writeup.location}`);
    }
    if (writeup.industries?.length) parts.push(`INDUSTRY: ${writeup.industries.join(", ")}`);
    if (writeup.headcount) parts.push(`HEADCOUNT: ${writeup.headcount}`);
    if (writeup.profitability) parts.push(`PROFITABILITY: ${writeup.profitability}`);
    if (writeup.gross_margins) parts.push(`GROSS MARGINS: ${writeup.gross_margins}`);
    if (writeup.use_of_funds) parts.push(`USE OF FUNDS: ${writeup.use_of_funds}`);
    if (writeup.existing_debt_details) parts.push(`EXISTING DEBT: ${writeup.existing_debt_details}`);
    if (writeup.description) parts.push(`DESCRIPTION:\n${writeup.description}`);
    if (Array.isArray(writeup.company_highlights) && writeup.company_highlights.length) {
      parts.push(`HIGHLIGHTS:\n- ${writeup.company_highlights.map((h: any) => h.title || h).join("\n- ")}`);
    }
    if (Array.isArray(writeup.financial_years) && writeup.financial_years.length) {
      parts.push(`FINANCIALS:\n${JSON.stringify(writeup.financial_years).slice(0, 4000)}`);
    }
  }
  if (lenders.length && !anonymize) {
    parts.push(`ACTIVE LENDERS (${lenders.length}):\n${lenders.slice(0, 15).map((l: any) => `- ${l.lender_name} (${l.stage || "n/a"})`).join("\n")}`);
  }
  return parts.join("\n\n");
}

async function callClaude(systemPrompt: string, userPrompt: string): Promise<string> {
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  // Prefer Claude if available; fallback to Lovable AI Gateway (Gemini)
  if (ANTHROPIC_API_KEY) {
    const res = await anthropicFetch({ feature: "branded-doc-generate" }, {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 8000,
        temperature: 0.5,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (res.ok) {
      const data = await res.json();
      return data?.content?.[0]?.text ?? "";
    }
    console.warn("[branded-doc-generate] Claude failed:", res.status, await res.text());
  }

  if (!LOVABLE_API_KEY) throw new Error("No AI provider configured");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5,
    }),
  });
  if (!res.ok) throw new Error(`AI gateway error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

function extractInnerHtml(raw: string): string {
  // Strip code fences and any <html>/<body> wrappers; keep <style> intact if model added one
  let s = raw.replace(/```html\s*|```\s*$/gm, "").trim();
  // If model returned full HTML doc, extract body
  const bodyMatch = s.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) s = bodyMatch[1].trim();
  // Remove any <html>, <head>, <!DOCTYPE> stragglers
  s = s.replace(/<\/?html[^>]*>/gi, "").replace(/<\/?head[^>]*>[\s\S]*?<\/head>/gi, "").replace(/<!DOCTYPE[^>]*>/gi, "");
  return s.trim();
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
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // 5th Line proprietary action — hard gate by company-account email domain.
    {
      const callerEmail = String(userData.user.email || "").toLowerCase();
      const isFifthLine = callerEmail.endsWith("@5thline.co") || callerEmail.endsWith("@naitive.co");
      if (!isFifthLine) {
        return new Response(JSON.stringify({ error: "Forbidden: 5th Line proprietary action" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = (await req.json()) as GenerateBody;
    if (!body?.deal_id || !body?.document_type || !Array.isArray(body?.sections) || !body?.style?.palette?.length) {
      return new Response(JSON.stringify({ error: "deal_id, document_type, sections, style.palette are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const docTypeLabel = DOCUMENT_TYPE_LABELS[body.document_type] || body.document_type;
    const anonymize = !!body.anonymize || body.document_type === "deal_teaser";

    const ctx = await fetchDealContext(supabase, body.deal_id);
    if (!ctx.deal) {
      return new Response(JSON.stringify({ error: "Deal not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dealContextText = summarizeContext(ctx, anonymize);
    const sectionList = body.sections.map((s) => `- ${SECTION_LABELS[s] || s}`).join("\n");
    const paletteHint = body.style.palette.map((c) => `${c.role}=${c.hex}`).join(", ");
    const layoutNotes = body.style.layout_notes || "Modern, professional layout.";

    const systemPrompt = `You are an expert credit/finance document writer at a debt advisory firm.
You generate polished, lender-grade documents as INNER HTML using a fixed set of CSS classes.

Allowed top-level wrapper: <div class="branded-doc">...</div>
Use these classes when appropriate:
- .doc-header, .doc-meta
- .kpi-grid, .kpi, .kpi-label, .kpi-value (for headline metrics)
- standard <h1>, <h2>, <h3>, <p>, <ul>, <ol>, <li>, <table>, <thead>, <tbody>, <tr>, <th>, <td>, <strong>, <em>

RULES:
- Output ONLY the inner HTML (the <div class="branded-doc">...</div> block). No <!DOCTYPE>, no <html>, no <body>, no <style>, no markdown fences.
- Be concise, factual, lender-grade. Do not invent numbers; use ONLY the provided deal context.
- For missing data, omit the line rather than fabricating.
- ${anonymize ? "ANONYMIZE: do not name the company or specific identifying details. Use 'the Company' or 'Project [Codename]'." : "Use the actual company name."}
- Tailor tone for: ${docTypeLabel}.
- Include exactly these sections in order: ${sectionList || "(use your best judgment based on the document type)"}
- Layout intent: ${layoutNotes}
- Brand palette roles: ${paletteHint}. The viewer will inject CSS variables for these — do not hardcode colors.`;

    const userPrompt = `DOCUMENT TYPE: ${docTypeLabel}
TITLE: ${body.document_title || `${docTypeLabel} — ${anonymize ? "Project [Codename]" : (ctx.deal.company || "")}`}

DEAL CONTEXT:
${dealContextText}

${body.user_prompt ? `ADDITIONAL INSTRUCTIONS FROM USER:\n${body.user_prompt}\n` : ""}
${body.current_html ? `EXISTING DRAFT (REVISE based on user instructions above; preserve overall structure unless asked otherwise):\n${body.current_html.slice(0, 12000)}\n` : ""}

Generate the document now.`;

    const raw = await callClaude(systemPrompt, userPrompt);
    const innerHtml = extractInnerHtml(raw);
    const styleBlock = buildStyleBlock(body.style);
    const fullHtml = `${styleBlock}\n${innerHtml}`;

    return new Response(JSON.stringify({ html: fullHtml, inner_html: innerHtml }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[branded-doc-generate] error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
