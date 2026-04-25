import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Default thresholds per field
const DEFAULT_THRESHOLDS: Record<string, number> = {
  job_title: 0.70,
  email: 0.85,
  phone_work: 0.80,
  phone_mobile: 0.80,
  company_name: 0.75,
  department: 0.70,
  seniority: 0.70,
  linkedin_url: 0.85,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { contact_id, source_type, source_id, email_data, company_id } = await req.json();

    if (!contact_id || !source_type) {
      return new Response(
        JSON.stringify({ error: "contact_id and source_type are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // 1. Fetch contact record
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("*")
      .eq("id", contact_id)
      .single();

    if (contactError || !contact) {
      return new Response(
        JSON.stringify({ error: "Contact not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resolvedCompanyId = company_id || contact.org_company_id;
    if (!resolvedCompanyId) {
      return new Response(
        JSON.stringify({ error: "Could not determine company_id for contact" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Fetch org thresholds
    const { data: thresholds } = await supabase
      .from("field_suggestion_thresholds")
      .select("field_name, min_confidence, is_enabled")
      .eq("company_id", resolvedCompanyId);

    const thresholdMap: Record<string, { min: number; enabled: boolean }> = {};
    for (const t of thresholds || []) {
      thresholdMap[t.field_name] = { min: Number(t.min_confidence), enabled: t.is_enabled };
    }

    // 3. Call AI to extract field suggestions
    const currentFields = {
      job_title: contact.job_title,
      email: contact.email,
      phone_work: contact.phone_work,
      phone_mobile: contact.phone_mobile,
      company_name: contact.full_name, // We'll use the CRM company name if available
      department: contact.department,
      seniority: contact.seniority,
      linkedin_url: contact.linkedin_url,
    };

    const systemPrompt = `You are a CRM data extraction agent. Given an email or activity data and the current contact record, identify any field changes (job_title, email, phone_work, phone_mobile, department, seniority, linkedin_url).

Return suggestions ONLY when you detect a clear change from the current value. Do not suggest values that match the current record.

For each suggestion, provide:
- field_name: one of job_title, email, phone_work, phone_mobile, department, seniority, linkedin_url
- suggested_value: the new value detected
- confidence: 0.0-1.0 score
- source_snippet: the exact text excerpt that supports this suggestion

Be conservative. Only suggest changes with real evidence.`;

    const userPrompt = `Current contact record:
${JSON.stringify(currentFields, null, 2)}

Source type: ${source_type}
${email_data ? `Email data:
From: ${email_data.from || ""}
Subject: ${email_data.subject || ""}
Body: ${(email_data.body_text || "").substring(0, 2000)}
Signature block: ${email_data.signature_block || ""}` : ""}

Extract any field change suggestions.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "submit_field_suggestions",
              description: "Submit detected CRM field change suggestions",
              parameters: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        field_name: {
                          type: "string",
                          enum: ["job_title", "email", "phone_work", "phone_mobile", "department", "seniority", "linkedin_url"],
                        },
                        suggested_value: { type: "string" },
                        confidence: { type: "number" },
                        source_snippet: { type: "string" },
                      },
                      required: ["field_name", "suggested_value", "confidence", "source_snippet"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["suggestions"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "submit_field_suggestions" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded, please try again later" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "AI extraction failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    
    let suggestions: Array<{
      field_name: string;
      suggested_value: string;
      confidence: number;
      source_snippet: string;
    }> = [];

    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        suggestions = parsed.suggestions || [];
      } catch {
        console.error("Failed to parse AI tool call arguments");
      }
    }

    // 4. Process suggestions
    const created: any[] = [];
    let supersededCount = 0;

    for (const s of suggestions.slice(0, 10)) {
      // Check threshold
      const th = thresholdMap[s.field_name];
      const minConf = th?.min ?? DEFAULT_THRESHOLDS[s.field_name] ?? 0.70;
      const isEnabled = th?.enabled ?? true;

      if (!isEnabled || s.confidence < minConf) continue;

      // Check if current value already matches
      const currentVal = (currentFields as any)[s.field_name];
      if (currentVal && currentVal.toLowerCase().trim() === s.suggested_value.toLowerCase().trim()) {
        supersededCount++;
        continue;
      }

      // Compute dedupe key
      const encoder = new TextEncoder();
      const data = encoder.encode(`${contact_id}:${s.field_name}:${s.suggested_value.toLowerCase().trim()}`);
      const hashBuffer = await crypto.subtle.digest("MD5", data).catch(() => null);
      let dedupeKey: string;
      if (hashBuffer) {
        dedupeKey = Array.from(new Uint8Array(hashBuffer))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      } else {
        // Fallback: simple string key
        dedupeKey = `${contact_id}:${s.field_name}:${s.suggested_value.toLowerCase().trim()}`;
      }

      // Upsert suggestion
      const { data: upserted, error: upsertError } = await supabase
        .from("contact_field_suggestions")
        .upsert(
          {
            contact_id,
            company_id: resolvedCompanyId,
            field_name: s.field_name,
            current_value: currentVal || null,
            suggested_value: s.suggested_value,
            confidence: s.confidence,
            source_type,
            source_id: source_id || null,
            source_snippet: s.source_snippet,
            status: "pending",
            dedupe_key: dedupeKey,
          },
          { onConflict: "dedupe_key" }
        )
        .select()
        .single();

      if (upsertError) {
        console.error("Upsert error:", upsertError);
        continue;
      }

      created.push({
        id: upserted?.id,
        field_name: s.field_name,
        current_value: currentVal,
        suggested_value: s.suggested_value,
        confidence: s.confidence,
        source_snippet: s.source_snippet,
      });
    }

    return new Response(
      JSON.stringify({
        suggestions_created: created.length,
        suggestions_superseded: supersededCount,
        suggestions: created,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("field-suggestion-engine error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
