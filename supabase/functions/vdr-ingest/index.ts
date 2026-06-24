import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Simple text chunker that respects paragraph boundaries
function chunkText(text: string, targetSize = 600, overlap = 100): string[] {
  if (!text || text.trim().length === 0) return [];
  
  const paragraphs = text.split(/\n\s*\n/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if (current.length + trimmed.length > targetSize && current.length > 0) {
      chunks.push(current.trim());
      // Overlap: keep tail of current chunk
      const words = current.split(/\s+/);
      const overlapWords = words.slice(-Math.floor(overlap / 5));
      current = overlapWords.join(" ") + "\n\n" + trimmed;
    } else {
      current += (current ? "\n\n" : "") + trimmed;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  // If we only got one chunk but it's very long, split by sentences
  if (chunks.length === 1 && chunks[0].length > targetSize * 2) {
    const sentences = chunks[0].split(/(?<=[.!?])\s+/);
    const refined: string[] = [];
    let buf = "";
    for (const s of sentences) {
      if (buf.length + s.length > targetSize && buf) {
        refined.push(buf.trim());
        buf = s;
      } else {
        buf += (buf ? " " : "") + s;
      }
    }
    if (buf.trim()) refined.push(buf.trim());
    return refined;
  }

  return chunks;
}

// Extract text from file using basic approaches
async function extractText(fileBytes: Uint8Array, filename: string, contentType: string): Promise<string> {
  const ext = filename.split(".").pop()?.toLowerCase();

  // Plain text files
  if (["txt", "md", "csv", "json", "xml", "html", "log"].includes(ext || "") ||
      contentType.startsWith("text/")) {
    return new TextDecoder().decode(fileBytes);
  }

  // For PDF: extract text using a basic approach
  // We'll use the AI model to extract text from the raw content
  if (ext === "pdf" || contentType === "application/pdf") {
    // Try to extract readable text from PDF bytes
    const rawText = new TextDecoder("utf-8", { fatal: false }).decode(fileBytes);
    // Extract text between stream markers (basic PDF text extraction)
    const textParts: string[] = [];
    const streamRegex = /stream\s*\n([\s\S]*?)\nendstream/g;
    let match;
    while ((match = streamRegex.exec(rawText)) !== null) {
      // Try to find readable text in the stream
      const readable = match[1].replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s+/g, " ").trim();
      if (readable.length > 20) textParts.push(readable);
    }
    
    // Also try BT...ET text blocks
    const btRegex = /BT\s*([\s\S]*?)\s*ET/g;
    while ((match = btRegex.exec(rawText)) !== null) {
      const tjRegex = /\((.*?)\)\s*Tj/g;
      let tjMatch;
      while ((tjMatch = tjRegex.exec(match[1])) !== null) {
        if (tjMatch[1].trim()) textParts.push(tjMatch[1].trim());
      }
    }
    
    const extracted = textParts.join("\n").trim();
    if (extracted.length > 50) return extracted;
    
    // Fallback: return what we can
    return `[PDF document: ${filename} - ${(fileBytes.length / 1024).toFixed(0)}KB. Basic text extraction yielded limited content. Full parsing would require OCR.]`;
  }

  // For other formats, return a placeholder
  return `[Document: ${filename} (${ext}) - ${(fileBytes.length / 1024).toFixed(0)}KB. Content extraction for this format requires specialized parsing.]`;
}

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

    const { document_ids, deal_id } = await req.json();
    if (!document_ids?.length || !deal_id) {
      return new Response(JSON.stringify({ error: "document_ids and deal_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let totalChunks = 0;
    const results: Array<{ document_id: string; status: string; chunks: number }> = [];

    for (const docId of document_ids) {
      try {
        // Mark as processing
        await supabase.from("vdr_documents").update({ ingestion_status: "processing" }).eq("id", docId);

        // Get document record
        const { data: doc } = await supabase.from("vdr_documents").select("*").eq("id", docId).single();
        if (!doc || !doc.file_path) {
          await supabase.from("vdr_documents").update({ ingestion_status: "failed" }).eq("id", docId);
          results.push({ document_id: docId, status: "failed", chunks: 0 });
          continue;
        }

        // Download file from storage
        const { data: fileData, error: dlError } = await supabase.storage.from("vdr-files").download(doc.file_path);
        if (dlError || !fileData) {
          console.error("Download error:", dlError);
          await supabase.from("vdr_documents").update({ ingestion_status: "failed" }).eq("id", docId);
          results.push({ document_id: docId, status: "failed", chunks: 0 });
          continue;
        }

        const fileBytes = new Uint8Array(await fileData.arrayBuffer());
        const text = await extractText(fileBytes, doc.filename, doc.file_type || "");

        // Chunk the text
        const chunks = chunkText(text);
        if (chunks.length === 0) {
          await supabase.from("vdr_documents").update({ ingestion_status: "complete", chunk_count: 0 }).eq("id", docId);
          results.push({ document_id: docId, status: "complete", chunks: 0 });
          continue;
        }

        // Generate embeddings for each chunk using Lovable AI
        const chunkRecords: Array<{
          document_id: string;
          deal_id: string;
          company_id: string;
          chunk_index: number;
          chunk_text: string;
          embedding: number[] | null;
          metadata: Record<string, unknown>;
        }> = [];

        for (let i = 0; i < chunks.length; i++) {
          let embedding: number[] | null = null;
          
          try {
            const embResponse = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${lovableApiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "openai/text-embedding-3-small",
                input: chunks[i].substring(0, 8000),
              }),
            });

            if (embResponse.ok) {
              const embData = await embResponse.json();
              embedding = embData.data?.[0]?.embedding || null;
            } else {
              console.error("Embedding non-200 for chunk", i, embResponse.status, await embResponse.text());
            }
          } catch (e) {
            console.error("Embedding error for chunk", i, e);
          }

          chunkRecords.push({
            document_id: docId,
            deal_id: deal_id,
            company_id: doc.company_id,
            chunk_index: i,
            chunk_text: chunks[i],
            embedding,
            metadata: {
              filename: doc.filename,
              folder: doc.folder_path,
              chunk_of: chunks.length,
            },
          });
        }

        // Insert chunks
        if (chunkRecords.length > 0) {
          // Insert in batches of 20
          for (let b = 0; b < chunkRecords.length; b += 20) {
            const batch = chunkRecords.slice(b, b + 20);
            await supabase.from("vdr_document_chunks").insert(batch);
          }
        }

        // Use AI to extract entities and account tags
        let entityCount = 0;
        try {
          const sampleText = chunks.slice(0, 3).join("\n\n").substring(0, 4000);
          
          const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
                  content: "Extract entities and classify this document. Return JSON only.",
                },
                {
                  role: "user",
                  content: `Analyze this document excerpt from "${doc.filename}":\n\n${sampleText}\n\nReturn a JSON object with:\n1. "entities": array of {type, value, context} where type is one of: person, company, date, amount, facility, account_category\n2. "account_tags": array of {category, confidence} where category is one of: Revenue, COGS, SGA, Debt, Equity, Tax, Legal, Real_Estate, Insurance, IP, HR, IT, Environmental, Corporate\n\nReturn ONLY valid JSON, no markdown.`,
                },
              ],
              tools: [
                {
                  type: "function",
                  function: {
                    name: "extract_document_info",
                    description: "Extract entities and account tags from a document",
                    parameters: {
                      type: "object",
                      properties: {
                        entities: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              type: { type: "string" },
                              value: { type: "string" },
                              context: { type: "string" },
                            },
                            required: ["type", "value"],
                          },
                        },
                        account_tags: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              category: { type: "string" },
                              confidence: { type: "number" },
                            },
                            required: ["category", "confidence"],
                          },
                        },
                      },
                      required: ["entities", "account_tags"],
                    },
                  },
                },
              ],
              tool_choice: { type: "function", function: { name: "extract_document_info" } },
            }),
          });

          if (aiResponse.ok) {
            const aiData = await aiResponse.json();
            const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
            if (toolCall?.function?.arguments) {
              const parsed = JSON.parse(toolCall.function.arguments);

              // Insert entities
              if (parsed.entities?.length) {
                const entityRecords = parsed.entities.slice(0, 50).map((e: any) => ({
                  document_id: docId,
                  deal_id: deal_id,
                  entity_type: e.type,
                  entity_value: e.value,
                  context_snippet: e.context || null,
                }));
                await supabase.from("vdr_document_entities").insert(entityRecords);
                entityCount = entityRecords.length;
              }

              // Insert account tags
              if (parsed.account_tags?.length) {
                const tagRecords = parsed.account_tags.slice(0, 10).map((t: any) => ({
                  document_id: docId,
                  deal_id: deal_id,
                  account_category: t.category,
                  confidence_score: Math.min(1, Math.max(0, t.confidence || 0.5)),
                }));
                await supabase.from("vdr_document_account_tags").insert(tagRecords);
              }
            }
          }
        } catch (e) {
          console.error("Entity extraction error:", e);
        }

        // Update document status
        await supabase.from("vdr_documents").update({
          ingestion_status: "complete",
          chunk_count: chunkRecords.length,
          entity_count: entityCount,
        }).eq("id", docId);

        totalChunks += chunkRecords.length;
        results.push({ document_id: docId, status: "complete", chunks: chunkRecords.length });
      } catch (err) {
        console.error("Error processing document:", docId, err);
        await supabase.from("vdr_documents").update({ ingestion_status: "failed" }).eq("id", docId);
        results.push({ document_id: docId, status: "failed", chunks: 0 });
      }
    }

    return new Response(
      JSON.stringify({ status: "complete", documents_processed: results.length, total_chunks: totalChunks, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Ingest error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
