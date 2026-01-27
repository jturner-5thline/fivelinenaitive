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

interface ExtractedContent {
  text: string;
  pages?: { pageNumber: number; content: string }[];
  sheets?: { sheetName: string; content: string }[];
  slides?: { slideNumber: number; content: string }[];
}

// Extract text from PDF with page information
async function extractPdfText(arrayBuffer: ArrayBuffer): Promise<ExtractedContent> {
  try {
    const uint8Array = new Uint8Array(arrayBuffer);
    const result = await pdfParse.default(uint8Array);
    
    // Try to split by page markers if available
    const pages: { pageNumber: number; content: string }[] = [];
    const text = result.text || "";
    
    // Simple page splitting (pdf-parse doesn't give exact page breaks)
    // We'll approximate based on content length
    const avgPageLength = 3000;
    const numPages = result.numpages || Math.ceil(text.length / avgPageLength);
    
    if (numPages > 1) {
      const chunkSize = Math.ceil(text.length / numPages);
      for (let i = 0; i < numPages; i++) {
        const start = i * chunkSize;
        const end = Math.min((i + 1) * chunkSize, text.length);
        const pageContent = text.slice(start, end).trim();
        if (pageContent) {
          pages.push({ pageNumber: i + 1, content: pageContent });
        }
      }
    }
    
    return { text, pages: pages.length > 0 ? pages : undefined };
  } catch (error) {
    console.error("PDF extraction error:", error);
    return { text: "[PDF content could not be extracted]" };
  }
}

// Extract text from Word documents (.docx)
async function extractDocxText(arrayBuffer: ArrayBuffer): Promise<ExtractedContent> {
  try {
    const result = await mammoth.extractRawText({ arrayBuffer });
    return { text: result.value || "" };
  } catch (error) {
    console.error("DOCX extraction error:", error);
    return { text: "[Word document content could not be extracted]" };
  }
}

// Extract text from Excel files (.xlsx, .xls)
function extractExcelText(arrayBuffer: ArrayBuffer): ExtractedContent {
  try {
    const workbook = XLSX.read(arrayBuffer, { type: "array" });
    const sheets: { sheetName: string; content: string }[] = [];
    const allText: string[] = [];
    
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      sheets.push({ sheetName, content: csv });
      allText.push(`### Sheet: ${sheetName}\n${csv}`);
    }
    
    return { text: allText.join("\n\n"), sheets };
  } catch (error) {
    console.error("Excel extraction error:", error);
    return { text: "[Excel content could not be extracted]" };
  }
}

// Extract text from PowerPoint files (.pptx)
async function extractPptxText(arrayBuffer: ArrayBuffer): Promise<ExtractedContent> {
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const slides: { slideNumber: number; content: string }[] = [];
    const allText: string[] = [];
    
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
      // Extract text from XML
      const textMatches = slideXml.match(/<a:t>([^<]*)<\/a:t>/g) || [];
      const slideText = textMatches
        .map(match => match.replace(/<\/?a:t>/g, ""))
        .filter(text => text.trim())
        .join(" ");
      
      if (slideText.trim()) {
        const slideNum = parseInt(slideFile.match(/slide(\d+)/)?.[1] || "0");
        slides.push({ slideNumber: slideNum, content: slideText });
        allText.push(`Slide ${slideNum}: ${slideText}`);
      }
    }
    
    return { 
      text: allText.join("\n\n") || "[No text found in presentation]",
      slides: slides.length > 0 ? slides : undefined
    };
  } catch (error) {
    console.error("PPTX extraction error:", error);
    return { text: "[PowerPoint content could not be extracted]" };
  }
}

