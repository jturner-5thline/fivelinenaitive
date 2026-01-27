import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, dealId } = await req.json();

    if (!dealId || !messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "dealId and messages are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get documents from the deal space
    const { data: documents, error: docsError } = await supabase
      .from("deal_space_documents")
      .select("id, name, file_path, content_type")
      .eq("deal_id", dealId);

    if (docsError) {
      console.error("Error fetching documents:", docsError);
      throw new Error("Failed to fetch documents");
    }

    // Fetch document contents from storage
    const documentContents: { name: string; content: string }[] = [];
    
    for (const doc of documents || []) {
      try {
        const { data: fileData, error: downloadError } = await supabase.storage
          .from("deal-space")
          .download(doc.file_path);

        if (downloadError) {
          console.error(`Error downloading ${doc.name}:`, downloadError);
          continue;
        }

        // Extract text content based on file type
        let content = "";
        const fileName = doc.name.toLowerCase();
        
        if (fileName.endsWith(".txt") || fileName.endsWith(".md") || fileName.endsWith(".csv")) {
          content = await fileData.text();
        } else if (fileName.endsWith(".pdf")) {
          // For PDFs, we'd need a PDF parsing library
          // For now, note that the file exists but content needs parsing
          content = `[PDF document: ${doc.name} - Content extraction pending]`;
        } else if (fileName.endsWith(".docx") || fileName.endsWith(".doc")) {
          // For Word docs, we'd need a docx parsing library
          content = `[Word document: ${doc.name} - Content extraction pending]`;
        } else {
          // Try to read as text for other formats
          try {
            content = await fileData.text();
          } catch {
            content = `[Binary file: ${doc.name}]`;
          }
        }

        if (content) {
          documentContents.push({ name: doc.name, content });
        }
      } catch (err) {
        console.error(`Error processing ${doc.name}:`, err);
      }
    }

    // Build context from documents
    const documentContext = documentContents.length > 0
      ? documentContents.map(d => `### ${d.name}\n${d.content}`).join("\n\n---\n\n")
      : "No documents have been uploaded yet.";

    // Build the system prompt
    const systemPrompt = `You are an AI assistant helping analyze deal-related documents. You have access to the following documents uploaded to this deal's space:

${documentContext}

Instructions:
- Answer questions based ONLY on the information in these documents
- If the answer isn't in the documents, say so clearly
- When citing information, mention which document it came from
- Be concise but thorough
- If asked about something not in the documents, acknowledge that and offer to help with what's available
- Format your responses clearly with bullet points or sections when appropriate`;

    // Call Lovable AI
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error("AI API request failed");
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "I couldn't generate a response.";

    // Extract source document names mentioned in the response
    const sources = documentContents
      .filter(d => content.toLowerCase().includes(d.name.toLowerCase()))
      .map(d => d.name);

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
