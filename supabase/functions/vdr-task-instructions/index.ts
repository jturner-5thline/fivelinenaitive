import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { deal_id, task_type, task_name, task_description, linked_request_ids = [], linked_document_ids = [] } = await req.json();

    if (!deal_id || !task_type) {
      return new Response(JSON.stringify({ error: "deal_id and task_type required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Gather context from linked IRL requests
    let irlContext = "";
    if (linked_request_ids.length > 0) {
      const { data: irlRequests } = await supabase
        .from("vdr_irl_requests")
        .select("request_number, request_name, description, category")
        .in("id", linked_request_ids);

      if (irlRequests?.length) {
        irlContext = "\n\nLINKED IRL REQUESTS:\n" + irlRequests.map((r: any) =>
          `- ${r.request_number || "N/A"}: ${r.request_name}${r.description ? ` — ${r.description}` : ""}${r.category ? ` [${r.category}]` : ""}`
        ).join("\n");
      }
    }

    // Gather context from linked documents (via chunks)
    let docContext = "";
    if (linked_document_ids.length > 0) {
      const { data: docs } = await supabase
        .from("vdr_documents")
        .select("id, filename, folder_path, file_type")
        .in("id", linked_document_ids);

      if (docs?.length) {
        // Get chunks for these documents
        const { data: chunks } = await supabase
          .from("vdr_document_chunks")
          .select("chunk_text, metadata")
          .in("document_id", linked_document_ids)
          .order("chunk_index", { ascending: true })
          .limit(30);

        docContext = "\n\nLINKED DOCUMENTS:\n" + docs.map((d: any) =>
          `- ${d.filename} (${d.folder_path})`
        ).join("\n");

        if (chunks?.length) {
          docContext += "\n\nDOCUMENT EXCERPTS:\n" + chunks.map((c: any) =>
            `[${c.metadata?.filename || "Unknown"}]\n${c.chunk_text.substring(0, 500)}`
          ).join("\n---\n");
        }
      }
    }

    // If no linked docs provided, sample some chunks from the deal
    if (!docContext) {
      const { data: sampleChunks } = await supabase
        .from("vdr_document_chunks")
        .select("chunk_text, metadata")
        .eq("deal_id", deal_id)
        .limit(15);

      if (sampleChunks?.length) {
        docContext = "\n\nAVAILABLE DOCUMENT EXCERPTS (sampled from dataroom):\n" +
          sampleChunks.map((c: any) =>
            `[${c.metadata?.filename || "Unknown"}]\n${c.chunk_text.substring(0, 400)}`
          ).join("\n---\n");
      }
    }

    const taskTypeLabels: Record<string, string> = {
      tie_out: "Tie-out",
      compliance_review: "Compliance Review",
      financial_analysis: "Financial Analysis",
      legal_review: "Legal Review",
      tax_analysis: "Tax Analysis",
      custom: "Custom Analysis",
    };

    const prompt = `Generate detailed, step-by-step analyst instructions for a **${taskTypeLabels[task_type] || task_type}** task on this private credit deal.

TASK DETAILS:
- Task Name: ${task_name || "Not specified"}
- Task Type: ${taskTypeLabels[task_type] || task_type}
- Description: ${task_description || "Not provided"}
${irlContext}
${docContext}

INSTRUCTIONS FORMAT:
Generate comprehensive, actionable instructions that any team member could follow independently. Include:

1. **Objective** — What this task aims to accomplish and why it matters for the deal
2. **Prerequisites** — What documents, access, or information is needed before starting
3. **Step-by-Step Procedure** — Numbered steps with specific actions. Reference specific documents, data points, periods, and amounts where available from the context
4. **Key Items to Review** — Specific items, accounts, or areas to focus on
5. **Red Flags to Watch For** — Common issues or anomalies to look out for in this type of analysis
6. **Deliverables** — What the final output should include (memo, workpaper, checklist, etc.)
7. **Quality Checks** — How to verify the work is complete and accurate

Be specific and reference actual document names, financial figures, and time periods from the provided context wherever possible. Use markdown formatting.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: "You are a senior private credit analyst creating detailed task instructions for junior team members. Your instructions should be thorough, specific, and reference actual deal documents and data whenever available. Format in clean markdown.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI error:", status, errText);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const instructions = data.choices?.[0]?.message?.content || "";

    return new Response(
      JSON.stringify({ instructions }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Task instructions error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