// Main content extraction function
async function extractContent(fileData: Blob, fileName: string): Promise<ExtractedContent> {
  const lowerName = fileName.toLowerCase();
  const arrayBuffer = await fileData.arrayBuffer();
  
  // Plain text files
  if (lowerName.endsWith(".txt") || lowerName.endsWith(".md") || lowerName.endsWith(".csv")) {
    return { text: await fileData.text() };
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
      return { text: JSON.stringify(JSON.parse(text), null, 2) };
    } catch {
      return { text: await fileData.text() };
    }
  }
  
  // Try to read as text for other formats
  try {
    const text = await fileData.text();
    const nonPrintable = (text.match(/[\x00-\x08\x0E-\x1F]/g) || []).length;
    if (nonPrintable / text.length > 0.1) {
      return { text: `[Binary file: ${fileName} - content type not supported]` };
    }
    return { text };
  } catch {
    return { text: `[Binary file: ${fileName}]` };
  }
}

// Build enhanced context with location references
function buildEnhancedContext(
  docName: string, 
  extracted: ExtractedContent
): string {
  let context = `### ${docName}\n`;
  
  if (extracted.pages && extracted.pages.length > 1) {
    // For PDFs with pages
    context += extracted.pages
      .map(p => `[Page ${p.pageNumber}]\n${p.content}`)
      .join("\n\n");
  } else if (extracted.sheets && extracted.sheets.length > 0) {
    // For Excel with sheets
    context += extracted.sheets
      .map(s => `[Sheet: ${s.sheetName}]\n${s.content}`)
      .join("\n\n");
  } else if (extracted.slides && extracted.slides.length > 0) {
    // For PowerPoint with slides
    context += extracted.slides
      .map(s => `[Slide ${s.slideNumber}]\n${s.content}`)
      .join("\n\n");
  } else {
    context += extracted.text;
  }
  
  return context;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, dealId, action } = await req.json();

    // Handle summarization action
    if (action === "summarize") {
      return await handleSummarize(dealId);
    }

    // Handle write-up extraction action
    if (action === "extract-writeup") {
      return await handleExtractWriteUp(dealId);
    }

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
    const documentContents: { 
      name: string; 
      content: string; 
      hasPages: boolean;
      hasSheets: boolean;
      hasSlides: boolean;
    }[] = [];
    
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

        const extracted = await extractContent(fileData, doc.name);
        
        if (extracted.text && !extracted.text.startsWith("[Binary file:")) {
          // Truncate very large documents to prevent context overflow
          const maxChars = 50000;
          const enhancedContent = buildEnhancedContext(doc.name, extracted);
          const truncatedContent = enhancedContent.length > maxChars 
            ? enhancedContent.substring(0, maxChars) + "\n...[Content truncated due to length]"
            : enhancedContent;
          
          documentContents.push({ 
            name: doc.name, 
            content: truncatedContent,
            hasPages: !!extracted.pages,
            hasSheets: !!extracted.sheets,
            hasSlides: !!extracted.slides,
          });
          console.log(`Successfully extracted ${truncatedContent.length} chars from ${doc.name}`);
        }
      } catch (err) {
        console.error(`Error processing ${doc.name}:`, err);
      }
    }

    // Build context from documents
    const documentContext = documentContents.length > 0
      ? documentContents.map(d => d.content).join("\n\n---\n\n")
      : "No documents have been uploaded yet.";

    // Build the system prompt with citation instructions
    const systemPrompt = `You are an AI assistant helping analyze deal-related documents. You have access to the following documents uploaded to this deal's space:

${documentContext}

Instructions:
- Answer questions based ONLY on the information in these documents
- If the answer isn't in the documents, say so clearly
- **CRITICAL: When citing information, ALWAYS include the specific location:**
  - For PDFs: mention the document name AND page number (e.g., "According to Financial Report.pdf, Page 3...")
  - For Excel files: mention the document name AND sheet name (e.g., "From Budget.xlsx, Sheet 'Q1 Revenue'...")
  - For PowerPoint: mention the document name AND slide number (e.g., "As shown in Pitch Deck.pptx, Slide 5...")
  - For other documents: mention the document name
- Be concise but thorough
- If asked about something not in the documents, acknowledge that and offer to help with what's available
- Format your responses clearly with bullet points or sections when appropriate
- For financial data or spreadsheets, summarize key figures and trends
- Always provide specific, verifiable citations so users can find the source`;

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

    // Extract source document names and locations mentioned in the response
    const sources: { name: string; location?: string }[] = [];
    for (const d of documentContents) {
      if (content.toLowerCase().includes(d.name.toLowerCase())) {
        const source: { name: string; location?: string } = { name: d.name };
        
        // Try to extract specific location references
        const pageMatch = content.match(new RegExp(`${d.name}[^.]*(?:Page|page)\\s*(\\d+)`, 'i'));
        const slideMatch = content.match(new RegExp(`${d.name}[^.]*(?:Slide|slide)\\s*(\\d+)`, 'i'));
        const sheetMatch = content.match(new RegExp(`${d.name}[^.]*(?:Sheet|sheet)[:\\s]*['"]?([^'"\\n,]+)['"]?`, 'i'));
        
        if (pageMatch) source.location = `Page ${pageMatch[1]}`;
        else if (slideMatch) source.location = `Slide ${slideMatch[1]}`;
        else if (sheetMatch) source.location = `Sheet: ${sheetMatch[1].trim()}`;
        
        sources.push(source);
      }
    }

    return new Response(
      JSON.stringify({ 
        content, 
        sources: sources.map(s => s.location ? `${s.name} (${s.location})` : s.name)
      }),
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

// Handle document summarization
async function handleSummarize(dealId: string) {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get documents from the deal space
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

    // Extract all document contents
    const allContents: string[] = [];
    for (const doc of documents) {
      try {
        const { data: fileData, error: downloadError } = await supabase.storage
          .from("deal-space")
          .download(doc.file_path);

        if (downloadError) continue;

        const extracted = await extractContent(fileData, doc.name);
        if (extracted.text && !extracted.text.startsWith("[Binary file:")) {
          allContents.push(`### ${doc.name}\n${extracted.text.substring(0, 20000)}`);
        }
      } catch (err) {
        console.error(`Error processing ${doc.name}:`, err);
      }
    }

    if (allContents.length === 0) {
      return new Response(
        JSON.stringify({ error: "Could not extract content from documents" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const combinedContent = allContents.join("\n\n---\n\n");

    // Call Lovable AI for summarization
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are an expert at summarizing deal documents. Create a comprehensive summary with the following structure:

## Executive Summary
A 2-3 paragraph overview of the deal.

## Key Points
- Bullet points of the most important information

## Financial Highlights
Key financial figures, terms, and metrics (if available)

## Risks & Concerns
Any potential issues or red flags identified

## Action Items
Any required next steps or pending items mentioned

Be concise but thorough. Only include sections that have relevant content from the documents.`
          },
          {
            role: "user",
            content: `Please summarize the following deal documents:\n\n${combinedContent}`
          }
        ],
      }),
    });

    if (!aiResponse.ok) {
      throw new Error("AI summarization failed");
    }

    const aiData = await aiResponse.json();
    const summary = aiData.choices?.[0]?.message?.content || "Could not generate summary.";

    // Extract key points
    const keyPointsMatch = summary.match(/## Key Points\n([\s\S]*?)(?=##|$)/);
    const keyPoints = keyPointsMatch 
      ? keyPointsMatch[1].split('\n')
          .filter((line: string) => line.trim().startsWith('-'))
          .map((line: string) => line.replace(/^-\s*/, '').trim())
      : [];

    return new Response(
      JSON.stringify({ 
        summary, 
        keyPoints,
        documentCount: documents.length
      }),
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

// Handle write-up data extraction
async function handleExtractWriteUp(dealId: string) {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get documents from the deal space
    const { data: documents, error: docsError } = await supabase
      .from("deal_space_documents")
      .select("id, name, file_path, content_type")
      .eq("deal_id", dealId);

    if (docsError) throw new Error("Failed to fetch documents");
    if (!documents || documents.length === 0) {
      return new Response(
        JSON.stringify({ error: "No documents to extract from", extractedFields: [] }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract all document contents with source tracking
    const documentContents: { name: string; content: string }[] = [];
    for (const doc of documents) {
      try {
        const { data: fileData, error: downloadError } = await supabase.storage
          .from("deal-space")
          .download(doc.file_path);

        if (downloadError) continue;

        const extracted = await extractContent(fileData, doc.name);
        if (extracted.text && !extracted.text.startsWith("[Binary file:")) {
          documentContents.push({
            name: doc.name,
            content: extracted.text.substring(0, 30000),
          });
        }
      } catch (err) {
        console.error(`Error processing ${doc.name}:`, err);
      }
    }

    if (documentContents.length === 0) {
      return new Response(
        JSON.stringify({ error: "Could not extract content from documents", extractedFields: [] }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const combinedContent = documentContents
      .map(d => `### Document: ${d.name}\n${d.content}`)
      .join("\n\n---\n\n");

    // Call Lovable AI for structured extraction
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const extractionPrompt = `You are an expert at extracting structured deal information from documents.
Analyze the following documents and extract any relevant information that could be used to fill out a deal write-up form.

The fields you should look for are:
- companyName: The company name
- companyUrl: Company website URL
- linkedinUrl: LinkedIn profile URL
- industries: List of industries (e.g., ["Technology", "Healthcare"])
- location: Company location/headquarters (US state, country, etc.)
- yearFounded: Year the company was founded
- headcount: Number of employees
- dealTypes: Types of deal (e.g., ["Growth Capital", "Acquisition"])
- billingModels: How the company charges (e.g., ["Subscription", "Usage-based"])
- profitability: One of "Profitable", "Break-even", "Pre-profit", or "Negative"
- grossMargins: Gross margin percentage (e.g., "75%")
- capitalAsk: Amount of capital being raised (e.g., "$5M" or "$5,000,000")
- useOfFunds: How the capital will be used
- existingDebtDetails: Information about existing debt
- description: Company overview/description (2-3 sentences)
- accountingSystem: Accounting software used (e.g., "QuickBooks", "NetSuite")
- companyHighlights: Array of key highlights, each with title and description
- keyItems: Array of key deal items, each with title and description

For each field you can extract, provide:
1. The field name (exactly as listed above)
2. The extracted value
3. A confidence level: "high" (explicitly stated), "medium" (inferred from context), or "low" (uncertain)
4. The source document name
5. The location in the document (page number, section, etc.) if available

Respond ONLY with a valid JSON object in this exact format:
{
  "extractedFields": [
    {
      "field": "companyName",
      "value": "TechCorp Inc",
      "confidence": "high",
      "source": "Pitch Deck.pdf",
      "sourceLocation": "Page 1"
    }
  ]
}

Only include fields where you found relevant information. Do not guess or make up values.
For array fields like industries, dealTypes, billingModels, provide arrays.
For companyHighlights and keyItems, provide arrays of objects with {id: "unique-id", title: "...", description: "..."}.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: extractionPrompt },
          { role: "user", content: `Extract deal write-up information from these documents:\n\n${combinedContent}` }
        ],
      }),
    });

    if (!aiResponse.ok) {
      throw new Error("AI extraction failed");
    }

    const aiData = await aiResponse.json();
    const responseContent = aiData.choices?.[0]?.message?.content || "{}";

    // Parse the JSON response
    let extractedData: { extractedFields: unknown[] } = { extractedFields: [] };
    try {
      // Remove markdown code blocks if present
      const cleanedContent = responseContent
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      extractedData = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError, responseContent);
      // Try to extract JSON from the response
      const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          extractedData = JSON.parse(jsonMatch[0]);
        } catch {
          console.error("Failed to extract JSON from response");
        }
      }
    }

    return new Response(
      JSON.stringify({
        extractedFields: extractedData.extractedFields || [],
        documentCount: documents.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Write-up extraction error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Extraction failed", extractedFields: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}
