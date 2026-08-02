import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { compactHistory } from "../_shared/contextBudget.ts";

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

    const { deal_id, message, conversation_history = [] } = await req.json();
    if (!deal_id || !message) {
      return new Response(JSON.stringify({ error: "deal_id and message required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Step 1: Try to get embedding for the user query
    let queryEmbedding: number[] | null = null;
    try {
      const embResponse = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/text-embedding-3-small",
          input: message.substring(0, 8000),
        }),
      });
      if (embResponse.ok) {
        const embData = await embResponse.json();
        queryEmbedding = embData.data?.[0]?.embedding || null;
      } else {
        console.error("Embedding non-200:", embResponse.status, await embResponse.text());
      }
    } catch (e) {
      console.error("Embedding error:", e);
    }

    // Step 2: Retrieve relevant chunks
    let contextChunks: Array<{ chunk_text: string; metadata: any; similarity: number }> = [];

    if (queryEmbedding) {
      // Vector search
      const { data: vectorResults } = await supabase.rpc("vdr_search_chunks", {
        _deal_id: deal_id,
        _query_embedding: JSON.stringify(queryEmbedding),
        _match_count: 10,
      });
      if (vectorResults) {
        contextChunks = vectorResults.map((r: any) => ({
          chunk_text: r.chunk_text,
          metadata: r.metadata,
          similarity: r.similarity,
        }));
      }
    }

    // Fallback: keyword search if no vector results
    if (contextChunks.length === 0) {
      const keywords = message.split(/\s+/).filter((w: string) => w.length > 3).slice(0, 5);
      if (keywords.length > 0) {
        const { data: kwResults } = await supabase
          .from("vdr_document_chunks")
          .select("chunk_text, metadata")
          .eq("deal_id", deal_id)
          .or(keywords.map((k: string) => `chunk_text.ilike.%${k}%`).join(","))
          .limit(10);
        if (kwResults) {
          contextChunks = kwResults.map((r: any) => ({
            chunk_text: r.chunk_text,
            metadata: r.metadata,
            similarity: 0.5,
          }));
        }
      }
    }

    // Step 3: Build context
    const contextText = contextChunks.length > 0
      ? contextChunks
          .map((c, i) => `[Source: ${c.metadata?.filename || "Unknown"}, chunk ${i + 1}]\n${c.chunk_text}`)
          .join("\n\n---\n\n")
      : "No indexed documents found for this deal. The dataroom may not have been ingested yet.";

    // Step 4: Stream response from AI
    const systemPrompt = `You are naitive, an AI analyst assistant for private credit deal teams. Answer the user's question using ONLY the provided document chunks as context. 

RULES:
- Always cite your sources using [Source: filename] format
- If you present data in a table, format it in markdown
- If you cannot answer from the provided context, say so clearly
- Be concise but thorough
- Use professional financial terminology

DOCUMENT CONTEXT:
${contextText}`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...compactHistory(conversation_history, { maxTurns: 10 }),
      { role: "user", content: message },
    ];

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages,
        stream: true,
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResponse.text();
      console.error("AI error:", status, errText);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Return the SSE stream with citation metadata prepended
    const citations = contextChunks.map(c => ({
      filename: c.metadata?.filename || "Unknown",
      folder: c.metadata?.folder || "/",
      similarity: Math.round(c.similarity * 100),
    }));

    // Create a transform stream that prepends citation data
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Send citations as first SSE event
    writer.write(encoder.encode(`data: ${JSON.stringify({ type: "citations", citations })}\n\n`));

    // Pipe the AI response through
    const reader = aiResponse.body!.getReader();
    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await writer.write(value);
        }
      } finally {
        writer.close();
      }
    })();

    return new Response(readable, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("Chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
