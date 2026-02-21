import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { fileUrl, fileName } = await req.json();

    if (!fileUrl) {
      return new Response(JSON.stringify({ error: 'fileUrl is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ext = fileName?.split('.').pop()?.toLowerCase() || '';
    const isTextBased = ['txt', 'md', 'csv', 'json'].includes(ext);

    let textContent = '';

    if (isTextBased) {
      const res = await fetch(fileUrl);
      textContent = (await res.text()).slice(0, 15000);
    }

    const prompt = textContent
      ? `Analyze this document named "${fileName}":\n\n${textContent}\n\nProvide a concise summary with:\n1. **Document Type**: What kind of document this is\n2. **Key Information**: The most important facts, figures, and data points (bullet points)\n3. **Summary**: A 2-3 sentence overview\n\nKeep it concise and business-focused.`
      : `Based on the filename "${fileName}", provide your best assessment of:\n1. **Document Type**: What kind of document this likely is\n2. **Expected Contents**: What information this document likely contains (bullet points)\n3. **Relevance**: How this fits into a typical deal/transaction data room\n\nKeep it concise and business-focused. Note that this is an inference based on the filename only.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: "You are a document analyst specializing in financial deals and transactions. Provide concise, structured summaries. Use markdown formatting with bold headers and bullet points."
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI API error:", errText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content || 'Unable to generate summary.';

    return new Response(JSON.stringify({ summary, isInferred: !textContent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
