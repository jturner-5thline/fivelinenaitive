import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import * as pdfParse from "https://esm.sh/pdf-parse@1.1.1";
import mammoth from "https://esm.sh/mammoth@1.6.0";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Extract text from PDF
async function extractPdfText(arrayBuffer: ArrayBuffer): Promise<string> {
  try {
    const uint8Array = new Uint8Array(arrayBuffer);
    const result = await pdfParse.default(uint8Array);
    return result.text || "";
  } catch (error) {
    console.error("PDF extraction error:", error);
    return "[PDF content could not be extracted]";
  }
}

// Extract text from Word documents (.docx)
async function extractDocxText(arrayBuffer: ArrayBuffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value || "";
  } catch (error) {
    console.error("DOCX extraction error:", error);
    return "[Word document content could not be extracted]";
  }
}

// Extract text from Excel files (.xlsx, .xls)
function extractExcelText(arrayBuffer: ArrayBuffer): string {
  try {
    const workbook = XLSX.read(arrayBuffer, { type: "array" });
    const allText: string[] = [];
    
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      allText.push(`### Sheet: ${sheetName}\n${csv}`);
    }
    
    return allText.join("\n\n");
  } catch (error) {
    console.error("Excel extraction error:", error);
    return "[Excel content could not be extracted]";
  }
}

// Extract text from PowerPoint files (.pptx)
async function extractPptxText(arrayBuffer: ArrayBuffer): Promise<string> {
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const slideTexts: string[] = [];
    
    // Get all slide files
    const slideFiles = Object.keys(zip.files)
      .filter(name => name.match(/ppt\/slides\/slide\d+\.xml$/))
      .sort((a, b) => {
        const numA = parseInt(a.match(/slide(\d+)/)?.[1] || "0");
        const numB = parseInt(b.match(/slide(\d+)/)?.[1] || "0");
        return numA - numB;
      });
    
    for (const slideFile of slideFiles) {
      const slideXml = await zip.files[slideFile].async("string");
      // Extract text from XML - simple regex to get text content
      const textMatches = slideXml.match(/<a:t>([^<]*)<\/a:t>/g) || [];
      const slideText = textMatches
        .map(match => match.replace(/<\/?a:t>/g, ""))
        .filter(text => text.trim())
        .join(" ");
      
      if (slideText.trim()) {
        const slideNum = slideFile.match(/slide(\d+)/)?.[1] || "?";
        slideTexts.push(`Slide ${slideNum}: ${slideText}`);
      }
    }
    
    return slideTexts.join("\n\n") || "[No text found in presentation]";
  } catch (error) {
    console.error("PPTX extraction error:", error);
    return "[PowerPoint content could not be extracted]";
  }
}

// Main content extraction function
async function extractContent(fileData: Blob, fileName: string): Promise<string> {
  const lowerName = fileName.toLowerCase();
  const arrayBuffer = await fileData.arrayBuffer();
  
  // Plain text files
  if (lowerName.endsWith(".txt") || lowerName.endsWith(".md") || lowerName.endsWith(".csv")) {
    return await fileData.text();
  }
  
  // PDF files
  if (lowerName.endsWith(".pdf")) {
    return await extractPdfText(arrayBuffer);
  }
  
  // Word documents
  if (lowerName.endsWith(".docx")) {
    return await extractDocxText(arrayBuffer);
  }
  
  // Excel files
  if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
    return extractExcelText(arrayBuffer);
  }
  
  // PowerPoint files
  if (lowerName.endsWith(".pptx")) {
    return await extractPptxText(arrayBuffer);
  }
  
  // JSON files
  if (lowerName.endsWith(".json")) {
    try {
      const text = await fileData.text();
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return await fileData.text();
    }
  }
  
  // Try to read as text for other formats
  try {
    const text = await fileData.text();
    // Check if it looks like binary (has too many non-printable chars)
    const nonPrintable = (text.match(/[\x00-\x08\x0E-\x1F]/g) || []).length;
    if (nonPrintable / text.length > 0.1) {
      return `[Binary file: ${fileName} - content type not supported for text extraction]`;
    }
    return text;
  } catch {
    return `[Binary file: ${fileName}]`;
  }
}

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

    // Fetch document contents from storage and extract text
    const documentContents: { name: string; content: string }[] = [];
    
    for (const doc of documents || []) {
      try {
        console.log(`Processing document: ${doc.name}`);
        
        const { data: fileData, error: downloadError } = await supabase.storage
          .from("deal-space")
          .download(doc.file_path);

        if (downloadError) {
          console.error(`Error downloading ${doc.name}:`, downloadError);
          continue;
        }

        const content = await extractContent(fileData, doc.name);
        
        if (content && !content.startsWith("[Binary file:")) {
          // Truncate very large documents to prevent context overflow
          const maxChars = 50000;
          const truncatedContent = content.length > maxChars 
            ? content.substring(0, maxChars) + "\n...[Content truncated due to length]"
            : content;
          
          documentContents.push({ name: doc.name, content: truncatedContent });
          console.log(`Successfully extracted ${truncatedContent.length} chars from ${doc.name}`);
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
- Format your responses clearly with bullet points or sections when appropriate
- For financial data or spreadsheets, summarize key figures and trends`;

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
