import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader || "" } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, dealId, emailData, threadData } = await req.json();

    // Fetch deal context
    let dealContext = "";
    if (dealId) {
      const [dealRes, writeupRes, lendersRes, milestonesRes] = await Promise.all([
        supabase.from("deals").select("*").eq("id", dealId).single(),
        supabase.from("deal_writeups").select("*").eq("deal_id", dealId).single(),
        supabase.from("deal_lenders").select("*").eq("deal_id", dealId),
        supabase.from("deal_milestones").select("*").eq("deal_id", dealId).order("position"),
      ]);

      const deal = dealRes.data;
      const writeup = writeupRes.data;
      const lenders = lendersRes.data || [];
      const milestones = milestonesRes.data || [];

      dealContext = `
DEAL CONTEXT:
- Company: ${deal?.company || "N/A"}
- Stage: ${deal?.stage || "N/A"}
- Value: $${deal?.value ? (deal.value / 1000000).toFixed(1) + "M" : "N/A"}
- Deal Type: ${deal?.deal_type || "N/A"}
- Status: ${deal?.status || "N/A"}
- Contact: ${deal?.contact || "N/A"}
${writeup ? `
WRITEUP:
- Industry: ${writeup.industry || "N/A"}
- Capital Ask: ${writeup.capital_ask || "N/A"}
- Revenue (This Year): ${writeup.this_year_revenue || "N/A"}
- Revenue (Last Year): ${writeup.last_year_revenue || "N/A"}
- Use of Funds: ${writeup.use_of_funds || "N/A"}
- Description: ${writeup.description || "N/A"}
` : ""}
LENDERS (${lenders.length}):
${lenders.map((l: any) => `- ${l.name}: stage=${l.stage}, substage=${l.substage || "none"}${l.quote_amount ? ", quote=$" + (l.quote_amount / 1000000).toFixed(1) + "M" : ""}${l.quote_rate ? ", rate=" + l.quote_rate + "%" : ""}`).join("\n")}

MILESTONES:
${milestones.map((m: any) => `- ${m.title}: ${m.completed ? "✅ Done" : "⬜ Pending"}${m.due_date ? " (due: " + m.due_date + ")" : ""}`).join("\n")}
`;
    }

    let systemPrompt = "";
    let userPrompt = "";

    switch (action) {
      case "draft_reply": {
        systemPrompt = `You are an expert debt advisory professional at a capital advisory firm. Draft a professional reply email based on the deal context and conversation. Be concise, professional, and action-oriented. Output ONLY the email body text (no subject, no "From:", etc.).`;
        userPrompt = `${dealContext}

EMAIL THREAD:
${threadData?.emails?.map((e: any) => `From: ${e.from_name} <${e.from_email}>
To: ${e.to_name} <${e.to_email}>
Date: ${e.received_at}
---
${e.body_preview}
---`).join("\n\n")}

Draft a professional reply to the most recent email in this thread. Consider the deal context when relevant.`;
        break;
      }

      case "summarize_thread": {
        systemPrompt = `You are a deal analyst. Summarize email threads concisely focusing on: key decisions, action items, next steps, and deal-relevant information. Return a JSON object with: { "summary": "...", "action_items": ["..."], "key_decisions": ["..."], "next_steps": ["..."] }`;
        userPrompt = `${dealContext}

EMAIL THREAD: "${threadData?.subject}"
${threadData?.emails?.map((e: any) => `[${e.from_name}] ${e.body_preview}`).join("\n\n")}

Provide a structured summary.`;
        break;
      }

      case "extract_data": {
        systemPrompt = `You are a financial data extraction specialist. Extract structured deal terms and key data points from emails. Return a JSON object with: { "terms": [{ "label": "...", "value": "...", "confidence": "high|medium|low" }], "dates": [{ "description": "...", "date": "..." }], "amounts": [{ "description": "...", "amount": "..." }] }`;
        userPrompt = `${dealContext}

EMAIL CONTENT:
From: ${emailData?.from_name}
Subject: ${emailData?.subject || threadData?.subject}
Body: ${emailData?.body_preview}

Extract any financial terms, amounts, rates, dates, and other structured data.`;
        break;
      }

      case "detect_signals": {
        systemPrompt = `You are a deal intelligence analyst. Analyze emails for signals that indicate lender stage changes or deal status changes. Return a JSON object with: { "signals": [{ "type": "stage_change|follow_up_needed|risk_flag|positive_signal", "description": "...", "suggested_action": "...", "urgency": "high|medium|low", "lender_name": "..." }] }`;
        userPrompt = `${dealContext}

EMAIL:
From: ${emailData?.from_name} <${emailData?.from_email}>
Subject: ${emailData?.subject || threadData?.subject}
Body: ${emailData?.body_preview}

Identify any signals that suggest:
1. A lender stage should be updated
2. Follow-up is needed
3. There's a risk or concern
4. There's positive momentum`;
        break;
      }

      case "suggest_link": {
        systemPrompt = `You are a deal matching assistant. Given an email and available deal context, determine if this email should be linked to the current deal. Return a JSON object: { "should_link": true/false, "confidence": "high|medium|low", "reason": "..." }`;
        userPrompt = `${dealContext}

EMAIL:
From: ${emailData?.from_name} <${emailData?.from_email}>
Subject: ${emailData?.subject}
Body: ${emailData?.body_preview}

Should this email be linked to this deal? Consider sender, subject, and content relevance.`;
        break;
      }

      case "follow_up_check": {
        systemPrompt = `You are a deal operations assistant. Analyze email threads to identify ones that need follow-up. Return a JSON object: { "needs_follow_up": true/false, "days_since_last_reply": number, "urgency": "high|medium|low", "suggested_follow_up": "..." }`;
        userPrompt = `${dealContext}

EMAIL THREAD: "${threadData?.subject}"
Latest message from: ${threadData?.latestEmail?.from_name}
Latest message date: ${threadData?.latestEmail?.received_at}
Thread messages:
${threadData?.emails?.map((e: any) => `[${e.from_name} - ${e.received_at}] ${e.snippet}`).join("\n")}

Does this thread need a follow-up? If so, suggest what to say.`;
        break;
      }

      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: action === "draft_reply" ? 0.7 : 0.3,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      throw new Error("AI gateway error");
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content || "";

    // Try to parse as JSON for structured responses
    let parsed: any = content;
    if (action !== "draft_reply") {
      try {
        // Strip markdown code fences if present
        const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        parsed = { raw: content };
      }
    }

    return new Response(JSON.stringify({ result: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("smart-email-ai error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
