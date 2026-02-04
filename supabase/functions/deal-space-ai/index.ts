import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

// Extract text from PDF - simple text extraction without pdf-parse
// This approach extracts readable text from the PDF binary
async function extractPdfText(arrayBuffer: ArrayBuffer): Promise<ExtractedContent> {
  try {
    const uint8Array = new Uint8Array(arrayBuffer);
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const rawText = decoder.decode(uint8Array);
    
    // Extract text between stream markers (common PDF text location)
    const textParts: string[] = [];
    
    // Method 1: Extract text from stream objects
    const streamMatches = rawText.matchAll(/stream\s*([\s\S]*?)endstream/g);
    for (const match of streamMatches) {
      const content = match[1];
      // Try to extract readable ASCII text
      const readable = content.replace(/[^\x20-\x7E\n\r\t]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (readable.length > 20 && !/^[\s\d\.\-\[\]\/]+$/.test(readable)) {
        textParts.push(readable);
      }
    }
    
    // Method 2: Extract text from BT/ET blocks (text objects)
    const textBlockMatches = rawText.matchAll(/BT\s*([\s\S]*?)ET/g);
    for (const match of textBlockMatches) {
      const content = match[1];
      // Extract text from Tj and TJ operators
      const tjMatches = content.matchAll(/\(([^)]*)\)\s*Tj/g);
      for (const tj of tjMatches) {
        const text = tj[1].replace(/\\(.)/g, '$1');
        if (text.length > 0) {
          textParts.push(text);
        }
      }
    }
    
    // Method 3: Look for plain text patterns
    const plainTextMatches = rawText.matchAll(/\(([A-Za-z][A-Za-z0-9\s,.\-:;'"!?@#$%&*()]{10,})\)/g);
    for (const match of plainTextMatches) {
      textParts.push(match[1]);
    }
    
    const extractedText = textParts.join(' ').replace(/\s+/g, ' ').trim();
    
    if (extractedText.length < 50) {
      return { text: "[PDF content - text extraction limited. Upload Word or text documents for better results.]" };
    }
    
    return { text: extractedText };
  } catch (error) {
    console.error("PDF extraction error:", error);
    return { text: "[PDF content could not be extracted - try uploading as Word or text format]" };
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

// Extract text from Excel files (.xlsx, .xls) using JSZip
async function extractExcelText(arrayBuffer: ArrayBuffer): Promise<ExtractedContent> {
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const sheets: { sheetName: string; content: string }[] = [];
    const allText: string[] = [];
    
    // Get workbook.xml to find sheet names
    const workbookFile = zip.file("xl/workbook.xml");
    if (!workbookFile) {
      return { text: "[Excel content could not be extracted - invalid format]" };
    }
    
    const workbookXml = await workbookFile.async("string");
    
    // Extract sheet names from workbook.xml
    const sheetMatches = workbookXml.matchAll(/<sheet[^>]*name="([^"]*)"[^>]*sheetId="(\d+)"/g);
    const sheetNames: string[] = [];
    for (const match of sheetMatches) {
      sheetNames.push(match[1]);
    }
    
    // Get shared strings (cell values are often stored here)
    let sharedStrings: string[] = [];
    const sharedStringsFile = zip.file("xl/sharedStrings.xml");
    if (sharedStringsFile) {
      const sharedStringsXml = await sharedStringsFile.async("string");
      // Extract text from shared strings
      const stringMatches = sharedStringsXml.matchAll(/<t[^>]*>([^<]*)<\/t>/g);
      for (const match of stringMatches) {
        sharedStrings.push(match[1]);
      }
    }
    
    // Process each sheet
    for (let i = 0; i < sheetNames.length; i++) {
      const sheetFile = zip.file(`xl/worksheets/sheet${i + 1}.xml`);
      if (!sheetFile) continue;
      
      const sheetXml = await sheetFile.async("string");
      const cellValues: string[] = [];
      
      // Extract cell values
      // Match cells with inline values (<v> tags)
      const cellMatches = sheetXml.matchAll(/<c[^>]*>.*?<v>([^<]*)<\/v>.*?<\/c>/gs);
      for (const match of cellMatches) {
        const fullCell = match[0];
        const value = match[1];
        
        // Check if it's a shared string reference (t="s")
        if (fullCell.includes('t="s"')) {
          const index = parseInt(value);
          if (!isNaN(index) && index < sharedStrings.length) {
            cellValues.push(sharedStrings[index]);
          }
        } else {
          cellValues.push(value);
        }
      }
      
      // Also extract inline strings
      const inlineMatches = sheetXml.matchAll(/<is>.*?<t>([^<]*)<\/t>.*?<\/is>/gs);
      for (const match of inlineMatches) {
        cellValues.push(match[1]);
      }
      
      const sheetContent = cellValues.join(", ");
      if (sheetContent.trim()) {
        sheets.push({ sheetName: sheetNames[i] || `Sheet${i + 1}`, content: sheetContent });
        allText.push(`### Sheet: ${sheetNames[i] || `Sheet${i + 1}`}\n${sheetContent}`);
      }
    }
    
    if (sheets.length === 0) {
      return { text: "[Excel file appears to be empty]" };
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
    return await extractExcelText(arrayBuffer);
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
      const errorText = await aiResponse.text();
      console.error("AI summarization error:", aiResponse.status, errorText);
      throw new Error("Failed to generate summary");
    }

    const aiData = await aiResponse.json();
    const summary = aiData.choices?.[0]?.message?.content || "Could not generate summary.";

    // Extract key points from the summary
    const keyPointsMatch = summary.match(/## Key Points\n([\s\S]*?)(?=\n##|$)/);
    const keyPoints: string[] = [];
    if (keyPointsMatch) {
      const points = keyPointsMatch[1].match(/^[-•]\s*(.+)$/gm);
      if (points) {
        keyPoints.push(...points.map((p: string) => p.replace(/^[-•]\s*/, '').trim()));
      }
    }

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

// Handle write-up extraction
async function handleExtractWriteUp(dealId: string) {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get documents from deal space documents AND financials
    const [docsResult, financialsResult] = await Promise.all([
      supabase
        .from("deal_space_documents")
        .select("id, name, file_path, content_type")
        .eq("deal_id", dealId),
      supabase
        .from("deal_space_financials")
        .select("id, name, file_path, content_type")
        .eq("deal_id", dealId)
    ]);

    const documents = docsResult.data || [];
    const financials = financialsResult.data || [];
    const allDocs = [...documents, ...financials];

    if (allDocs.length === 0) {
      return new Response(
        JSON.stringify({ 
          extractedFields: [],
          documentCount: 0,
          error: "No documents to analyze" 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract all document contents
    const allContents: { name: string; content: string }[] = [];
    for (const doc of allDocs) {
      try {
        const { data: fileData, error: downloadError } = await supabase.storage
          .from("deal-space")
          .download(doc.file_path);

        if (downloadError) continue;

        const extracted = await extractContent(fileData, doc.name);
        if (extracted.text && !extracted.text.startsWith("[Binary file:")) {
          allContents.push({ 
            name: doc.name, 
            content: extracted.text.substring(0, 30000) 
          });
        }
      } catch (err) {
        console.error(`Error processing ${doc.name}:`, err);
      }
    }

    if (allContents.length === 0) {
      return new Response(
        JSON.stringify({ 
          extractedFields: [],
          documentCount: allDocs.length,
          error: "Could not extract content from documents" 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const combinedContent = allContents.map(d => `### ${d.name}\n${d.content}`).join("\n\n---\n\n");

    // Call Lovable AI for write-up extraction
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
            content: `You are an expert at extracting structured deal information from documents. Extract information and return it as a JSON array of extracted fields.

Each field should have:
- "field": the field name (use exact names from the list below)
- "value": the extracted value
- "confidence": "high", "medium", or "low" based on how certain you are
- "source": the document name where you found this
- "sourceLocation": specific location like "Page 3" or "Slide 5" (if applicable)

Valid field names:
- companyName, companyUrl, linkedinUrl, industries (array of strings)
- location, yearFounded, headcount
- dealTypes (array of strings), billingModels (array of strings)
- profitability, grossMargins, capitalAsk, useOfFunds
- existingDebtDetails, accountingSystem
- description (Company Overview - a comprehensive summary of what the company does, their business model, products/services, and value proposition. This is critical - look for executive summaries, about sections, or business descriptions.)
- companyHighlights (array of {id, title, description})
- keyItems (array of {id, title, description})

Return ONLY a valid JSON array. Example:
[
  {"field": "companyName", "value": "Acme Corp", "confidence": "high", "source": "Pitch Deck.pdf", "sourceLocation": "Slide 1"},
  {"field": "capitalAsk", "value": "$5M", "confidence": "medium", "source": "Term Sheet.docx"}
]

Only extract fields where you find clear evidence. Skip fields with no data.`
          },
          {
            role: "user",
            content: `Extract deal write-up information from these documents:\n\n${combinedContent}`
          }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI extraction error:", aiResponse.status, errorText);
      throw new Error("Failed to extract write-up");
    }

    const aiData = await aiResponse.json();
    let extractedContent = aiData.choices?.[0]?.message?.content || "[]";
    
    // Clean up the response - remove markdown code blocks if present
    extractedContent = extractedContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    let extractedFields = [];
    try {
      extractedFields = JSON.parse(extractedContent);
      if (!Array.isArray(extractedFields)) {
        extractedFields = [];
      }
    } catch (e) {
      console.error("Failed to parse extracted data:", e, extractedContent);
      extractedFields = [];
    }

    return new Response(
      JSON.stringify({ 
        extractedFields,
        documentCount: allDocs.length
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Write-up extraction error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Extraction failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}
