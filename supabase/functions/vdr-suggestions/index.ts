import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { callClaude } from '../_shared/claudeChat.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { deal_id } = await req.json();
    if (!deal_id) return new Response(JSON.stringify({ error: 'deal_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Grab a sample of chunks from key documents (financial, legal, corporate)
    const { data: chunks } = await supabase
      .from('vdr_document_chunks')
      .select('chunk_text, metadata')
      .eq('deal_id', deal_id)
      .limit(30);

    if (!chunks || chunks.length === 0) {
      return new Response(JSON.stringify({ suggestions: [
        'Summarize the latest financial statements',
        'What are the key risks in this deal?',
        'Compare revenue trends across years',
        'List all outstanding compliance items',
      ] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Also get account tags for context
    const { data: tags } = await supabase
      .from('vdr_document_account_tags')
      .select('account_category')
      .eq('deal_id', deal_id);

    const uniqueCategories = [...new Set((tags || []).map(t => (t as any).account_category))];
    const sampleText = chunks.slice(0, 15).map((c: any) => c.chunk_text.slice(0, 300)).join('\n---\n');

    const prompt = `You are an AI analyst for a private credit deal team. Based on the following document excerpts from a deal data room, generate exactly 5 insightful questions an analyst would ask. The deal covers these categories: ${uniqueCategories.join(', ') || 'general'}.

Document excerpts:
${sampleText}

Requirements:
- Questions should be specific to the actual content (reference real numbers, company names, or topics if visible)
- Cover different aspects: financials, risks, compliance, trends, key terms
- Each question should be 8-15 words
- Return as a JSON array of strings only, no other text

Example format: ["What is the total debt-to-EBITDA ratio?", "Summarize revenue growth from 2022-2024"]`;

    let content = '';
    try {
      const result = await callClaude({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        maxTokens: 500,
      });
      content = result.text;
    } catch (e: any) {
      console.error('vdr-suggestions claude error', e?.status, e?.message);
      return new Response(JSON.stringify({ suggestions: [
        'Summarize the latest financial statements',
        'What are the key risks in this deal?',
        'Compare revenue trends across years',
        'List all outstanding compliance items',
        'What is the debt structure?',
      ] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Parse JSON array from response
    const match = content.match(/\[[\s\S]*\]/);
    let suggestions: string[];
    try {
      suggestions = match ? JSON.parse(match[0]) : [];
    } catch {
      suggestions = [
        'Summarize the latest financial statements',
        'What are the key risks in this deal?',
        'Compare revenue trends across years',
        'List all outstanding compliance items',
        'What is the debt structure?',
      ];
    }

    return new Response(JSON.stringify({ suggestions: suggestions.slice(0, 5) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('vdr-suggestions error:', e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
