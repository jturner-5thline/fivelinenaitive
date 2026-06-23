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

    const { deal_id, irl_request_id } = await req.json();
    if (!deal_id) {
      return new Response(JSON.stringify({ error: "deal_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch IRL requests to match
    let requestsQuery = supabase
      .from("vdr_irl_requests")
      .select("*")
      .eq("deal_id", deal_id);

    if (irl_request_id) {
      requestsQuery = requestsQuery.eq("id", irl_request_id);
    }

    const { data: requests, error: reqError } = await requestsQuery;
    if (reqError || !requests?.length) {
      return new Response(JSON.stringify({ error: "No IRL requests found", details: reqError }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if we have any ingested chunks for this deal
    const { count: chunkCount } = await supabase
      .from("vdr_document_chunks")
      .select("id", { count: "exact", head: true })
      .eq("deal_id", deal_id);

    if (!chunkCount || chunkCount === 0) {
      return new Response(JSON.stringify({ 
        error: "No indexed documents found. Please upload and index documents first.",
        matched: 0 
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all documents for this deal (for filename matching)
    const { data: allDocs } = await supabase
      .from("vdr_documents")
      .select("id, filename, folder_path, is_folder")
      .eq("deal_id", deal_id)
      .eq("is_folder", false);

    const results: Array<{
      request_id: string;
      request_name: string;
      matches: Array<{
        document_id: string;
        filename: string;
        match_type: string;
        confidence: number;
        explanation: string;
        mislabeled: boolean;
      }>;
    }> = [];

    // Process each request
    for (const request of requests) {
      const searchQuery = [
        request.request_number,
        request.request_name,
        request.description,
      ].filter(Boolean).join(" ");

      // Get embedding for the search query
      let relevantChunks: Array<{ chunk_text: string; metadata: any; similarity: number }> = [];

      try {
        // Disabled by Lovable - model fixed; uncomment to re-enable
        // const embResponse = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
        //   method: "POST",
        //   headers: {
        //     Authorization: `Bearer ${lovableApiKey}`,
        //     "Content-Type": "application/json",
        //   },
        //   body: JSON.stringify({
        //     model: "openai/text-embedding-3-small",
        //     input: searchQuery.substring(0, 8000),
        //   }),
        // });
        //
        // if (embResponse.ok) {
        //   const embData = await embResponse.json();
        //   const queryEmbedding = embData.data?.[0]?.embedding;
        //
        //   if (queryEmbedding) {
        //     const { data: vectorResults } = await supabase.rpc("vdr_search_chunks", {
        //       _deal_id: deal_id,
        //       _query_embedding: JSON.stringify(queryEmbedding),
        //       _match_count: 15,
        //     });
        //
        //     if (vectorResults) {
        //       relevantChunks = vectorResults.map((r: any) => ({
        //         chunk_text: r.chunk_text,
        //         metadata: r.metadata,
        //         similarity: r.similarity,
        //       }));
        //     }
        //   }
        // }
      } catch (e) {
        console.error("Embedding error for request:", request.id, e);
      }

      // Fallback: keyword search
      if (relevantChunks.length === 0) {
        const keywords = searchQuery.split(/\s+/).filter((w: string) => w.length > 3).slice(0, 5);
        if (keywords.length > 0) {
          const { data: kwResults } = await supabase
            .from("vdr_document_chunks")
            .select("chunk_text, metadata")
            .eq("deal_id", deal_id)
            .or(keywords.map((k: string) => `chunk_text.ilike.%${k}%`).join(","))
            .limit(15);

          if (kwResults) {
            relevantChunks = kwResults.map((r: any) => ({
              chunk_text: r.chunk_text,
              metadata: r.metadata,
              similarity: 0.5,
            }));
          }
        }
      }

      if (relevantChunks.length === 0) {
        results.push({ request_id: request.id, request_name: request.request_name, matches: [] });
        continue;
      }

      // Group chunks by document
      const docChunks = new Map<string, { chunks: string[]; metadata: any; maxSimilarity: number }>();
      for (const chunk of relevantChunks) {
        const docId = chunk.metadata?.document_id;
        if (!docId) continue;
        const existing = docChunks.get(docId) || { chunks: [], metadata: chunk.metadata, maxSimilarity: 0 };
        existing.chunks.push(chunk.chunk_text.substring(0, 300));
        existing.maxSimilarity = Math.max(existing.maxSimilarity, chunk.similarity);
        docChunks.set(docId, existing);
      }

      // Use LLM to evaluate top document matches
      const topDocs = Array.from(docChunks.entries())
        .sort((a, b) => b[1].maxSimilarity - a[1].maxSimilarity)
        .slice(0, 5);

      const evalPrompt = `You are evaluating whether documents satisfy an Information Request List (IRL) item for a private credit due diligence process.

IRL Request:
- Number: ${request.request_number || "N/A"}
- Name: ${request.request_name}
- Description: ${request.description || "N/A"}
- Category: ${request.category || "N/A"}

For each document below, evaluate:
1. Does this document satisfy the IRL request? (full, partial, or no)
2. Confidence score (0-100)
3. Brief explanation (1 sentence)
4. Is the filename misleading relative to its content? (true/false)

Documents:
${topDocs.map(([docId, info], i) => `
Document ${i + 1} (ID: ${docId}):
Filename: ${info.metadata?.filename || "Unknown"}
Folder: ${info.metadata?.folder || "/"}
Content excerpts:
${info.chunks.join("\n---\n")}
`).join("\n")}

Respond as JSON array. Each element: {"doc_index": number, "match_type": "full"|"partial"|"none", "confidence": number, "explanation": string, "mislabeled": boolean}`;

      try {
        const evalResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: "You are a due diligence document analyst. Return only valid JSON." },
              { role: "user", content: evalPrompt },
            ],
            temperature: 0.1,
          }),
        });

        if (!evalResponse.ok) {
          console.error("LLM eval error:", evalResponse.status);
          results.push({ request_id: request.id, request_name: request.request_name, matches: [] });
          continue;
        }

        const evalData = await evalResponse.json();
        const rawContent = evalData.choices?.[0]?.message?.content || "[]";
        
        // Extract JSON from response (may be wrapped in ```json blocks)
        const jsonMatch = rawContent.match(/\[[\s\S]*\]/);
        const evaluations = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

        const requestMatches: typeof results[0]["matches"] = [];

        for (const evaluation of evaluations) {
          if (evaluation.match_type === "none") continue;

          const [docId, docInfo] = topDocs[evaluation.doc_index] || [];
          if (!docId) continue;

          requestMatches.push({
            document_id: docId,
            filename: docInfo.metadata?.filename || "Unknown",
            match_type: evaluation.mislabeled ? "mislabeled" : evaluation.match_type,
            confidence: Math.min(100, Math.max(0, evaluation.confidence)),
            explanation: evaluation.explanation || "",
            mislabeled: evaluation.mislabeled || false,
          });
        }

        results.push({
          request_id: request.id,
          request_name: request.request_name,
          matches: requestMatches,
        });
      } catch (e) {
        console.error("LLM evaluation error:", e);
        results.push({ request_id: request.id, request_name: request.request_name, matches: [] });
      }
    }

    // Store matches in DB
    for (const result of results) {
      // Delete existing matches for this request (re-run)
      await supabase
        .from("vdr_irl_document_matches")
        .delete()
        .eq("irl_request_id", result.request_id);

      if (result.matches.length > 0) {
        const inserts = result.matches.map((m) => ({
          irl_request_id: result.request_id,
          document_id: m.document_id,
          deal_id,
          match_type: m.match_type,
          confidence_score: m.confidence,
          explanation: m.explanation,
          flagged_mislabel: m.mislabeled,
          status: "pending",
        }));

        await supabase.from("vdr_irl_document_matches").insert(inserts);
      }
    }

    const totalMatches = results.reduce((sum, r) => sum + r.matches.length, 0);

    return new Response(
      JSON.stringify({
        processed: results.length,
        total_matches: totalMatches,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("IRL match error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
